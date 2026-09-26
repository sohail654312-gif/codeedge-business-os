import "server-only";

import {
  createRestrictedCapability,
  type RestrictedCapabilityDb,
} from "@/server/db/restricted-capability";

export type VoiceCapabilityDb = RestrictedCapabilityDb;

export const voiceCapabilityConfig = {
  label: "Voice",
  connectionString: () => (
    process.env.VOICE_DATABASE_URL
    ?? process.env.COMMUNICATION_DATABASE_URL
  ),
  role: "codeedge_voice_api" as const,
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

const capability = createRestrictedCapability(voiceCapabilityConfig);

export const withVoiceCapability = capability.withCapability;
