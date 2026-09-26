import "server-only";

import { automationActionRegistry } from "@/server/automation/actions";
import { addMoney } from "@/server/finance/domain";
import { financeEngineMetadata } from "@/server/finance/provider-metadata";
import { createDemoVoiceProvider } from "@/server/voice/demo";
import type { BusinessOsE2ETenant } from "./auth";
import { businessOsE2EPersistence } from "./state";

export function createLeadJourney(context: BusinessOsE2ETenant) {
  return businessOsE2EPersistence.createLead(context.businessId);
}

export function convertLeadJourney(
  context: BusinessOsE2ETenant,
  leadId: string,
) {
  return businessOsE2EPersistence.convertLead(context.businessId, leadId);
}

export function createBookingJourney(context: BusinessOsE2ETenant) {
  return businessOsE2EPersistence.createBooking(context.businessId);
}

export function safeCommunicationJourney(context: BusinessOsE2ETenant) {
  businessOsE2EPersistence.recordCommunication(
    context.businessId,
    "Demo Shared Inbox reply - no provider traffic.",
  );
}

export function automationDemoDryRunJourney(context: BusinessOsE2ETenant) {
  const action = automationActionRegistry["communication.send_email"];
  if (!action.externalEffect) throw new Error("e2e_automation_fixture_invalid");

  businessOsE2EPersistence.recordAutomationDryRun(
    context.businessId,
    action.externalEffect,
  );
}

export async function demoVoiceReceptionistJourney(
  context: BusinessOsE2ETenant,
) {
  const provider = createDemoVoiceProvider();
  if (provider.metadata.externalEffect) {
    throw new Error("e2e_demo_voice_must_not_be_external");
  }

  const result = await provider.startOutboundCall?.({
    correlationId: "80000000-0000-4000-8000-00000000e601",
    fromNumber: "demo:codeedge",
    toNumber: "demo:visitor",
    webhookUrl: "https://example.test/e2e-only",
  });
  if (!result) throw new Error("e2e_demo_voice_unavailable");

  businessOsE2EPersistence.recordVoiceCall(
    context.businessId,
    result.providerCallId,
  );
  businessOsE2EPersistence.createBooking(context.businessId, "voice");
}

export function demoMoneyJourney(context: BusinessOsE2ETenant) {
  const metadata = financeEngineMetadata.demo_finance;
  if (
    metadata.externalEffect
    || !metadata.capabilities.includes("invoices")
    || !metadata.capabilities.includes("payments")
  ) {
    throw new Error("e2e_demo_finance_fixture_invalid");
  }

  const receivables = addMoney(["850.00", "-500.00"]);
  businessOsE2EPersistence.setMoneyJourney(
    context.businessId,
    ["demo-quote-1", "demo-invoice-1", "demo-payment-1"],
    receivables,
  );
}
