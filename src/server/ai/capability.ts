import "server-only";

import {
  createRestrictedCapability,
  type RestrictedCapabilityDb,
} from "@/server/db/restricted-capability";

export type AICapabilityDb = RestrictedCapabilityDb;

export const aiCapabilityConfig = {
  label: "AI",
  connectionString: () => (
    process.env.AI_DATABASE_URL
    ?? process.env.FINANCE_DATABASE_URL
    ?? process.env.COMMUNICATION_DATABASE_URL
  ),
  role: "codeedge_ai_api" as const,
  pool: {
    max: 3,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 12000,
  },
  transaction: {
    statementTimeoutMillis: 15000,
    lockTimeoutMillis: 3000,
    idleTransactionTimeoutMillis: 20000,
  },
};

const capability = createRestrictedCapability(aiCapabilityConfig);

export const withAICapability = capability.withCapability;
