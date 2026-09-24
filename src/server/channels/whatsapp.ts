import "server-only";

import type { DeliveryStatus } from "@/modules/contact-me/conversations/domain";
import { withCommunicationCapability } from "./capability";
import { getTextCommunicationProvider } from "./registry";
import { ProviderDeliveryError } from "./provider";

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

  if (!prepared.created) {
    if (["sent", "delivered", "read"].includes(prepared.delivery_status)) {
      return { messageId: prepared.message_id, status: prepared.delivery_status };
    }
    if (prepared.delivery_status === "failed") {
      throw new Error("The previous WhatsApp delivery attempt failed.");
    }
    return { messageId: prepared.message_id, status: prepared.delivery_status };
  }

  const provider = getTextCommunicationProvider(prepared.provider);
  let providerMessageId: string;

  try {
    const result = await provider.sendText({
      externalSenderId: prepared.external_sender_id,
      credentialKey: prepared.credential_key,
      recipient: prepared.recipient,
      body: input.body,
    });
    providerMessageId = result.providerMessageId;
  } catch (error) {
    const errorCode = error instanceof ProviderDeliveryError
      ? error.code
      : "provider_unavailable";

    await withCommunicationCapability(async (db) => {
      await db.query(
        "select public.whatsapp_fail_outbound($1,$2)",
        [prepared.message_id, errorCode],
      );
    }).catch(() => undefined);

    throw new Error("WhatsApp delivery failed.");
  }

  try {
    await withCommunicationCapability(async (db) => {
      await db.query(
        "select public.whatsapp_complete_outbound($1,$2)",
        [prepared.message_id, providerMessageId],
      );
    });
  } catch {
    // The provider may already have accepted the message. Never mark it failed or
    // automatically resend from this ambiguous state; a webhook can still reconcile it.
    return { messageId: prepared.message_id, status: "sending" as const };
  }

  return { messageId: prepared.message_id, status: "sent" as const };
}
