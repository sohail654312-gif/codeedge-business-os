import "server-only";

import type { DeliveryStatus } from "@/modules/contact-me/conversations/domain";
import { withCommunicationCapability } from "./capability";
import { ProviderDeliveryError } from "./provider";
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

  if (!prepared.created) {
    if (["queued", "sent", "delivered"].includes(prepared.delivery_status)) {
      return { messageId: prepared.message_id, status: prepared.delivery_status };
    }
    if (["bounced", "failed"].includes(prepared.delivery_status)) {
      throw new Error("The previous Email delivery attempt failed.");
    }

    // An existing "sending" request may already have reached the provider.
    // Do not issue a second provider call.
    return { messageId: prepared.message_id, status: prepared.delivery_status };
  }

  const provider = getEmailCommunicationProvider(prepared.provider);

  let providerMessageId: string;
  let rfcMessageId: string | null = null;

  try {
    const result = await provider.sendEmail({
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
    });
    providerMessageId = result.providerMessageId;
    rfcMessageId = result.rfcMessageId;
  } catch (error) {
    const errorCode = error instanceof ProviderDeliveryError
      ? error.code
      : "provider_unavailable";

    await withCommunicationCapability(async (db) => {
      await db.query(
        "select public.email_fail_outbound($1,$2)",
        [prepared.message_id, errorCode],
      );
    }).catch(() => undefined);

    throw new Error("Email delivery failed.");
  }

  try {
    await withCommunicationCapability(async (db) => {
      await db.query(
        "select public.email_complete_outbound($1,$2,$3)",
        [prepared.message_id, providerMessageId, rfcMessageId],
      );
    });
  } catch {
    // The provider may already have accepted this Email. Keep the ambiguous
    // "sending" state rather than risking a duplicate customer message.
    return { messageId: prepared.message_id, status: "sending" as const };
  }

  return { messageId: prepared.message_id, status: "queued" as const };
}
