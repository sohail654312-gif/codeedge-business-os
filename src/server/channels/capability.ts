import "server-only";

import {
  createRestrictedCapability,
  type RestrictedCapabilityDb,
  validateRestrictedDatabaseConnection,
} from "@/server/db/restricted-capability";

export type CommunicationCapabilityDb = RestrictedCapabilityDb;

export function communicationConnection(value: string | undefined) {
  return validateRestrictedDatabaseConnection(value, "Communication");
}

export const communicationCapabilityConfig = {
  label: "Communication",
  connectionString: () => process.env.COMMUNICATION_DATABASE_URL,
  role: "codeedge_communication_api" as const,
  pool: {
    max: 3,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
  },
  transaction: {
    statementTimeoutMillis: 8000,
    lockTimeoutMillis: 3000,
    idleTransactionTimeoutMillis: 10000,
  },
};

const capability = createRestrictedCapability(communicationCapabilityConfig);

export const withCommunicationCapability = capability.withCapability;
