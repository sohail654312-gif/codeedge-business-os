import "server-only";

import {
  createRestrictedCapability,
  type RestrictedCapabilityDb,
} from "@/server/db/restricted-capability";

export type CigoReadCapabilityDb = RestrictedCapabilityDb;

export const cigoReadCapabilityConfig = {
  label: "CIGO read",
  connectionString: () => (
    process.env.CIGO_DATABASE_URL
    ?? process.env.COMMUNICATION_DATABASE_URL
  ),
  role: "codeedge_cigo_read_api" as const,
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

const capability = createRestrictedCapability(cigoReadCapabilityConfig);

export const withCigoReadCapability = capability.withCapability;
