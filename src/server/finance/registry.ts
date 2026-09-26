import "server-only";

import type { FinanceEngineId } from "./domain";
import type { FinanceEngine } from "./engine";
import { demoFinanceEngine } from "./demo-engine";
import { createERPNextFinanceEngine } from "./erpnext-engine";
import { resolveERPNextFinanceCredential } from "./credentials";
import {
  financeEngineMetadata,
  type FinanceEngineMetadata,
} from "./provider-metadata";

export type FinanceEngineRegistration = FinanceEngineMetadata;

export const financeEngineRegistry:
  Record<FinanceEngineId, FinanceEngineRegistration> = financeEngineMetadata;

export function getFinanceEngineRegistration(id: string) {
  const registration = financeEngineRegistry[id as FinanceEngineId];
  if (!registration) throw new Error("finance_unknown_engine");
  return registration;
}

export function getFinanceEngine(input: {
  businessId: string;
  engine: string;
  credentialKey: string;
}): FinanceEngine {
  const registration = getFinanceEngineRegistration(input.engine);

  if (registration.id === "demo_finance") {
    return demoFinanceEngine;
  }

  const credential = resolveERPNextFinanceCredential(
    input.credentialKey,
    input.businessId,
  );
  return createERPNextFinanceEngine(credential);
}
