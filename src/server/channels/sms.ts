import "server-only";

import type { DeliveryStatus } from "@/modules/contact-me/conversations/domain";
import { withCommunicationCapability } from "./capability";
import { ProviderDeliveryError } from "./provider";
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

  if (!prepared.created) {
    if (["queued", "sent", "delivered"].includes(prepared.delivery_status)) {
      return { messageId: prepared.message_id, status: prepared.delivery_status };
    }
    if (prepared.delivery_status === "failed") {
      throw new Error("The previous SMS delivery attempt failed.");
    }
    // An ambiguous in-flight request is never automatically resent.
    return { messageId: prepared.message_id, status: prepared.delivery_status };
  }

  const provider = getSmsCommunicationProvider(prepared.provider);

  let providerMessageId: string;
  let providerStatus: "sending" | "queued" | "sent" | "delivered" | "failed";

  try {
    const result = await provider.sendSms({
      externalAccountId: prepared.external_account_id,
      externalSenderId: prepared.external_sender_id,
      credentialKey: prepared.credential_key,
      recipient: prepared.recipient,
      body: input.body,
      statusCallbackUrl: twilioSmsWebhookUrl(),
    });
    providerMessageId = result.providerMessageId;
    providerStatus = result.status;
  } catch (error) {
    const errorCode = error instanceof ProviderDeliveryError
      ? error.code
      : "provider_unavailable";

    await withCommunicationCapability(async (db) => {
      await db.query(
        "select public.sms_fail_outbound($1,$2)",
        [prepared.message_id, errorCode],
      );
    }).catch(() => undefined);

    throw new Error("SMS delivery failed.");
  }

  try {
    await withCommunicationCapability(async (db) => {
      await db.query(
        "select public.sms_complete_outbound($1,$2,$3)",
        [prepared.message_id, providerMessageId, providerStatus],
      );
    });
  } catch {
    // Provider acceptance may already have occurred; preserve the in-flight
    // state rather than creating a duplicate customer SMS.
    return { messageId: prepared.message_id, status: "sending" as const };
  }

  if (providerStatus === "failed") {
    throw new Error("SMS delivery was rejected by the provider.");
  }

  return { messageId: prepared.message_id, status: providerStatus };
}
