import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  ProviderDeliveryError,
  type SendTextInput,
  type TextCommunicationProvider,
} from "./provider";

const digitsSchema = z.string().regex(/^[0-9]{5,32}$/);
const providerMessageIdSchema = z.string().trim().min(1).max(255);

const contactSchema = z.object({
  wa_id: digitsSchema,
  profile: z.object({
    name: z.string().max(300).optional(),
  }).passthrough().optional(),
}).passthrough();

const inboundMessageSchema = z.object({
  from: digitsSchema,
  id: providerMessageIdSchema,
  type: z.string().min(1).max(50),
  text: z.object({
    body: z.string().min(1).max(65536),
  }).passthrough().optional(),
}).passthrough();

const deliveryStatusSchema = z.object({
  id: providerMessageIdSchema,
  status: z.enum(["sent", "delivered", "read", "failed"]),
  errors: z.array(z.object({
    code: z.union([z.number(), z.string()]).optional(),
  }).passthrough()).optional(),
}).passthrough();

const webhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    changes: z.array(z.object({
      field: z.string(),
      value: z.object({
        metadata: z.object({
          phone_number_id: digitsSchema,
        }).passthrough().optional(),
        contacts: z.array(contactSchema).optional(),
        messages: z.array(inboundMessageSchema).optional(),
        statuses: z.array(deliveryStatusSchema).optional(),
      }).passthrough(),
    }).passthrough()),
  }).passthrough()),
}).passthrough();

export type MetaInboundTextEvent = {
  externalSenderId: string;
  customerWaId: string;
  customerName: string;
  providerMessageId: string;
  body: string;
};

export type MetaDeliveryEvent = {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  errorCode: string | null;
};

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyMetaWebhookChallenge(
  mode: string | null,
  token: string | null,
  configuredToken: string | undefined,
) {
  if (mode !== "subscribe" || !token || !configuredToken) return false;
  return safeEqual(token, configuredToken);
}

export function verifyMetaWebhookSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string | undefined,
) {
  if (!signature || !appSecret || !signature.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeEqual(signature, expected);
}

function canonicalText(body: string) {
  const value = body.trim();
  if (value.length <= 4000) return value;
  return value.slice(0, 3980) + "… [truncated]";
}

export function parseMetaWebhook(input: unknown): {
  messages: MetaInboundTextEvent[];
  statuses: MetaDeliveryEvent[];
} {
  const parsed = webhookSchema.parse(input);
  const messages: MetaInboundTextEvent[] = [];
  const statuses: MetaDeliveryEvent[] = [];

  for (const entry of parsed.entry) {
    for (const change of entry.changes) {
      const senderId = change.value.metadata?.phone_number_id;
      const names = new Map(
        (change.value.contacts ?? []).map((contact) => [
          contact.wa_id,
          contact.profile?.name?.trim() ?? "",
        ]),
      );

      if (senderId) {
        for (const message of change.value.messages ?? []) {
          if (message.type !== "text" || !message.text?.body?.trim()) continue;
          messages.push({
            externalSenderId: senderId,
            customerWaId: message.from,
            customerName: names.get(message.from) ?? "",
            providerMessageId: message.id,
            body: canonicalText(message.text.body),
          });
        }
      }

      for (const status of change.value.statuses ?? []) {
        statuses.push({
          providerMessageId: status.id,
          status: status.status,
          errorCode: status.errors?.[0]?.code == null
            ? null
            : String(status.errors[0].code).slice(0, 100),
        });
      }
    }
  }

  return { messages, statuses };
}

function metaCredentials() {
  const raw = process.env.WHATSAPP_META_CREDENTIALS_JSON;
  if (!raw) throw new Error("WhatsApp credentials are not configured.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("WhatsApp credentials configuration is invalid.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("WhatsApp credentials configuration is invalid.");
  }

  return parsed as Record<string, unknown>;
}

function metaAccessToken(credentialKey: string) {
  const value = metaCredentials()[credentialKey];
  if (typeof value !== "string" || value.length < 20) {
    throw new Error("WhatsApp credential key is not configured.");
  }
  return value;
}

function graphVersion() {
  const value = process.env.WHATSAPP_META_GRAPH_API_VERSION;
  if (!value || !/^v[0-9]+\.[0-9]+$/.test(value)) {
    throw new Error("WhatsApp Graph API version is not configured.");
  }
  return value;
}

function providerErrorCode(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (error && typeof error === "object" && "code" in error) {
      return String((error as { code?: unknown }).code).slice(0, 60);
    }
  }
  return String(status);
}

export function createMetaWhatsAppProvider(
  fetcher: typeof fetch = fetch,
): TextCommunicationProvider {
  return {
    id: "meta_whatsapp_cloud",
    async sendText(input: SendTextInput) {
      if (!digitsSchema.safeParse(input.externalSenderId).success) {
        throw new ProviderDeliveryError("invalid_sender");
      }
      if (!digitsSchema.safeParse(input.recipient).success) {
        throw new ProviderDeliveryError("invalid_recipient");
      }

      const response = await fetcher(
        `https://graph.facebook.com/${graphVersion()}/${input.externalSenderId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${metaAccessToken(input.credentialKey)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: input.recipient,
            type: "text",
            text: {
              preview_url: false,
              body: input.body,
            },
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        // Do not expose provider response bodies or credentials.
      }

      if (!response.ok) {
        throw new ProviderDeliveryError(`meta_${providerErrorCode(payload, response.status)}`);
      }

      const result = z.object({
        messages: z.array(z.object({
          id: providerMessageIdSchema,
        })).min(1),
      }).passthrough().safeParse(payload);

      if (!result.success) {
        throw new ProviderDeliveryError("meta_invalid_response");
      }

      return { providerMessageId: result.data.messages[0]!.id };
    },
  };
}
