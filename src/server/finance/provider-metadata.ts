import type {
  FinanceCapability,
  FinanceEngineId,
} from "./domain";

export type FinanceEngineMetadata = {
  id: FinanceEngineId;
  externalEffect: boolean;
  environments: readonly ("demo" | "sandbox" | "production")[];
  capabilities: readonly FinanceCapability[];
  writeCapabilities: readonly FinanceCapability[];
};

export const financeEngineMetadata = {
  demo_finance: {
    id: "demo_finance",
    externalEffect: false,
    environments: ["demo"],
    capabilities: [
      "health",
      "customers",
      "suppliers",
      "quotations",
      "invoices",
      "payments",
      "bills",
      "expenses",
      "chart_of_accounts",
      "ledger",
      "trial_balance",
      "profit_and_loss",
      "balance_sheet",
      "cash_flow",
    ],
    writeCapabilities: [
      "customers",
      "suppliers",
      "quotations",
      "invoices",
      "payments",
      "bills",
      "expenses",
    ],
  },
  erpnext: {
    id: "erpnext",
    externalEffect: true,
    environments: ["sandbox", "production"],
    capabilities: [
      "health",
      "customers",
      "suppliers",
      "quotations",
      "invoices",
    ],
    writeCapabilities: [
      "customers",
    ],
  },
} as const satisfies Record<FinanceEngineId, FinanceEngineMetadata>;
