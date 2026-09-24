import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMetaWhatsAppProvider,
  parseMetaWebhook,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "@/server/channels/meta-whatsapp";

afterEach(() => {
  delete process.env.WHATSAPP_META_CREDENTIALS_JSON;
  delete process.env.WHATSAPP_META_GRAPH_API_VERSION;
  vi.restoreAllMocks();
});

describe("Meta WhatsApp adapter", () => {
  it("verifies webhook challenge and raw-body HMAC", () => {
    const raw = JSON.stringify({ hello: "world" });
    const secret = "test-app-secret";
    const signature = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");

    expect(verifyMetaWebhookChallenge("subscribe", "verify-me", "verify-me")).toBe(true);
    expect(verifyMetaWebhookChallenge("subscribe", "wrong", "verify-me")).toBe(false);
    expect(verifyMetaWebhookSignature(raw, signature, secret)).toBe(true);
    expect(verifyMetaWebhookSignature(raw + "x", signature, secret)).toBe(false);
  });

  it("normalizes signed-provider text and delivery events without tenant input", () => {
    const parsed = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          field: "messages",
          value: {
            metadata: { phone_number_id: "109876543210" },
            contacts: [{ wa_id: "447700900123", profile: { name: "Example Customer" } }],
            messages: [{
              from: "447700900123",
              id: "wamid.inbound",
              type: "text",
              text: { body: "Hello Codeedge" },
            }],
            statuses: [{
              id: "wamid.outbound",
              status: "delivered",
            }],
          },
        }],
      }],
    });

    expect(parsed.messages).toEqual([{
      externalSenderId: "109876543210",
      customerWaId: "447700900123",
      customerName: "Example Customer",
      providerMessageId: "wamid.inbound",
      body: "Hello Codeedge",
    }]);
    expect(parsed.statuses).toEqual([{
      providerMessageId: "wamid.outbound",
      status: "delivered",
      errorCode: null,
    }]);
  });

  it("ignores unsupported inbound media instead of inventing a parallel message model", () => {
    const parsed = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          field: "messages",
          value: {
            metadata: { phone_number_id: "109876543210" },
            messages: [{
              from: "447700900123",
              id: "wamid.image",
              type: "image",
            }],
          },
        }],
      }],
    });

    expect(parsed.messages).toEqual([]);
  });

  it("sends plain text through the configured provider credential alias", async () => {
    process.env.WHATSAPP_META_GRAPH_API_VERSION = "v99.0";
    process.env.WHATSAPP_META_CREDENTIALS_JSON = JSON.stringify({
      client_primary: "test-token-that-is-long-enough",
    });

    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ messages: [{ id: "wamid.sent" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));

    const provider = createMetaWhatsAppProvider(fetcher as typeof fetch);
    await expect(provider.sendText({
      externalSenderId: "109876543210",
      credentialKey: "client_primary",
      recipient: "447700900123",
      body: "Reply",
    })).resolves.toEqual({ providerMessageId: "wamid.sent" });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v99.0/109876543210/messages");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-token-that-is-long-enough",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      messaging_product: "whatsapp",
      to: "447700900123",
      type: "text",
      text: { body: "Reply" },
    });
  });
});
