import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { resolveTenantBoundSecret } from "@/server/credentials/tenant-bound";
import { ProviderDeliveryError, type WhatsAppProvider, type WhatsAppSender, type WhatsAppApprovedTemplate } from "./provider";

const digits = z.string().regex(/^[0-9]{5,32}$/);
const messageId = z.string().trim().min(1).max(255);
const mediaSchema = z.object({ id: z.string().regex(/^[0-9]{1,64}$/), mime_type: z.string().max(120), sha256: z.string().max(120).optional(), voice: z.boolean().optional(), caption: z.string().max(4000).optional() });
const inboundSchema = z.object({
  from: digits, id: messageId, type: z.string().min(1).max(50), timestamp: z.string().regex(/^[0-9]{1,12}$/).optional(),
  text: z.object({ body: z.string().min(1).max(65536) }).optional(),
  button: z.object({ text: z.string().max(4000), payload: z.string().max(4000).optional() }).optional(),
  interactive: z.object({ type: z.string(), button_reply: z.object({ id: z.string().max(255), title: z.string().max(4000) }).optional(), list_reply: z.object({ id: z.string().max(255), title: z.string().max(4000) }).optional() }).optional(),
  image: mediaSchema.optional(), document: mediaSchema.optional(), audio: mediaSchema.optional(), video: mediaSchema.optional(),
}).passthrough();
const statusSchema = z.object({ id: messageId, status: z.string().max(50), errors: z.array(z.object({ code: z.union([z.number(), z.string()]).optional() }).passthrough()).optional() });
const webhookSchema = z.object({ object: z.literal("whatsapp_business_account"), entry: z.array(z.object({ changes: z.array(z.object({ field: z.string(), value: z.record(z.string(), z.unknown()) })).max(100) }).passthrough()).max(100) });
export type MetaInboundTextEvent = {
  externalSenderId: string; customerWaId: string; customerName: string; providerMessageId: string; body: string;
  occurredAt?: string; contentKind?: "text" | "interactive" | "image" | "document" | "audio" | "video";
  media?: { id: string; mimeType: string; voice: boolean; sha256?: string };
};
export type MetaDeliveryEvent = { externalSenderId: string; providerMessageId: string; status: "sent" | "delivered" | "read" | "failed"; errorCode: string | null };
function safeEqual(left: string, right: string) { const a = Buffer.from(left), b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
export function verifyMetaWebhookChallenge(mode: string | null, token: string | null, configuredToken: string | undefined) { return mode === "subscribe" && !!token && !!configuredToken && safeEqual(token, configuredToken); }
export function verifyMetaWebhookSignature(rawBody: string | Uint8Array, signature: string | null, appSecret: string | undefined) {
  return !!signature && !!appSecret && /^sha256=[a-f0-9]{64}$/.test(signature) && safeEqual(signature, "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex"));
}
function canonicalText(body: string) { const value = body.trim(); return value.length <= 4000 ? value : value.slice(0, 3980) + "… [truncated]"; }
export function parseMetaWebhook(input: unknown): { messages: MetaInboundTextEvent[]; statuses: MetaDeliveryEvent[] } {
  const parsed = webhookSchema.parse(input), messages: MetaInboundTextEvent[] = [], statuses: MetaDeliveryEvent[] = [];
  for (const entry of parsed.entry) for (const change of entry.changes) {
    if (change.field !== "messages") continue;
    const value = z.object({ metadata: z.object({ phone_number_id: digits }).optional(), contacts: z.array(z.object({ wa_id: digits, profile: z.object({ name: z.string().max(300).optional() }).optional() })).optional(), messages: z.array(z.unknown()).max(100).optional(), statuses: z.array(z.unknown()).max(100).optional() }).parse(change.value);
    const senderId = value.metadata?.phone_number_id;
    if (!senderId) continue;
    const names = new Map((value.contacts ?? []).map(c => [c.wa_id, c.profile?.name?.trim() ?? ""]));
    for (const raw of value.messages ?? []) {
      const type = z.object({ type: z.string() }).parse(raw).type;
      if (!["text", "button", "interactive", "image", "document", "audio", "video"].includes(type)) continue;
      const m = inboundSchema.parse(raw);
      let body = "", kind: MetaInboundTextEvent["contentKind"] = "text", media: MetaInboundTextEvent["media"];
      if (m.type === "text") body = m.text?.body ?? "";
      else if (m.type === "button" || m.type === "interactive") { body = m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? ""; kind = "interactive"; }
      else if (["image", "document", "audio", "video"].includes(m.type)) {
        kind = m.type as "image" | "document" | "audio" | "video";
        const attachment = m[kind]; if (!attachment) continue;
        media = { id: attachment.id, mimeType: attachment.mime_type, voice: attachment.voice ?? false, ...(attachment.sha256 ? { sha256: attachment.sha256 } : {}) };
        body = `[${attachment.voice ? "Voice note" : kind}]` + (attachment.caption ? ` ${attachment.caption}` : "");
      } else continue;
      if (!body.trim()) continue;
      const event: MetaInboundTextEvent = { externalSenderId: senderId, customerWaId: m.from, customerName: names.get(m.from) ?? "", providerMessageId: m.id, body: canonicalText(body) };
      if (m.timestamp) { const date = new Date(Number(m.timestamp) * 1000); if (!Number.isFinite(date.getTime())) throw new Error("meta_invalid_timestamp"); event.occurredAt = date.toISOString(); }
      if (kind !== "text") event.contentKind = kind;
      if (media) event.media = media;
      messages.push(event);
    }
    for (const raw of value.statuses ?? []) {
      const s = statusSchema.parse(raw); if (!["sent", "delivered", "read", "failed"].includes(s.status)) continue;
      statuses.push({ externalSenderId: senderId, providerMessageId: s.id, status: s.status as MetaDeliveryEvent["status"], errorCode: s.errors?.[0]?.code == null ? null : String(s.errors[0].code).slice(0, 100) });
    }
  }
  return { messages, statuses };
}
function metaAccessToken(input: WhatsAppSender, accountId?: string) {
  return resolveTenantBoundSecret({ raw: process.env.WHATSAPP_META_CREDENTIALS_JSON, credentialKey: input.credentialKey, label: "WhatsApp", minimumSecretLength: 20, expected: { businessId: input.businessId, provider: "meta_whatsapp_cloud", environment: input.providerEnvironment, expectedMetadata: { externalSenderId: input.externalSenderId, ...(accountId ? { externalAccountId: accountId } : {}) } } });
}
export function metaGraphVersion() { const version = process.env.WHATSAPP_META_GRAPH_API_VERSION; if (!version || !/^v[0-9]+\.[0-9]+$/.test(version)) throw new Error("WhatsApp Graph API version is not configured."); return version; }
export function metaWebhookConfigured() { return !!process.env.WHATSAPP_META_APP_SECRET && !!process.env.WHATSAPP_META_VERIFY_TOKEN; }
export function createMetaWhatsAppProvider(fetcher: typeof fetch = fetch): WhatsAppProvider {
  async function request(input: WhatsAppSender, path: string, body?: unknown) {
    if (!digits.safeParse(input.externalSenderId).success) throw new ProviderDeliveryError("invalid_sender");
    const token = metaAccessToken(input);
    const response = await fetcher(`https://graph.facebook.com/${metaGraphVersion()}/${path}`, { method: body === undefined ? "GET" : "POST", redirect: "error", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
    let payload: unknown = null; try { payload = await response.json(); } catch { /* keep provider details private */ }
    if (!response.ok) {
      const code = z.object({ error: z.object({ code: z.union([z.number(), z.string().regex(/^[a-zA-Z0-9_]{1,60}$/)]) }) }).safeParse(payload);
      throw new ProviderDeliveryError(response.status === 429 ? "meta_rate_limited" : `meta_${code.success ? code.data.error.code : response.status}`);
    }
    return payload;
  }
  async function send(input: WhatsAppSender & { recipient: string }, payload: object) {
    if (!digits.safeParse(input.recipient).success) throw new ProviderDeliveryError("invalid_recipient");
    const result = z.object({ messages: z.array(z.object({ id: messageId })).min(1) }).safeParse(await request(input, `${input.externalSenderId}/messages`, { messaging_product: "whatsapp", recipient_type: "individual", to: input.recipient, ...payload }));
    if (!result.success) throw new ProviderDeliveryError("meta_invalid_response"); return { providerMessageId: result.data.messages[0]!.id };
  }
  return {
    id: "meta_whatsapp_cloud",
    sendText(input) { z.string().trim().min(1).max(4000).parse(input.body); return send(input, { type: "text", text: { preview_url: false, body: input.body } }); },
    sendTemplate(input) {
      z.string().regex(/^[a-z0-9_]{1,512}$/).parse(input.name); z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/).parse(input.language); z.array(z.string().max(1000)).max(20).parse(input.parameters);
      return send(input, { type: "template", template: { name: input.name, language: { code: input.language }, ...(input.parameters.length ? { components: [{ type: "body", parameters: input.parameters.map(text => ({ type: "text", text })) }] } : {}) } });
    },
    sendInteractiveMessage(input) {
      z.string().min(1).max(1024).parse(input.body); z.array(z.object({ id: z.string().min(1).max(256), title: z.string().min(1).max(20) })).min(1).max(3).parse(input.buttons);
      return send(input, { type: "interactive", interactive: { type: "button", body: { text: input.body }, action: { buttons: input.buttons.map(reply => ({ type: "reply", reply })) } } });
    },
    sendMedia(input) { z.string().regex(/^[0-9]{1,64}$/).parse(input.mediaId); if (input.caption) z.string().max(1024).parse(input.caption); return send(input, { type: input.type, [input.type]: { id: input.mediaId, ...(input.caption && input.type !== "audio" ? { caption: input.caption } : {}) } }); },
    async markAsRead(input) { messageId.parse(input.providerMessageId); await request(input, `${input.externalSenderId}/messages`, { messaging_product: "whatsapp", status: "read", message_id: input.providerMessageId }); },
    async healthCheck(input) { const result = z.object({ id: digits }).safeParse(await request(input, `${input.externalSenderId}?fields=id`)); return { connected: result.success && result.data.id === input.externalSenderId }; },
    async listTemplates(input) {
      metaAccessToken(input, input.accountId);
      digits.parse(input.accountId); const templates: WhatsAppApprovedTemplate[] = []; let cursor: string | undefined;
      for (let page = 0; page < 10; page++) {
        const result = z.object({ data: z.array(z.object({ name: z.string(), language: z.string(), category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]), status: z.string(), components: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })), paging: z.object({ next: z.string().optional(), cursors: z.object({ after: z.string().optional() }).optional() }).optional() }).parse(await request(input, `${input.accountId}/message_templates?limit=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`));
        templates.push(...result.data.map(t => ({ name: t.name, language: t.language, category: t.category, status: t.status, body: t.components?.find(c => c.type === "BODY")?.text ?? "" })));
        if (!result.paging?.next) return templates; cursor = result.paging.cursors?.after; if (!cursor) break;
      }
      throw new ProviderDeliveryError("meta_template_page_limit");
    },
    async downloadMedia(input) {
      z.string().regex(/^[0-9]{1,64}$/).parse(input.mediaId); const max = Math.min(input.maxBytes, 16 * 1024 * 1024); if (max <= 0) throw new ProviderDeliveryError("media_size_invalid");
      const meta = z.object({ url: z.string().url(), mime_type: z.string(), file_size: z.number().nonnegative(), id: z.string() }).parse(await request(input, input.mediaId)); const url = new URL(meta.url);
      if (meta.id !== input.mediaId || url.protocol !== "https:" || url.username || url.password || !["lookaside.fbsbx.com", "lookaside.facebook.com"].includes(url.hostname) || meta.file_size > max || !/^(image\/(jpeg|png)|application\/pdf|audio\/(ogg|mpeg|mp4|aac|amr)|video\/mp4)$/.test(meta.mime_type)) throw new ProviderDeliveryError("media_not_allowed");
      const response = await fetcher(url, { headers: { Authorization: `Bearer ${metaAccessToken(input)}` }, redirect: "error", signal: AbortSignal.timeout(10_000) }); if (!response.ok || !response.body) throw new ProviderDeliveryError("media_unavailable");
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > max) throw new ProviderDeliveryError("media_too_large"); chunks.push(part.value); } } finally { await reader.cancel(); }
      return { bytes: Buffer.concat(chunks), mimeType: meta.mime_type };
    },
  };
}
