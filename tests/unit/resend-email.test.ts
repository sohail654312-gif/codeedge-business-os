import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createResendEmailProvider,
  parseResendWebhook,
  verifyResendWebhookSignature,
} from "@/server/channels/resend-email";

afterEach(() => {
  delete process.env.EMAIL_RESEND_CREDENTIALS_JSON;
  vi.restoreAllMocks();
});

describe("Resend Email adapter", () => {
  it("verifies Svix webhook signatures with timestamp replay protection", () => {
    const raw = JSON.stringify({ type: "email.received", data: { email_id: "email-1" } });
    const key = Buffer.from("codeedge-email-webhook-secret");
    const secret = "whsec_" + key.toString("base64");
    const timestamp = 1_800_000_000;
    const id = "msg_webhook_1";
    const signature = createHmac("sha256", key)
      .update(`${id}.${timestamp}.${raw}`)
      .digest("base64");

    expect(verifyResendWebhookSignature(
      raw,
      { id, timestamp: String(timestamp), signature: `v1,${signature}` },
      secret,
      timestamp * 1000,
    )).toBe(true);

    expect(verifyResendWebhookSignature(
      raw + "x",
      { id, timestamp: String(timestamp), signature: `v1,${signature}` },
      secret,
      timestamp * 1000,
    )).toBe(false);

    expect(verifyResendWebhookSignature(
      raw,
      { id, timestamp: String(timestamp - 600), signature: `v1,${signature}` },
      secret,
      timestamp * 1000,
    )).toBe(false);
  });

  it("normalizes only allowlisted inbound and delivery events", () => {
    expect(parseResendWebhook({
      type: "email.received",
      data: {
        email_id: "received-1",
        to: ["Codeedge <Inbox@Example.com>"],
      },
    })).toEqual({
      kind: "received",
      providerMessageId: "received-1",
      recipients: ["inbox@example.com"],
    });

    expect(parseResendWebhook({
      type: "email.bounced",
      data: {
        email_id: "sent-1",
        bounce: { subType: "MailboxFull", type: "Transient" },
      },
    })).toEqual({
      kind: "delivery",
      providerMessageId: "sent-1",
      status: "bounced",
      errorCode: "MailboxFull",
    });

    expect(parseResendWebhook({
      type: "email.opened",
      data: { email_id: "sent-1" },
    })).toEqual({ kind: "ignored" });
  });

  it("sends a threaded plain-text Email with provider idempotency and captures Message-ID", async () => {
    process.env.EMAIL_RESEND_CREDENTIALS_JSON = JSON.stringify({
      client_primary: {
        businessId: "20000000-0000-4000-8000-000000000001",
        provider: "resend_email",
        environment: "production",
        externalSenderId: "support@example.com",
        secret: "re_test_server_only_key",
      },
    });

    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init });
      if (String(input).endsWith("/emails")) {
        return new Response(JSON.stringify({ id: "resend-out-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        id: "resend-out-1",
        message_id: "<out-1@example.com>",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const provider = createResendEmailProvider(fetcher);
    await expect(provider.sendEmail({
      businessId: "20000000-0000-4000-8000-000000000001",
      providerEnvironment: "production",
      credentialKey: "client_primary",
      senderName: "Codeedge Support",
      senderEmail: "support@example.com",
      replyToEmail: "reply@example.com",
      recipient: "customer@example.net",
      subject: "Re: Quote",
      body: "Thanks for your message.",
      inReplyTo: "<in-1@example.net>",
      references: ["<root@example.net>", "<in-1@example.net>"],
      idempotencyKey: "80000000-0000-4000-8000-000000000001",
    })).resolves.toEqual({
      providerMessageId: "resend-out-1",
      rfcMessageId: "<out-1@example.com>",
    });

    expect(requests).toHaveLength(2);
    const send = requests[0]!;
    expect(send.input).toBe("https://api.resend.com/emails");
    expect(send.init?.headers).toMatchObject({
      Authorization: "Bearer re_test_server_only_key",
      "Content-Type": "application/json",
      "Idempotency-Key": "codeedge:80000000-0000-4000-8000-000000000001",
    });
    expect(JSON.parse(String(send.init?.body))).toMatchObject({
      from: "Codeedge Support <support@example.com>",
      to: "customer@example.net",
      subject: "Re: Quote",
      text: "Thanks for your message.",
      reply_to: "reply@example.com",
      headers: {
        "In-Reply-To": "<in-1@example.net>",
        References: "<root@example.net> <in-1@example.net>",
      },
    });
  });

  it("retrieves inbound Email, parses RFC threading headers, and never returns raw HTML", async () => {
    process.env.EMAIL_RESEND_CREDENTIALS_JSON = JSON.stringify({
      client_primary: {
        businessId: "20000000-0000-4000-8000-000000000001",
        provider: "resend_email",
        environment: "production",
        externalSenderId: "support@example.com",
        secret: "re_test_server_only_key",
      },
    });

    const fetcher = (async () => new Response(JSON.stringify({
      id: "received-1",
      to: ["Inbox@Example.com"],
      from: "Jane Customer <Jane@Example.net>",
      subject: "Need help",
      message_id: "<in-2@example.net>",
      reply_to: ["reply-jane@example.net"],
      text: null,
      html: "<style>body{display:none}</style><p>Hello <b>Codeedge</b></p><script>alert(1)</script>",
      headers: {
        "In-Reply-To": "<out-1@example.com>",
        References: "<root@example.net> <out-1@example.com>",
      },
      attachments: [{ id: "attachment-1" }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

    const provider = createResendEmailProvider(fetcher);
    const email = await provider.getReceivedEmail({
      businessId: "20000000-0000-4000-8000-000000000001",
      providerEnvironment: "production",
      credentialKey: "client_primary",
      externalSenderId: "support@example.com",
      providerMessageId: "received-1",
    });

    expect(email).toMatchObject({
      providerMessageId: "received-1",
      rfcMessageId: "<in-2@example.net>",
      fromEmail: "jane@example.net",
      fromName: "Jane Customer",
      recipients: ["inbox@example.com"],
      replyToEmail: "reply-jane@example.net",
      subject: "Need help",
      body: "Hello Codeedge",
      inReplyTo: "<out-1@example.com>",
      references: ["<root@example.net>", "<out-1@example.com>"],
      hasAttachments: true,
    });
    expect(email.body).not.toContain("<script");
    expect(email.body).not.toContain("alert(1)");
  });

  it("denies a known Resend alias for the wrong tenant", async () => {
    process.env.EMAIL_RESEND_CREDENTIALS_JSON = JSON.stringify({
      tenant_a: {
        businessId: "20000000-0000-4000-8000-000000000001",
        provider: "resend_email",
        environment: "production",
        externalSenderId: "support@example.com",
        secret: "re_test_server_only_key",
      },
    });
    const fetcher = vi.fn();
    const provider = createResendEmailProvider(fetcher as typeof fetch);

    await expect(provider.getReceivedEmail({
      businessId: "20000000-0000-4000-8000-000000000002",
      providerEnvironment: "production",
      credentialKey: "tenant_a",
      externalSenderId: "support@example.com",
      providerMessageId: "received-1",
    })).rejects.toThrow(/credential/i);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
