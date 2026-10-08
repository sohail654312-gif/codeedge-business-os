import "server-only";
import type { DeliveryStatus } from "@/modules/contact-me/conversations/domain";
import { withCommunicationCapability } from "./capability";
import { getTextCommunicationProvider } from "./registry";
import { dispatchPreparedExternalMessage } from "./orchestration";
import type { MetaInboundTextEvent } from "./meta-whatsapp";
import type { WhatsAppApprovedTemplate, WhatsAppSender } from "./provider";
import { assertCommunicationExternalEffectAllowed } from "./execution";
import { z } from "zod";

export function whatsappLog(event: string, ids: { businessId?: string; messageId?: string; conversationId?: string; code?: string } = {}) {
  // Explicit allowlist: no message content, phone numbers, tokens or provider response bodies.
  console.info(JSON.stringify({ component: "whatsapp", event, ...ids }));
}
export async function receiveWhatsAppText(input: MetaInboundTextEvent) {
  const row = await withCommunicationCapability(async db => {
    const result = await db.query<{ conversation_id: string; message_id: string; inserted: boolean }>(
      "select * from public.whatsapp_receive_message($1,$2,$3,$4,$5,$6,$7,$8)",
      [input.externalSenderId,input.customerWaId,input.customerName,input.providerMessageId,input.body,input.occurredAt ?? null,input.contentKind ?? "text",input.media ?? {}]);
    return result.rows[0] ?? null;
  });
  if (row) whatsappLog(row.inserted ? "message_processed" : "duplicate_skipped", { conversationId: row.conversation_id, messageId: row.message_id });
  return row;
}
export async function updateWhatsAppDelivery(input: { externalSenderId: string; providerMessageId: string; status: Exclude<DeliveryStatus,"sending">; errorCode: string | null }) {
  return withCommunicationCapability(async db => {
    await db.query("select public.whatsapp_update_delivery_scoped($1,$2,$3,$4)", [input.externalSenderId,input.providerMessageId,input.status,input.errorCode]);
  });
}
export type WhatsAppReplyInput = { businessId: string; conversationId: string; userId: string; requestId: string; body: string; automatic?: boolean; epoch?: number };
const templateSchema = z.object({ name: z.string().regex(/^[a-z0-9_]{1,512}$/), language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/), parameters: z.array(z.string().max(1000)).max(20) }).strict();
export async function sendWhatsAppTemplate(input: WhatsAppReplyInput & { template: z.infer<typeof templateSchema> }) {
  return sendWhatsAppMessage(input, "template", templateSchema.parse(input.template));
}
export function sendWhatsAppReply(input: WhatsAppReplyInput) { return sendWhatsAppMessage(input, "text", {}); }
async function sendWhatsAppMessage(input: WhatsAppReplyInput, kind: "text" | "template", payload: Record<string,unknown>) {
  const prepared = await withCommunicationCapability(async db => {
    const result = await db.query<{ message_id: string; connection_id: string; provider: string; external_sender_id: string; credential_key: string; recipient: string; delivery_status: DeliveryStatus; created: boolean }>(
      "select * from public.whatsapp_prepare_message($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [input.businessId,input.conversationId,input.userId,input.requestId,input.body,kind,payload,input.automatic ?? false,input.epoch ?? null]);
    if (!result.rows[0]) throw new Error("WhatsApp delivery could not be prepared.");
    return result.rows[0];
  });
  return dispatchPreparedExternalMessage({ channel: "whatsapp", prepared,
    successfulExistingStatuses: ["sent","delivered","read"], failedExistingStatuses: ["failed"], previousFailureMessage: "The previous WhatsApp delivery attempt failed.", deliveryFailureMessage: "WhatsApp delivery failed.",
    send: async context => {
      // Recheck immediately before network delivery, after AI generation and outbox preparation.
      await withCommunicationCapability(db => db.query("select public.whatsapp_authorize_dispatch($1)",[prepared.message_id]));
      const sender = { businessId: context.businessId,providerEnvironment: context.providerEnvironment,externalSenderId: prepared.external_sender_id,credentialKey: prepared.credential_key,recipient: prepared.recipient };
      const provider = getTextCommunicationProvider(prepared.provider);
      return kind === "template" ? provider.sendTemplate({ ...sender,...templateSchema.parse(payload) }) : provider.sendText({ ...sender,body: input.body });
    },
    complete: async result => {
      await withCommunicationCapability(db => db.query("select public.whatsapp_complete_outbound($1,$2)",[prepared.message_id,result.providerMessageId]));
      whatsappLog(input.automatic ? "ai_reply_sent" : "reply_sent", { businessId: input.businessId,messageId: prepared.message_id,conversationId: input.conversationId });
    },
    fail: async errorCode => {
      await withCommunicationCapability(db => db.query("select public.whatsapp_fail_outbound($1,$2)",[prepared.message_id,errorCode]));
      whatsappLog("delivery_failed", { businessId: input.businessId,messageId: prepared.message_id,code: errorCode });
    }, statusFromResult: () => "sent",
  });
}
export async function setWhatsAppControl(input: { businessId: string; conversationId: string; userId: string; state: "automatic" | "human"; reason?: string }) {
  const result = await withCommunicationCapability(db => db.query<{ changed: boolean }>("select public.whatsapp_set_control($1,$2,$3,$4,$5) as changed",[input.businessId,input.conversationId,input.userId,input.state,input.reason ?? "staff_takeover"]));
  if (!result.rows[0]?.changed) throw new Error("Conversation unavailable.");
  whatsappLog(input.state === "human" ? "human_handoff" : "automation_resumed", { businessId: input.businessId,conversationId: input.conversationId });
}
export async function recordWhatsAppConsent(input: { businessId: string; conversationId: string; userId: string; consent: boolean; source: string }) {
  const result = await withCommunicationCapability(db => db.query<{ changed: boolean }>("select public.whatsapp_record_consent($1,$2,$3,$4,$5) as changed",[input.businessId,input.conversationId,input.userId,input.source,input.consent]));
  if (!result.rows[0]?.changed) throw new Error("Consent unavailable.");
}
export async function refreshWhatsAppTemplates(businessId: string,userId: string) {
  const result = await withCommunicationCapability(db => db.query<{ config: unknown }>("select public.whatsapp_connection_context($1,$2) as config",[businessId,userId]));
  const config = z.object({ business_id: z.string().uuid(),external_sender_id: z.string(),external_account_id: z.string().regex(/^[0-9]{5,32}$/),credential_key: z.string(),credential_environment: z.enum(["sandbox","production"]),execution_mode: z.enum(["demo","sandbox","production"]) }).parse(result.rows[0]?.config);
  assertCommunicationExternalEffectAllowed({ businessId,executionMode: config.execution_mode,providerEnvironment: config.credential_environment,action: "communication.send",channel: "whatsapp",provider: "meta_whatsapp_cloud",correlationId: null,simulated: false });
  const sender: WhatsAppSender = { businessId: config.business_id,externalSenderId: config.external_sender_id,credentialKey: config.credential_key,providerEnvironment: config.credential_environment };
  const templates: WhatsAppApprovedTemplate[] = await getTextCommunicationProvider("meta_whatsapp_cloud").listTemplates({ ...sender,accountId: config.external_account_id });
  const saved = await withCommunicationCapability(db => db.query<{ saved: boolean }>("select public.whatsapp_cache_templates($1,$2,$3,$4,$5) as saved",[businessId,userId,config.external_sender_id,config.external_account_id,JSON.stringify(templates)]));
  if (!saved.rows[0]?.saved) throw new Error("Connection changed during template refresh.");
  return templates.length;
}
