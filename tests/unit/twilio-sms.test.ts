import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTwilioSmsProvider,
  parseTwilioSmsWebhook,
  twilioCredentialConfigured,
  verifyTwilioWebhookSignature,
} from "@/server/channels/twilio-sms";
import { ProviderDeliveryError } from "@/server/channels/provider";

const accountSid = "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const messageSid = "SMbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const token = "12345678901234567890123456789012";
const webhookUrl = "https://example.test/api/channels/sms/twilio/webhook";

afterEach(() => {
  delete process.env.SMS_TWILIO_CREDENTIALS_JSON;
  vi.restoreAllMocks();
});

function signature(params: URLSearchParams) {
  let data = webhookUrl;
  for (const [name, value] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    data += name + value;
  }
  return createHmac("sha1", token).update(data).digest("base64");
}

describe("Twilio SMS adapter", () => {
  it("validates the signed form webhook using the credential alias", () => {
    process.env.SMS_TWILIO_CREDENTIALS_JSON = JSON.stringify({
      tenant_a: {
        businessId: "20000000-0000-4000-8000-000000000001",
        provider: "twilio_sms",
        environment: "production",
        externalAccountId: accountSid,
        externalSenderId: "+441234567890",
        secret: token,
      },
    });
    const params = new URLSearchParams({
      AccountSid: accountSid,
      Body: "Hello",
      From: "+447700900123",
      MessageSid: messageSid,
      To: "+441234567890",
    });
    const signed = signature(params);

    expect(verifyTwilioWebhookSignature({
      url: webhookUrl,
      params,
      signature: signed,
      credentialKey: "tenant_a",
      businessId: "20000000-0000-4000-8000-000000000001",
      providerEnvironment: "production",
      externalAccountId: accountSid,
      externalSenderId: "+441234567890",
    })).toBe(true);

    params.set("Body", "Tampered");
    expect(verifyTwilioWebhookSignature({
      url: webhookUrl,
      params,
      signature: signed,
      credentialKey: "tenant_a",
      businessId: "20000000-0000-4000-8000-000000000001",
      providerEnvironment: "production",
      externalAccountId: accountSid,
      externalSenderId: "+441234567890",
    })).toBe(false);

    expect(twilioCredentialConfigured("tenant_a")).toBe(true);
  });

  it("normalizes inbound SMS and delivery callbacks", () => {
    const inbound = parseTwilioSmsWebhook(new URLSearchParams({
      AccountSid: accountSid,
      MessageSid: messageSid,
      From: "+447700900123",
      To: "+441234567890",
      Body: "  Hello by SMS  ",
      NumMedia: "0",
    }));

    expect(inbound).toEqual({
      kind: "inbound",
      accountSid,
      externalSenderId: "+441234567890",
      customerPhone: "+447700900123",
      providerMessageId: messageSid,
      body: "Hello by SMS",
    });

    const failed = parseTwilioSmsWebhook(new URLSearchParams({
      AccountSid: accountSid,
      MessageSid: messageSid,
      MessageStatus: "undelivered",
      ErrorCode: "30003",
      From: "+441234567890",
      To: "+447700900123",
    }));

    expect(failed).toEqual({
      kind: "delivery",
      accountSid,
      externalSenderId: "+441234567890",
      providerMessageId: messageSid,
      status: "failed",
      errorCode: "30003",
    });
  });

  it("ignores unknown future delivery status instead of inventing a state", () => {
    const event = parseTwilioSmsWebhook(new URLSearchParams({
      AccountSid: accountSid,
      MessageSid: messageSid,
      MessageStatus: "future_status",
      From: "+441234567890",
      To: "+447700900123",
    }));

    expect(event.kind).toBe("delivery");
    if (event.kind === "delivery") expect(event.status).toBeNull();
  });

  it("sends form-encoded SMS with Basic auth and a delivery callback", async () => {
    process.env.SMS_TWILIO_CREDENTIALS_JSON = JSON.stringify({
      tenant_a: {
        businessId: "20000000-0000-4000-8000-000000000001",
        provider: "twilio_sms",
        environment: "production",
        externalAccountId: accountSid,
        externalSenderId: "+441234567890",
        secret: token,
      },
    });
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init });
      return new Response(JSON.stringify({ sid: messageSid, status: "queued" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const provider = createTwilioSmsProvider(fetcher);
    await expect(provider.sendSms({
      externalAccountId: accountSid,
      externalSenderId: "+441234567890",
      businessId: "20000000-0000-4000-8000-000000000001",
      providerEnvironment: "production",
      credentialKey: "tenant_a",
      recipient: "+447700900123",
      body: "Reply by SMS",
      statusCallbackUrl: webhookUrl,
    })).resolves.toEqual({
      providerMessageId: messageSid,
      status: "queued",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.input).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    );
    expect(requests[0]!.init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from(`${accountSid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    });
    const body = new URLSearchParams(String(requests[0]!.init?.body));
    expect(Object.fromEntries(body.entries())).toEqual({
      To: "+447700900123",
      From: "+441234567890",
      Body: "Reply by SMS",
      StatusCallback: webhookUrl,
    });
  });

  it("maps provider rejection to a sanitized delivery error", async () => {
    process.env.SMS_TWILIO_CREDENTIALS_JSON = JSON.stringify({
      tenant_a: {
        businessId: "20000000-0000-4000-8000-000000000001",
        provider: "twilio_sms",
        environment: "production",
        externalAccountId: accountSid,
        externalSenderId: "+441234567890",
        secret: token,
      },
    });
    const provider = createTwilioSmsProvider((async () => new Response(
      JSON.stringify({ code: 21608, message: "not verified" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch);

    try {
      await provider.sendSms({
        businessId: "20000000-0000-4000-8000-000000000001",
        providerEnvironment: "production",
        externalAccountId: accountSid,
        externalSenderId: "+441234567890",
        credentialKey: "tenant_a",
        recipient: "+447700900123",
        body: "Reply",
        statusCallbackUrl: webhookUrl,
      });
      throw new Error("Expected provider rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderDeliveryError);
      expect((error as ProviderDeliveryError).code).toBe("twilio_21608");
    }
  });

  it("denies a Twilio alias when trusted tenant metadata does not match", async () => {
    process.env.SMS_TWILIO_CREDENTIALS_JSON = JSON.stringify({
      tenant_a: {
        businessId: "20000000-0000-4000-8000-000000000001",
        provider: "twilio_sms",
        environment: "production",
        externalAccountId: accountSid,
        externalSenderId: "+441234567890",
        secret: token,
      },
    });
    const fetcher = vi.fn();
    const provider = createTwilioSmsProvider(fetcher as typeof fetch);

    await expect(provider.sendSms({
      businessId: "20000000-0000-4000-8000-000000000002",
      providerEnvironment: "production",
      externalAccountId: accountSid,
      externalSenderId: "+441234567890",
      credentialKey: "tenant_a",
      recipient: "+447700900123",
      body: "Blocked",
      statusCallbackUrl: webhookUrl,
    })).rejects.toThrow(/credential/i);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
