import "server-only";

export const executionModes = ["demo", "sandbox", "production"] as const;
export type ExecutionMode = (typeof executionModes)[number];

export const credentialEnvironments = ["sandbox", "production"] as const;
export type CredentialEnvironment = (typeof credentialEnvironments)[number];

export type ExternalEffectContext = {
  businessId: string;
  executionMode: ExecutionMode;
  action: string;
  provider: string;
  providerEnvironment: CredentialEnvironment;
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

export function assertExternalEffectAllowed(
  context: ExternalEffectContext,
) {
  if (
    !executionModes.includes(context.executionMode)
    || !credentialEnvironments.includes(context.providerEnvironment)
    || !context.businessId
    || !context.action
    || !context.provider
  ) {
    throw new ExternalEffectBlockedError("external_effect_invalid_context");
  }

  if (context.simulated) {
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

  return context;
}
