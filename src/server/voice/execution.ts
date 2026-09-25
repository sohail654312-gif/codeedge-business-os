import "server-only";

import { z } from "zod";
import {
  assertExternalEffectAllowed,
  credentialEnvironments,
  executionModes,
  ExternalEffectBlockedError,
  type ExternalEffectContext,
} from "@/server/execution/external-effects";
import { withVoiceCapability } from "./capability";
import {
  getVoiceProviderRegistration,
  type VoiceProviderConnectionConfig,
} from "./registry";

const rowSchema = z.object({
  business_id: z.string().uuid(),
  execution_mode: z.enum(executionModes),
  prepared_execution_mode: z.enum(executionModes),
  provider: z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),
  provider_environment: z.enum(credentialEnvironments),
  prepared_provider_environment: z.enum(credentialEnvironments),
  correlation_id: z.string().uuid().nullable(),
  simulated: z.boolean(),
});

export type VoiceExecutionContext = ExternalEffectContext & {
  action: "voice.call";
};

export { ExternalEffectBlockedError };

export async function loadVoiceExecutionContext(
  voiceCallId: string,
): Promise<VoiceExecutionContext> {
  const row = await withVoiceCapability(async (db) => {
    const result = await db.query(
      "select * from public.voice_external_effect_context($1)",
      [voiceCallId],
    );
    return result.rows[0] ?? null;
  });

  const parsed = rowSchema.safeParse(row);
  if (!parsed.success) {
    throw new ExternalEffectBlockedError("external_effect_invalid_context");
  }

  if (
    parsed.data.execution_mode !== parsed.data.prepared_execution_mode
    || parsed.data.provider_environment
      !== parsed.data.prepared_provider_environment
  ) {
    throw new ExternalEffectBlockedError("external_effect_context_changed");
  }

  return {
    businessId: parsed.data.business_id,
    executionMode: parsed.data.execution_mode,
    action: "voice.call",
    provider: parsed.data.provider,
    providerEnvironment: parsed.data.provider_environment,
    correlationId: parsed.data.correlation_id,
    simulated: parsed.data.simulated,
  };
}

export function assertVoiceExternalEffectAllowed(
  context: VoiceExecutionContext,
) {
  assertExternalEffectAllowed(context);

  let registration;
  try {
    registration = getVoiceProviderRegistration(context.provider);
  } catch {
    throw new ExternalEffectBlockedError("external_effect_unknown_provider");
  }

  if (!registration.externalEffect || context.provider === "demo_voice") {
    throw new ExternalEffectBlockedError("external_effect_invalid_context");
  }

  if (!registration.environments.includes(context.providerEnvironment)) {
    throw new ExternalEffectBlockedError(
      "external_effect_provider_environment_unsupported",
    );
  }

  return context;
}

export async function requireVoiceExternalEffectAllowed(
  voiceCallId: string,
  expectedProvider: string,
) {
  const context = await loadVoiceExecutionContext(voiceCallId);
  if (context.provider !== expectedProvider) {
    throw new ExternalEffectBlockedError("external_effect_context_mismatch");
  }
  return assertVoiceExternalEffectAllowed(context);
}

export type PreparedVoiceProviderConfig = VoiceProviderConnectionConfig & {
  providerEnvironment: "sandbox" | "production";
};
