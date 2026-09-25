import "server-only";

import type { DeliveryStatus } from "@/modules/contact-me/conversations/domain";
import { withCommunicationCapability } from "./capability";
import { dispatchPreparedExternalMessage } from "./orchestration";
import { getEmailCommunicationProvider } from "./registry";

type InboundConnection = {
  business_id: string;
  connection_id: string;
  provider: string;
  credential_key: string;
  inbound_email: string;
};

type PreparedEmail = {
  message_id: string;
  connection_id: string;
  provider: string;
  credential_key: string;
  sender_name: string;
  sender_email: string;
  reply_to_email: string;
  recipient: string;
  subject: string;
  in_reply_to: string | null;
  reference_ids: string[];
  delivery_status: DeliveryStatus;
  created: boolean;
};

async function resolveInboundConnection(inboundEmail: string) {
  try {
    return await withCommunicationCapability(async (db) => {
      const result = await db.query<InboundConnection>(
        "select * from private.active_email_connection($1)",
        [inboundEmail],
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

export async function receiveResendInbound(
  providerMessageId: string,
  inboundEmail: string,
) {
  const connection = await resolveInboundConnection(inboundEmail);
  if (!connection) return null;

  const provider = getEmailCommunicationProvider(connection.provider);
  const email = await provider.getReceivedEmail({
    credentialKey: connection.credential_key,
    providerMessageId,
  });

  if (!email.recipients.includes(connection.inbound_email)) {
    throw new Error("Inbound Email recipient mismatch.");
  }

  return withCommunicationCapability(async (db) => {
    const result = await db.query<{
      conversation_id: string;
      message_id: string;
      inserted: boolean;
    }>(
      "select * from public.email_receive($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        connection.inbound_email,
        email.providerMessageId,
        email.rfcMessageId,
        email.inReplyTo,
        email.references,
        email.fromEmail,
        email.fromName,
        email.replyToEmail,
        email.subject,
        email.body,
      ],
    );

    return result.rows[0] ?? null;
  });
}

export async function updateEmailDelivery(input: {
  providerMessageId: string;
  status: "sent" | "delivered" | "bounced" | "failed";
  rfcMessageId?: string | null;
  errorCode: string | null;
}) {
  return withCommunicationCapability(async (db) => {
    await db.query(
      "select public.email_update_delivery($1,$2,$3,$4)",
      [
        input.providerMessageId,
        input.status,
        input.rfcMessageId ?? null,
        input.errorCode,
      ],
    );
  });
}

async function prepareEmailReply(input: {
  businessId: string;
  conversationId: string;
  userId: string;
  requestId: string;
  body: string;
}) {
  return withCommunicationCapability(async (db) => {
    const result = await db.query<PreparedEmail>(
      "select * from public.email_prepare_outbound($1,$2,$3,$4,$5)",
      [
        input.businessId,
        input.conversationId,
        input.userId,
        input.requestId,
        input.body,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error("Email delivery could not be prepared.");
    return row;
  });
}

export async function sendEmailReply(input: {
  businessId: string;
  conversationId: string;
  userId: string;
  requestId: string;
  body: string;
}) {
  const prepared = await prepareEmailReply(input);

  return dispatchPreparedExternalMessage({
    channel: "email",
    prepared,
    successfulExistingStatuses: ["queued", "sent", "delivered"],
    failedExistingStatuses: ["bounced", "failed"],
    previousFailureMessage: "The previous Email delivery attempt failed.",
    deliveryFailureMessage: "Email delivery failed.",
    send: () => getEmailCommunicationProvider(prepared.provider).sendEmail({
      credentialKey: prepared.credential_key,
      senderName: prepared.sender_name,
      senderEmail: prepared.sender_email,
      replyToEmail: prepared.reply_to_email,
      recipient: prepared.recipient,
      subject: prepared.subject,
      body: input.body,
      inReplyTo: prepared.in_reply_to,
      references: prepared.reference_ids,
      idempotencyKey: input.requestId,
    }),
    complete: async (result) => {
      await withCommunicationCapability(async (db) => {
        await db.query(
          "select public.email_complete_outbound($1,$2,$3)",
          [prepared.message_id, result.providerMessageId, result.rfcMessageId],
        );
      });
    },
    fail: async (errorCode) => {
      await withCommunicationCapability(async (db) => {
        await db.query(
          "select public.email_fail_outbound($1,$2)",
          [prepared.message_id, errorCode],
        );
      });
    },
    statusFromResult: () => "queued",
  });
}
