import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderDeliveryError } from "@/server/channels/provider";
import { sendEmailReply } from "@/server/channels/email";
import { sendSmsReply } from "@/server/channels/sms";
import { sendWhatsAppReply } from "@/server/channels/whatsapp";

const state = vi.hoisted(() => ({
  channel: "whatsapp" as "whatsapp" | "email" | "sms",
  executionMode: "production" as "demo" | "sandbox" | "production",
  providerEnvironment: "production" as "sandbox" | "production",
  created: true,
  deliveryStatus: "sending",
  throwOnComplete: false,
  queries: [] as Array<{ sql: string; args: unknown[] | undefined }>,
  whatsappSend: vi.fn(),
  emailSend: vi.fn(),
  smsSend: vi.fn(),
}));

vi.mock("@/server/channels/capability", () => ({
  withCommunicationCapability: vi.fn(async (
    work: (db: { query: (sql: string, args?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) => Promise<unknown>,
  ) => work({
    query: async (sql: string, args?: unknown[]) => {
      state.queries.push({ sql, args });

      if (sql.includes("communication_execution_context")) {
        const provider = state.channel === "whatsapp"
          ? "meta_whatsapp_cloud"
          : state.channel === "email"
            ? "resend_email"
            : "twilio_sms";
        return {
          rows: [{
            business_id: "20000000-0000-4000-8000-000000000001",
            execution_mode: state.executionMode,
            prepared_execution_mode: state.executionMode,
            channel: state.channel,
            provider,
            provider_environment: state.providerEnvironment,
            prepared_provider_environment: state.providerEnvironment,
            correlation_id: "80000000-0000-4000-8000-000000000001",
            simulated: false,
          }],
        };
      }

      if (sql.includes("whatsapp_prepare_outbound")) {
        return {
          rows: [{
            message_id: "90000000-0000-4000-8000-000000000001",
            connection_id: "70000000-0000-4000-8000-000000000001",
            provider: "meta_whatsapp_cloud",
            external_sender_id: "109876543210",
            credential_key: "wa_primary",
            recipient: "447700900123",
            delivery_status: state.deliveryStatus,
            created: state.created,
          }],
        };
      }

      if (sql.includes("email_prepare_outbound")) {
        return {
          rows: [{
            message_id: "90000000-0000-4000-8000-000000000011",
            connection_id: "71000000-0000-4000-8000-000000000001",
            provider: "resend_email",
            credential_key: "email_primary",
            sender_name: "Codeedge",
            sender_email: "hello@codeedge.test",
            reply_to_email: "reply@codeedge.test",
            recipient: "customer@example.test",
            subject: "Re: Enquiry",
            in_reply_to: "<root@example.test>",
            reference_ids: ["<root@example.test>"],
            delivery_status: state.deliveryStatus,
            created: state.created,
          }],
        };
      }

      if (sql.includes("sms_prepare_outbound")) {
        return {
          rows: [{
            message_id: "90000000-0000-4000-8000-000000000021",
            connection_id: "72000000-0000-4000-8000-000000000001",
            provider: "twilio_sms",
            external_account_id: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            external_sender_id: "+441234567890",
            credential_key: "sms_primary",
            recipient: "+447700900123",
            delivery_status: state.deliveryStatus,
            created: state.created,
          }],
        };
      }

      if (
        state.throwOnComplete
        && (
          sql.includes("whatsapp_complete_outbound")
          || sql.includes("email_complete_outbound")
          || sql.includes("sms_complete_outbound")
        )
      ) {
        throw new Error("persist-after-provider failed");
      }

      return { rows: [{ ok: true }] };
    },
  })),
}));

vi.mock("@/server/channels/registry", () => ({
  getCommunicationProviderRegistration: vi.fn((channel: string, provider: string) => ({
    channel,
    id: provider,
    environments: ["production"],
  })),
  getTextCommunicationProvider: vi.fn(() => ({ sendText: state.whatsappSend })),
  getEmailCommunicationProvider: vi.fn(() => ({ sendEmail: state.emailSend })),
  getSmsCommunicationProvider: vi.fn(() => ({ sendSms: state.smsSend })),
}));

const common = {
  businessId: "20000000-0000-4000-8000-000000000001",
  conversationId: "60000000-0000-4000-8000-000000000001",
  userId: "10000000-0000-4000-8000-000000000003",
  requestId: "80000000-0000-4000-8000-000000000001",
};

beforeEach(() => {
  state.channel = "whatsapp";
  state.executionMode = "production";
  state.providerEnvironment = "production";
  state.created = true;
  state.deliveryStatus = "sending";
  state.throwOnComplete = false;
  state.queries.length = 0;
  state.whatsappSend.mockReset().mockResolvedValue({ providerMessageId: "wamid.outbound" });
  state.emailSend.mockReset().mockResolvedValue({
    providerMessageId: "resend.outbound",
    rfcMessageId: "<outbound@codeedge.test>",
  });
  state.smsSend.mockReset().mockResolvedValue({
    providerMessageId: "SM22222222222222222222222222222222",
    status: "queued",
  });
  process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
});

describe("consolidated communication dispatch", () => {
  it("preserves the production WhatsApp path", async () => {
    state.channel = "whatsapp";
    await expect(sendWhatsAppReply({ ...common, body: "WhatsApp" }))
      .resolves.toMatchObject({ status: "sent" });
    expect(state.whatsappSend).toHaveBeenCalledTimes(1);
    expect(state.queries.some(({ sql }) => sql.includes("whatsapp_complete_outbound"))).toBe(true);
  });

  it("preserves the production Email path", async () => {
    state.channel = "email";
    await expect(sendEmailReply({ ...common, body: "Email" }))
      .resolves.toMatchObject({ status: "queued" });
    expect(state.emailSend).toHaveBeenCalledTimes(1);
    expect(state.queries.some(({ sql }) => sql.includes("email_complete_outbound"))).toBe(true);
  });

  it("preserves the production SMS path", async () => {
    state.channel = "sms";
    await expect(sendSmsReply({ ...common, body: "SMS" }))
      .resolves.toMatchObject({ status: "queued" });
    expect(state.smsSend).toHaveBeenCalledTimes(1);
    expect(state.queries.some(({ sql }) => sql.includes("sms_complete_outbound"))).toBe(true);
  });

  it.each([
    ["whatsapp", () => sendWhatsAppReply({ ...common, body: "Blocked WA" }), state.whatsappSend, "whatsapp_fail_outbound"],
    ["email", () => sendEmailReply({ ...common, body: "Blocked Email" }), state.emailSend, "email_fail_outbound"],
    ["sms", () => sendSmsReply({ ...common, body: "Blocked SMS" }), state.smsSend, "sms_fail_outbound"],
  ] as const)("blocks Demo before resolving/dispatching the live %s adapter", async (
    channel,
    send,
    providerSend,
    failureRpc,
  ) => {
    state.channel = channel;
    state.executionMode = "demo";

    await expect(send()).rejects.toThrow(/delivery failed/i);
    expect(providerSend).not.toHaveBeenCalled();
    const failure = state.queries.find(({ sql }) => sql.includes(failureRpc));
    expect(failure?.args?.[1]).toBe("external_effect_demo_live_blocked");
  });

  it("keeps an existing ambiguous request duplicate-safe without another provider call", async () => {
    state.channel = "sms";
    state.created = false;
    state.deliveryStatus = "sending";

    await expect(sendSmsReply({ ...common, body: "Retry" }))
      .resolves.toMatchObject({ status: "sending" });
    expect(state.smsSend).not.toHaveBeenCalled();
    expect(state.queries.some(({ sql }) => sql.includes("communication_execution_context"))).toBe(false);
  });

  it("marks a provider rejection failed with the provider error code", async () => {
    state.channel = "whatsapp";
    state.whatsappSend.mockRejectedValue(new ProviderDeliveryError("meta_test_failure"));

    await expect(sendWhatsAppReply({ ...common, body: "Provider fail" }))
      .rejects.toThrow(/delivery failed/i);

    const failure = state.queries.find(({ sql }) => sql.includes("whatsapp_fail_outbound"));
    expect(failure?.args?.[1]).toBe("meta_test_failure");
  });

  it("does not resend when provider acceptance succeeded but completion persistence is ambiguous", async () => {
    state.channel = "email";
    state.throwOnComplete = true;

    await expect(sendEmailReply({ ...common, body: "Ambiguous" }))
      .resolves.toMatchObject({ status: "sending" });
    expect(state.emailSend).toHaveBeenCalledTimes(1);
  });
});
