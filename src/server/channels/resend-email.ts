import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  ProviderDeliveryError,
  type EmailCommunicationProvider,
  type ReceivedEmail,
  type SendEmailInput,
} from "./provider";
import {
  resolveTenantBoundSecret,
  tenantBoundCredentialConfigured,
} from "@/server/credentials/tenant-bound";

const providerIdSchema = z.string().trim().min(1).max(255);
const rfcMessageIdSchema = z.string().trim().min(1).max(255);
const emailSchema = z.string().trim().max(254).regex(
  /^[^\s@<>]+@[^\s@<>]+$/,
  "Invalid email address.",
).transform((value) => value.toLowerCase());

const receivedSchema = z.object({
  id: providerIdSchema,
  to: z.array(z.string()).min(1).max(100),
  from: z.string().min(1).max(500),
  subject: z.string().max(2000).catch(""),
  message_id: rfcMessageIdSchema,
  reply_to: z.array(z.string()).nullable().optional(),
  text: z.string().nullable().optional(),
  html: z.string().nullable().optional(),
  headers: z.record(z.string(), z.unknown()).nullable().optional(),
  attachments: z.array(z.unknown()).optional(),
}).passthrough();

const sentSchema = z.object({
  id: providerIdSchema,
  message_id: rfcMessageIdSchema.nullable().optional(),
}).passthrough();

const sendResponseSchema = z.object({
  id: providerIdSchema,
}).passthrough();

const receivedEventSchema = z.object({
  type: z.literal("email.received"),
  data: z.object({
    email_id: providerIdSchema,
    to: z.array(z.string()).min(1).max(100),
  }).passthrough(),
}).passthrough();

const deliveryEventSchema = z.object({
  type: z.enum(["email.sent", "email.delivered", "email.bounced", "email.failed"]),
  data: z.object({
    email_id: providerIdSchema,
    bounce: z.object({
      subType: z.string().max(100).optional(),
      type: z.string().max(100).optional(),
    }).passthrough().optional(),
    failed: z.object({
      reason: z.string().max(100).optional(),
    }).passthrough().optional(),
  }).passthrough(),
}).passthrough();

export type ResendWebhookEvent =
  | {
      kind: "received";
      providerMessageId: string;
      recipients: string[];
    }
  | {
      kind: "delivery";
      providerMessageId: string;
      status: "sent" | "delivered" | "bounced" | "failed";
      errorCode: string | null;
    }
  | { kind: "ignored" };

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyResendWebhookSignature(
  rawBody: string,
  headers: {
    id: string | null;
    timestamp: string | null;
    signature: string | null;
  },
  secret: string | undefined,
  nowMs = Date.now(),
) {
  if (!headers.id || !headers.timestamp || !headers.signature || !secret?.startsWith("whsec_")) {
    return false;
  }

  const timestamp = Number(headers.timestamp);
  if (!Number.isSafeInteger(timestamp)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - timestamp) > 5 * 60) return false;

  let key: Buffer;
  try {
    key = Buffer.from(secret.slice("whsec_".length), "base64");
  } catch {
    return false;
  }
  if (!key.length) return false;

  const signed = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = createHmac("sha256", key).update(signed).digest();

  for (const candidate of headers.signature.split(/\s+/)) {
    const [version, encoded] = candidate.split(",", 2);
    if (version !== "v1" || !encoded) continue;
    try {
      if (safeEqual(expected, Buffer.from(encoded, "base64"))) return true;
    } catch {
      // Ignore malformed signatures and continue checking other v1 values.
    }
  }

  return false;
}

function parseMailbox(value: string) {
  const raw = value.trim();
  const match = raw.match(/^(.*?)<([^<>]+)>$/);
  const address = emailSchema.parse(match ? match[2] : raw);
  const name = match
    ? match[1].trim().replace(/^["']|["']$/g, "").slice(0, 120)
    : "";
  return { address, name };
}

function headerValue(headers: Record<string, unknown> | null | undefined, name: string) {
  if (!headers) return "";
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  if (!key) return "";
  const value = headers[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join(" ");
  return "";
}

function messageIds(value: string) {
  const results: string[] = [];
  for (const match of value.matchAll(/<[^<>\s]{1,253}>/g)) {
    const id = match[0];
    if (!results.includes(id)) results.push(id);
    if (results.length >= 50) break;
  }
  return results;
}

function htmlToPlainText(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<\/div\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function canonicalBody(text: string | null | undefined, html: string | null | undefined) {
  const raw = text?.trim() || (html ? htmlToPlainText(html) : "");
  const value = raw || "(No readable text content. Attachments are not displayed in this Email milestone.)";
  return value.length <= 4000 ? value : value.slice(0, 3978) + "… [truncated]";
}

type ResendCredentialContext = {
  businessId: string;
  providerEnvironment: "sandbox" | "production";
  credentialKey: string;
  externalSenderId: string;
};

function apiKey(input: ResendCredentialContext) {
  return resolveTenantBoundSecret({
    raw: process.env.EMAIL_RESEND_CREDENTIALS_JSON,
    credentialKey: input.credentialKey,
    label: "Email",
    minimumSecretLength: 10,
    expected: {
      businessId: input.businessId,
      provider: "resend_email",
      environment: input.providerEnvironment,
      expectedMetadata: {
        externalSenderId: input.externalSenderId.toLowerCase(),
      },
    },
  });
}

export function resendCredentialConfigured(credentialKey: string | null | undefined) {
  return tenantBoundCredentialConfigured({
    raw: process.env.EMAIL_RESEND_CREDENTIALS_JSON,
    credentialKey,
    label: "Email",
    minimumSecretLength: 10,
  });
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function providerErrorCode(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    if (name) return `resend_${name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80)}`;
  }
  return `resend_${status}`;
}

function safeSenderName(value: string) {
  return value
    .replace(/[\r\n<>"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function safeErrorCode(value: string | undefined, fallback: string) {
  const normalized = (value || fallback).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100);
  return normalized || fallback;
}

export function parseResendWebhook(input: unknown): ResendWebhookEvent {
  const received = receivedEventSchema.safeParse(input);
  if (received.success) {
    const recipients = received.data.data.to
      .map((value) => {
        try {
          return parseMailbox(value).address;
        } catch {
          return null;
        }
      })
      .filter((value): value is string => Boolean(value));

    if (!recipients.length) throw new Error("Invalid inbound Email event.");

    return {
      kind: "received",
      providerMessageId: received.data.data.email_id,
      recipients: [...new Set(recipients)],
    };
  }

  const delivery = deliveryEventSchema.safeParse(input);
  if (delivery.success) {
    const type = delivery.data.type;
    const status = type.slice("email.".length) as "sent" | "delivered" | "bounced" | "failed";
    const errorCode = status === "failed"
      ? safeErrorCode(delivery.data.data.failed?.reason, "failed")
      : status === "bounced"
        ? safeErrorCode(
            delivery.data.data.bounce?.subType || delivery.data.data.bounce?.type,
            "bounced",
          )
        : null;

    return {
      kind: "delivery",
      providerMessageId: delivery.data.data.email_id,
      status,
      errorCode,
    };
  }

  if (
    input
    && typeof input === "object"
    && "type" in input
    && typeof (input as { type?: unknown }).type === "string"
  ) {
    return { kind: "ignored" };
  }

  throw new Error("Invalid Email webhook.");
}

export function createResendEmailProvider(
  fetcher: typeof fetch = fetch,
): EmailCommunicationProvider {
  async function request(
    path: string,
    credential: ResendCredentialContext,
    init?: RequestInit,
  ) {
    return fetcher(`https://api.resend.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey(credential)}`,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
  }

  async function getSentRfcMessageId(
    credential: ResendCredentialContext,
    providerMessageId: string,
  ) {
    try {
      const response = await request(
        `/emails/${encodeURIComponent(providerMessageId)}`,
        credential,
      );
      if (!response.ok) return null;
      const parsed = sentSchema.safeParse(await readJson(response));
      return parsed.success ? parsed.data.message_id ?? null : null;
    } catch {
      return null;
    }
  }

  return {
    id: "resend_email",

    async sendEmail(input: SendEmailInput) {
      const senderEmail = emailSchema.parse(input.senderEmail);
      const recipient = emailSchema.parse(input.recipient);
      const replyTo = input.replyToEmail ? emailSchema.parse(input.replyToEmail) : "";
      const displayName = safeSenderName(input.senderName);
      const headers: Record<string, string> = {};

      if (input.inReplyTo && rfcMessageIdSchema.safeParse(input.inReplyTo).success) {
        headers["In-Reply-To"] = input.inReplyTo;
      }

      const references = input.references
        .filter((value) => rfcMessageIdSchema.safeParse(value).success)
        .slice(-50);
      if (references.length) headers.References = references.join(" ");

      const response = await request("/emails", input, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `codeedge:${input.idempotencyKey}`.slice(0, 256),
        },
        body: JSON.stringify({
          from: displayName ? `${displayName} <${senderEmail}>` : senderEmail,
          to: recipient,
          subject: input.subject.slice(0, 200),
          text: input.body,
          ...(replyTo ? { reply_to: replyTo } : {}),
          ...(Object.keys(headers).length ? { headers } : {}),
        }),
      });

      const payload = await readJson(response);
      if (!response.ok) {
        throw new ProviderDeliveryError(providerErrorCode(payload, response.status));
      }

      const parsed = sendResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new ProviderDeliveryError("resend_invalid_response");
      }

      return {
        providerMessageId: parsed.data.id,
        rfcMessageId: await getSentRfcMessageId(input, parsed.data.id),
      };
    },

    async getReceivedEmail(input): Promise<ReceivedEmail> {
      const response = await request(
        `/emails/receiving/${encodeURIComponent(input.providerMessageId)}`,
        input,
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new ProviderDeliveryError(providerErrorCode(payload, response.status));
      }

      const parsed = receivedSchema.safeParse(payload);
      if (!parsed.success || parsed.data.id !== input.providerMessageId) {
        throw new ProviderDeliveryError("resend_invalid_received_email");
      }

      const from = parseMailbox(parsed.data.from);
      const recipients = parsed.data.to.map((value) => parseMailbox(value).address);
      const replyTo = parsed.data.reply_to?.[0]
        ? parseMailbox(parsed.data.reply_to[0]).address
        : "";
      const inReplyTo = messageIds(headerValue(parsed.data.headers, "in-reply-to"))[0] ?? null;
      const references = messageIds(headerValue(parsed.data.headers, "references"));

      return {
        providerMessageId: parsed.data.id,
        rfcMessageId: parsed.data.message_id,
        fromEmail: from.address,
        fromName: from.name,
        recipients,
        replyToEmail: replyTo,
        subject: parsed.data.subject.slice(0, 500),
        body: canonicalBody(parsed.data.text, parsed.data.html),
        inReplyTo,
        references,
        hasAttachments: (parsed.data.attachments?.length ?? 0) > 0,
      };
    },
  };
}
