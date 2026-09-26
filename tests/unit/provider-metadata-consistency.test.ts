import { describe, expect, it } from "vitest";
import { demoFinanceEngine } from "@/server/finance/demo-engine";
import { createERPNextFinanceEngine } from "@/server/finance/erpnext-engine";
import { financeEngineMetadata } from "@/server/finance/provider-metadata";
import {
  getFinanceEngineRegistration,
} from "@/server/finance/registry";
import { createDemoVoiceProvider } from "@/server/voice/demo";
import { createVapiVoiceProvider } from "@/server/voice/vapi";
import { voiceProviderMetadata } from "@/server/voice/provider-metadata";
import {
  getVoiceProviderRegistration,
} from "@/server/voice/registry";

const asSortedArray = (values: ReadonlySet<string> | readonly string[]) =>
  [...values].sort();

describe("provider capability metadata", () => {
  it("derives Finance adapter capability sets from the authoritative metadata", () => {
    const erp = createERPNextFinanceEngine({
      businessId: "20000000-0000-4000-8000-000000000001",
      baseUrl: "https://erp.example.test",
      apiKey: "test_api_key",
      apiSecret: "test_api_secret",
    });

    expect(asSortedArray(demoFinanceEngine.capabilities))
      .toEqual(asSortedArray(financeEngineMetadata.demo_finance.capabilities));
    expect(asSortedArray(erp.capabilities))
      .toEqual(asSortedArray(financeEngineMetadata.erpnext.capabilities));
    expect(getFinanceEngineRegistration("erpnext"))
      .toBe(financeEngineMetadata.erpnext);
    expect(() => getFinanceEngineRegistration("unknown"))
      .toThrow("finance_unknown_engine");
  });

  it("derives Voice adapter metadata from one authoritative source", () => {
    const demo = createDemoVoiceProvider();
    const vapi = createVapiVoiceProvider({
      credentialKey: "unused_in_metadata_test",
      assistantId: "assistant-test",
      phoneNumberId: "phone-test",
    });

    expect(demo.metadata).toBe(voiceProviderMetadata.demo_voice);
    expect(vapi.metadata).toBe(voiceProviderMetadata.vapi);
    expect(getVoiceProviderRegistration("demo_voice"))
      .toMatchObject(voiceProviderMetadata.demo_voice);
    expect(() => getVoiceProviderRegistration("unknown"))
      .toThrow(/unsupported/i);
  });
});
