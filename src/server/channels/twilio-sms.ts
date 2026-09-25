import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  ProviderDeliveryError,
  type SendSmsInput,
  type SmsCommunicationProvider,
  type SmsProviderStatus,
} from "./provider";

const e164Schema = z.string().regex(/^\+[1-9][0-9]{7,14}$/);
const accountSidSchema = z.string().regex(/^AC[0-9A-Fa-f]{32}$/);
const messageSidSchema = z.string().regex(/^(SM|MM)[0-9A-Fa-f]{32}$/);

const responseSchema = z.object({
  sid: messageSidSchema,
  status: z.string().min(1).max(40),
}).passthrough();

export type TwilioSmsInboundEvent = {
  kind: "inbound";
  accountSid: string;
  externalSenderId: string;
  customerPhone: string;
  providerMessageId: string;
  body: string;
};

export type TwilioSmsDeliveryEvent = {
  kind: "delivery";
  accountSid: string;
  externalSenderId: string;
  providerMessageId: string;
  status: SmsProviderStatus | null;
  errorCode: string | null;
};

export type TwilioSmsWebhookEvent = TwilioSmsInboundEvent | TwilioSmsDeliveryEvent;

function credentialMap() {
  const raw = process.env.SMS_TWILIO_CREDENTIALS_JSON;
  if (!raw) return {} as Record<string, unknown>;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("SMS credentials configuration is invalid.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("SMS credentials configuration is invalid.");
  }

  return parsed as Record<string, unknown>;
}

function authToken(credentialKey: string) {
  const value = credentialMap()[credentialKey];
  if (typeof value !== "string" || value.length < 20) {
    throw new Error("SMS credential key is not configured.");
  }
  return value;
}

export function twilioCredentialConfigured(credentialKey: string | null | undefined) {
  if (!credentialKey) return false;
  try {
    const value = credentialMap()[credentialKey];
    return typeof value === "string" && value.length >= 20;
  } catch {
    return false;
  }
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function twilioSmsWebhookUrl() {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) throw new Error("Application URL is not configured.");
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("SMS webhook requires HTTPS.");
  }
  url.pathname = "/api/channels/sms/twilio/webhook";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function verifyTwilioWebhookSignature(input: {
  url: string;
  params: URLSearchParams;
  signature: string | null;
  credentialKey: string;
}) {
  if (!input.signature) return false;

  let token: string;
  try {
    token = authToken(input.credentialKey);
  } catch {
    return false;
  }

  const entries = [...input.params.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  let value = input.url;
  for (const [name, field] of entries) value += name + field;

  const expected = createHmac("sha1", token).update(value).digest("base64");
  return safeEqual(expected, input.signature);
}

function providerStatus(value: string): SmsProviderStatus | null {
  switch (value) {
    case "accepted":
    case "scheduled":
    case "queued":
      return "queued";
    case "sending":
      return "sending";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "failed":
    case "undelivered":
    case "canceled":
      return "failed";
    default:
      return null;
  }
}

function canonicalBody(value: string) {
  const body = value.trim();
  if (!body) throw new Error("Invalid SMS webhook.");
  return body.length <= 1600 ? body : body.slice(0, 1578) + "… [truncated]";
}

export function parseTwilioSmsWebhook(params: URLSearchParams): TwilioSmsWebhookEvent {
  const accountSid = params.get("AccountSid")?.trim() ?? "";
  if (!accountSidSchema.safeParse(accountSid).success) {
    throw new Error("Invalid SMS webhook.");
  }

  const messageSid = params.get("MessageSid")?.trim() ?? "";
  if (!messageSidSchema.safeParse(messageSid).success) {
    throw new Error("Invalid SMS webhook.");
  }

  const messageStatus = params.get("MessageStatus")?.trim();
  if (messageStatus) {
    const sender = params.get("From")?.trim() ?? "";
    if (!e164Schema.safeParse(sender).success) throw new Error("Invalid SMS webhook.");

    const errorRaw = params.get("ErrorCode")?.trim() ?? "";
    const errorCode = errorRaw
      ? errorRaw.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100)
      : null;

    return {
      kind: "delivery",
      accountSid,
      externalSenderId: sender,
      providerMessageId: messageSid,
      status: providerStatus(messageStatus),
      errorCode,
    };
  }

  const from = params.get("From")?.trim() ?? "";
  const to = params.get("To")?.trim() ?? "";
  if (!e164Schema.safeParse(from).success || !e164Schema.safeParse(to).success) {
    throw new Error("Invalid SMS webhook.");
  }

  return {
    kind: "inbound",
    accountSid,
    externalSenderId: to,
    customerPhone: from,
    providerMessageId: messageSid,
    body: canonicalBody(params.get("Body") ?? ""),
  };
}

function providerErrorCode(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && "code" in payload) {
    const code = (payload as { code?: unknown }).code;
    if (typeof code === "number" || typeof code === "string") {
      return `twilio_${String(code).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80)}`;
    }
  }
  return `twilio_${status}`;
}

export function createTwilioSmsProvider(
  fetcher: typeof fetch = fetch,
): SmsCommunicationProvider {
  return {
    id: "twilio_sms",
    async sendSms(input: SendSmsInput) {
      if (!accountSidSchema.safeParse(input.externalAccountId).success) {
        throw new ProviderDeliveryError("invalid_account");
      }
      if (!e164Schema.safeParse(input.externalSenderId).success) {
        throw new ProviderDeliveryError("invalid_sender");
      }
      if (!e164Schema.safeParse(input.recipient).success) {
        throw new ProviderDeliveryError("invalid_recipient");
      }
      if (!input.body.trim() || input.body.length > 1600) {
        throw new ProviderDeliveryError("invalid_body");
      }

      const token = authToken(input.credentialKey);
      const body = new URLSearchParams({
        To: input.recipient,
        From: input.externalSenderId,
        Body: input.body,
        StatusCallback: input.statusCallbackUrl,
      });

      const response = await fetcher(
        `https://api.twilio.com/2010-04-01/Accounts/${input.externalAccountId}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${input.externalAccountId}:${token}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
          signal: AbortSignal.timeout(10_000),
        },
      );

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        // Never surface raw provider bodies or credentials.
      }

      if (!response.ok) {
        throw new ProviderDeliveryError(providerErrorCode(payload, response.status));
      }

      const parsed = responseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new ProviderDeliveryError("twilio_invalid_response");
      }

      const status = providerStatus(parsed.data.status);
      if (!status) {
        throw new ProviderDeliveryError("twilio_unknown_status");
      }

      return {
        providerMessageId: parsed.data.sid,
        status,
      };
    },
  };
}
