import "server-only";

import type { DeliveryStatus } from "@/modules/contact-me/conversations/domain";
import { withCommunicationCapability } from "./capability";
import { getTextCommunicationProvider } from "./registry";
import { dispatchPreparedExternalMessage } from "./orchestration";

type PreparedOutbound = {
  message_id: string;
  connection_id: string;
  provider: string;
  external_sender_id: string;
  credential_key: string;
  recipient: string;
  delivery_status: DeliveryStatus;
  created: boolean;
};

export async function receiveWhatsAppText(input: {
  externalSenderId: string;
  customerWaId: string;
  customerName: string;
  providerMessageId: string;
  body: string;
}) {
  return withCommunicationCapability(async (db) => {
    const result = await db.query<{
      conversation_id: string;
      message_id: string;
      inserted: boolean;
    }>(
      "select * from public.whatsapp_receive_text($1,$2,$3,$4,$5)",
      [
        input.externalSenderId,
        input.customerWaId,
        input.customerName,
        input.providerMessageId,
        input.body,
      ],
    );
    return result.rows[0] ?? null;
  });
}

export async function updateWhatsAppDelivery(input: {
  providerMessageId: string;
  status: Exclude<DeliveryStatus, "sending">;
  errorCode: string | null;
}) {
  return withCommunicationCapability(async (db) => {
    await db.query(
      "select public.whatsapp_update_delivery($1,$2,$3)",
      [input.providerMessageId, input.status, input.errorCode],
    );
  });
}

async function prepareWhatsAppReply(input: {
  businessId: string;
  conversationId: string;
  userId: string;
  requestId: string;
  body: string;
}) {
  return withCommunicationCapability(async (db) => {
    const result = await db.query<PreparedOutbound>(
      "select * from public.whatsapp_prepare_outbound($1,$2,$3,$4,$5)",
      [
        input.businessId,
        input.conversationId,
        input.userId,
        input.requestId,
        input.body,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error("WhatsApp delivery could not be prepared.");
    return row;
  });
}

export async function sendWhatsAppReply(input: {
  businessId: string;
  conversationId: string;
  userId: string;
  requestId: string;
  body: string;
}) {
  const prepared = await prepareWhatsAppReply(input);

  return dispatchPreparedExternalMessage({
    channel: "whatsapp",
    prepared,
    successfulExistingStatuses: ["sent", "delivered", "read"],
    failedExistingStatuses: ["failed"],
    previousFailureMessage: "The previous WhatsApp delivery attempt failed.",
    deliveryFailureMessage: "WhatsApp delivery failed.",
    send: () => getTextCommunicationProvider(prepared.provider).sendText({
      externalSenderId: prepared.external_sender_id,
      credentialKey: prepared.credential_key,
      recipient: prepared.recipient,
      body: input.body,
    }),
    complete: async (result) => {
      await withCommunicationCapability(async (db) => {
        await db.query(
          "select public.whatsapp_complete_outbound($1,$2)",
          [prepared.message_id, result.providerMessageId],
        );
      });
    },
    fail: async (errorCode) => {
      await withCommunicationCapability(async (db) => {
        await db.query(
          "select public.whatsapp_fail_outbound($1,$2)",
          [prepared.message_id, errorCode],
        );
      });
    },
    statusFromResult: () => "sent",
  });
}
