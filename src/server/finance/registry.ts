import "server-only";

import type { FinanceCapability, FinanceEngineId } from "./domain";
import type { FinanceEngine } from "./engine";
import { demoFinanceEngine } from "./demo-engine";
import { createERPNextFinanceEngine } from "./erpnext-engine";
import { resolveERPNextFinanceCredential } from "./credentials";

export type FinanceEngineRegistration = {
  id: FinanceEngineId;
  externalEffect: boolean;
  environments: readonly ("demo" | "sandbox" | "production")[];
  capabilities: readonly FinanceCapability[];
};

export const financeEngineRegistry: Record<FinanceEngineId, FinanceEngineRegistration> = {
  demo_finance: {
    id: "demo_finance",
    externalEffect: false,
    environments: ["demo"],
    capabilities: [
      "health","customers","suppliers","quotations","invoices","payments",
      "bills","expenses","chart_of_accounts","ledger","trial_balance",
      "profit_and_loss","balance_sheet","cash_flow",
    ],
  },
  erpnext: {
    id: "erpnext",
    externalEffect: true,
    environments: ["sandbox","production"],
    capabilities: ["health","customers","suppliers","quotations","invoices"],
  },
};

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
