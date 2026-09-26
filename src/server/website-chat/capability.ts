import "server-only";

import {
  createRestrictedCapability,
  type RestrictedCapabilityDb,
  validateRestrictedDatabaseConnection,
} from "@/server/db/restricted-capability";

export type WebsiteChatCapabilityDb = RestrictedCapabilityDb;

export function websiteChatConnection(value: string | undefined) {
  return validateRestrictedDatabaseConnection(value, "Website Chat");
}

export const websiteChatCapabilityConfig = {
  label: "Website Chat",
  connectionString: () => process.env.CHAT_DATABASE_URL,
  role: "codeedge_chat_api" as const,
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

const capability = createRestrictedCapability(websiteChatCapabilityConfig);

export const withWebsiteChatCapability = capability.withCapability;
