import "server-only";

import {
  createRestrictedCapability,
  type RestrictedCapabilityDb,
} from "@/server/db/restricted-capability";

export type AutomationCapabilityDb = RestrictedCapabilityDb;

export const automationCapabilityConfig = {
  label: "Automation",
  connectionString: () => (
    process.env.AUTOMATION_DATABASE_URL
    ?? process.env.COMMUNICATION_DATABASE_URL
  ),
  role: "codeedge_automation_api" as const,
  pool: {
    max: 3,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
  },
  transaction: {
    statementTimeoutMillis: 12000,
    lockTimeoutMillis: 3000,
    idleTransactionTimeoutMillis: 15000,
  },
};

const capability = createRestrictedCapability(automationCapabilityConfig);

export const withAutomationCapability = capability.withCapability;
