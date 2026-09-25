import "server-only";

import { z } from "zod";
import { withCommunicationCapability } from "./capability";
import {
  getCommunicationProviderRegistration,
  type ExternalCommunicationChannel,
  type ProviderEnvironment,
} from "./registry";

export const executionModes = ["demo", "sandbox", "production"] as const;
export type ExecutionMode = (typeof executionModes)[number];

const executionContextRowSchema = z.object({
  business_id: z.string().uuid(),
  execution_mode: z.enum(executionModes),
  channel: z.enum(["whatsapp", "email", "sms"]),
  provider: z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),
  provider_environment: z.enum(["sandbox", "production"]),
  correlation_id: z.string().uuid().nullable(),
  simulated: z.boolean(),
});

export type CommunicationExecutionContext = {
  businessId: string;
  executionMode: ExecutionMode;
  action: "communication.send";
  channel: ExternalCommunicationChannel;
  provider: string;
  providerEnvironment: ProviderEnvironment;
  correlationId: string | null;
  simulated: boolean;
};

export class ExternalEffectBlockedError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("External effect blocked by workspace safety policy.");
    this.name = "ExternalEffectBlockedError";
    this.code = code;
  }
}

export async function loadCommunicationExecutionContext(
  messageId: string,
): Promise<CommunicationExecutionContext> {
  const row = await withCommunicationCapability(async (db) => {
    const result = await db.query(
      "select * from public.communication_execution_context($1)",
      [messageId],
    );
    return result.rows[0] ?? null;
  });

  const parsed = executionContextRowSchema.safeParse(row);
  if (!parsed.success) {
    throw new ExternalEffectBlockedError("external_effect_invalid_context");
  }

  return {
    businessId: parsed.data.business_id,
    executionMode: parsed.data.execution_mode,
    action: "communication.send",
    channel: parsed.data.channel,
    provider: parsed.data.provider,
    providerEnvironment: parsed.data.provider_environment,
    correlationId: parsed.data.correlation_id,
    simulated: parsed.data.simulated,
  };
}

export function assertCommunicationExternalEffectAllowed(
  context: CommunicationExecutionContext,
) {
  if (
    !executionModes.includes(context.executionMode)
    || !["sandbox", "production"].includes(context.providerEnvironment)
    || !["whatsapp", "email", "sms"].includes(context.channel)
    || !context.provider
  ) {
    throw new ExternalEffectBlockedError("external_effect_invalid_context");
  }

  let registration;
  try {
    registration = getCommunicationProviderRegistration(
      context.channel,
      context.provider,
    );
  } catch {
    throw new ExternalEffectBlockedError("external_effect_unknown_provider");
  }

  if (context.simulated) {
    // Simulated effects never need permission to reach a real adapter.
    throw new ExternalEffectBlockedError("external_effect_simulated_live_blocked");
  }

  if (context.executionMode === "demo") {
    throw new ExternalEffectBlockedError("external_effect_demo_live_blocked");
  }

  if (
    context.executionMode === "sandbox"
    && context.providerEnvironment !== "sandbox"
  ) {
    throw new ExternalEffectBlockedError("external_effect_sandbox_production_blocked");
  }

  if (
    context.executionMode === "production"
    && context.providerEnvironment !== "production"
  ) {
    throw new ExternalEffectBlockedError("external_effect_production_environment_blocked");
  }

  if (!registration.environments.includes(context.providerEnvironment)) {
    throw new ExternalEffectBlockedError("external_effect_provider_environment_unsupported");
  }

  return context;
}

export async function requireCommunicationExternalEffectAllowed(
  messageId: string,
  expected: {
    channel: ExternalCommunicationChannel;
    provider: string;
  },
) {
  const context = await loadCommunicationExecutionContext(messageId);

  if (
    context.channel !== expected.channel
    || context.provider !== expected.provider
  ) {
    throw new ExternalEffectBlockedError("external_effect_context_mismatch");
  }

  return assertCommunicationExternalEffectAllowed(context);
}
