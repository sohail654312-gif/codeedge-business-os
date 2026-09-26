import "server-only";

export type TenantCredentialEnvironment = "sandbox" | "production";

export type TenantBoundCredentialExpectation = {
  businessId: string;
  provider: string;
  environment: TenantCredentialEnvironment;
  expectedMetadata?: Record<string, string>;
};

type CredentialEntry = {
  businessId: string;
  provider: string;
  environment: TenantCredentialEnvironment;
  secret: string;
} & Record<string, unknown>;

function credentialMap(raw: string | undefined, label: string) {
  if (!raw) {
    throw new Error(`${label} credentials are not configured.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} credentials configuration is invalid.`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} credentials configuration is invalid.`);
  }

  return parsed as Record<string, unknown>;
}

function credentialEntry(
  raw: string | undefined,
  credentialKey: string,
  label: string,
): CredentialEntry {
  const value = credentialMap(raw, label)[credentialKey];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    // Legacy alias -> raw secret mappings intentionally fail closed.
    throw new Error(`${label} credential is unavailable.`);
  }

  const entry = value as Record<string, unknown>;
  if (
    typeof entry.businessId !== "string"
    || typeof entry.provider !== "string"
    || (entry.environment !== "sandbox" && entry.environment !== "production")
    || typeof entry.secret !== "string"
  ) {
    throw new Error(`${label} credential is unavailable.`);
  }

  return entry as CredentialEntry;
}

export function resolveTenantBoundSecret(input: {
  raw: string | undefined;
  credentialKey: string;
  label: string;
  minimumSecretLength: number;
  expected: TenantBoundCredentialExpectation;
}) {
  const entry = credentialEntry(input.raw, input.credentialKey, input.label);

  if (
    entry.businessId !== input.expected.businessId
    || entry.provider !== input.expected.provider
    || entry.environment !== input.expected.environment
  ) {
    throw new Error(`${input.label} credential is unavailable.`);
  }

  for (const [key, expectedValue] of Object.entries(
    input.expected.expectedMetadata ?? {},
  )) {
    if (entry[key] !== expectedValue) {
      throw new Error(`${input.label} credential is unavailable.`);
    }
  }

  if (entry.secret.length < input.minimumSecretLength) {
    throw new Error(`${input.label} credential is unavailable.`);
  }

  return entry.secret;
}

export function tenantBoundCredentialConfigured(input: {
  raw: string | undefined;
  credentialKey: string | null | undefined;
  label: string;
  minimumSecretLength: number;
}) {
  if (!input.credentialKey) return false;
  try {
    const value = credentialMap(input.raw, input.label)[input.credentialKey];
    return Boolean(
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && typeof (value as Record<string, unknown>).businessId === "string"
      && typeof (value as Record<string, unknown>).provider === "string"
      && ["sandbox", "production"].includes(
        String((value as Record<string, unknown>).environment),
      )
      && typeof (value as Record<string, unknown>).secret === "string"
      && ((value as Record<string, unknown>).secret as string).length
        >= input.minimumSecretLength
    );
  } catch {
    return false;
  }
}
