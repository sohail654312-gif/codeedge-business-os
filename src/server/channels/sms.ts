import "server-only";

import type { DeliveryStatus } from "@/modules/contact-me/conversations/domain";
import { withCommunicationCapability } from "./capability";
import { dispatchPreparedExternalMessage } from "./orchestration";
import { getSmsCommunicationProvider } from "./registry";
import { twilioSmsWebhookUrl } from "./twilio-sms";

type SmsInboundConnection = {
  business_id: string;
  id: string;
  external_account_id: string;
  external_sender_id: string;
  credential_key: string;
  provider: string;
};

type PreparedSms = {
  message_id: string;
  connection_id: string;
  provider: string;
  external_account_id: string;
  external_sender_id: string;
  credential_key: string;
  recipient: string;
  delivery_status: DeliveryStatus;
  created: boolean;
};

export async function resolveSmsConnection(externalSenderId: string) {
  try {
    return await withCommunicationCapability(async (db) => {
      const result = await db.query<SmsInboundConnection>(
        "select * from private.active_sms_connection($1)",
        [externalSenderId],
      );
      return result.rows[0] ?? null;
    });
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && (error as { code?: unknown }).code === "42501"
    ) {
      return null;
    }
    throw error;
  }
}

export async function receiveSmsText(input: {
  externalSenderId: string;
  customerPhone: string;
  providerMessageId: string;
  body: string;
}) {
  return withCommunicationCapability(async (db) => {
    const result = await db.query<{
      conversation_id: string;
      message_id: string;
      inserted: boolean;
    }>(
      "select * from public.sms_receive_text($1,$2,$3,$4)",
      [
        input.externalSenderId,
        input.customerPhone,
        input.providerMessageId,
        input.body,
      ],
    );
    return result.rows[0] ?? null;
  });
}

export async function updateSmsDelivery(input: {
  providerMessageId: string;
  status: "sending" | "queued" | "sent" | "delivered" | "failed";
  errorCode: string | null;
}) {
  return withCommunicationCapability(async (db) => {
    await db.query(
      "select public.sms_update_delivery($1,$2,$3)",
      [input.providerMessageId, input.status, input.errorCode],
    );
  });
}

async function prepareSmsReply(input: {
  businessId: string;
  conversationId: string;
  userId: string;
  requestId: string;
  body: string;
}) {
  return withCommunicationCapability(async (db) => {
    const result = await db.query<PreparedSms>(
      "select * from public.sms_prepare_outbound($1,$2,$3,$4,$5)",
      [
        input.businessId,
        input.conversationId,
        input.userId,
        input.requestId,
        input.body,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("SMS delivery could not be prepared.");
    return row;
  });
}

export async function sendSmsReply(input: {
  businessId: string;
  conversationId: string;
  userId: string;
  requestId: string;
  body: string;
}) {
  const prepared = await prepareSmsReply(input);

  return dispatchPreparedExternalMessage({
    channel: "sms",
    prepared,
    successfulExistingStatuses: ["queued", "sent", "delivered"],
    failedExistingStatuses: ["failed"],
    previousFailureMessage: "The previous SMS delivery attempt failed.",
    deliveryFailureMessage: "SMS delivery failed.",
    send: () => getSmsCommunicationProvider(prepared.provider).sendSms({
      externalAccountId: prepared.external_account_id,
      externalSenderId: prepared.external_sender_id,
      credentialKey: prepared.credential_key,
      recipient: prepared.recipient,
      body: input.body,
      statusCallbackUrl: twilioSmsWebhookUrl(),
    }),
    complete: async (result) => {
      await withCommunicationCapability(async (db) => {
        await db.query(
          "select public.sms_complete_outbound($1,$2,$3)",
          [prepared.message_id, result.providerMessageId, result.status],
        );
      });
    },
    fail: async (errorCode) => {
      await withCommunicationCapability(async (db) => {
        await db.query(
          "select public.sms_fail_outbound($1,$2)",
          [prepared.message_id, errorCode],
        );
      });
    },
    statusFromResult: (result) => result.status,
    providerRejected: (result) => result.status === "failed",
  });
}
