import "server-only";

import {
  createRestrictedCapability,
  type RestrictedCapabilityDb,
} from "@/server/db/restricted-capability";

export type FinanceCapabilityDb = RestrictedCapabilityDb;

export const financeCapabilityConfig = {
  label: "Finance",
  connectionString: () => (
    process.env.FINANCE_DATABASE_URL
    ?? process.env.COMMUNICATION_DATABASE_URL
  ),
  role: "codeedge_finance_api" as const,
  pool: {
    max: 3,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 12000,
  },
  transaction: {
    statementTimeoutMillis: 12000,
    lockTimeoutMillis: 3000,
    idleTransactionTimeoutMillis: 15000,
  },
};

const capability = createRestrictedCapability(financeCapabilityConfig);

export const withFinanceCapability = capability.withCapability;
