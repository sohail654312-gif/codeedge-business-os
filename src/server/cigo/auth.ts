import "server-only";
import { timingSafeEqual } from "node:crypto";

const businessIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keyIdPattern = /^[A-Za-z0-9_-]{1,64}$/;

export type CigoReadGrant = Readonly<{
  businessId: string;
  secret: string;
}>;

function grantMap(raw: string | undefined) {
  if (!raw) throw new Error("CIGO read credentials are not configured.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("CIGO read credentials configuration is invalid.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CIGO read credentials configuration is invalid.");
  }
  return parsed as Record<string, unknown>;
}

function readGrant(raw: string | undefined, keyId: string): CigoReadGrant {
  if (!keyIdPattern.test(keyId)) throw new Error("CIGO read credential is unavailable.");
  const entry = grantMap(raw)[keyId];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("CIGO read credential is unavailable.");
  }
  const value = entry as Record<string, unknown>;
  if (
    typeof value.businessId !== "string"
    || !businessIdPattern.test(value.businessId)
    || typeof value.secret !== "string"
    || value.secret.length < 32
  ) {
    throw new Error("CIGO read credential is unavailable.");
  }
  return { businessId: value.businessId, secret: value.secret };
}

function constantTimeEqual(expected: string, supplied: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Authenticates a CIGO service credential and binds it to exactly one Business OS workspace.
 * workspaceId is only a requested target; authority comes from the server-held grant.
 */
export function authorizeCigoReadRequest(input: {
  workspaceId: string;
  keyId: string | null;
  authorization: string | null;
  rawCredentials?: string;
}): Readonly<{ businessId: string; keyId: string }> {
  if (!businessIdPattern.test(input.workspaceId)) {
    throw new Error("CIGO read authorization denied.");
  }
  if (!input.keyId || !input.authorization?.startsWith("Bearer ")) {
    throw new Error("CIGO read authorization denied.");
  }
  const grant = readGrant(
    input.rawCredentials ?? process.env.CIGO_READ_CREDENTIALS_JSON,
    input.keyId,
  );
  const supplied = input.authorization.slice("Bearer ".length);
  if (
    grant.businessId !== input.workspaceId
    || !constantTimeEqual(grant.secret, supplied)
  ) {
    throw new Error("CIGO read authorization denied.");
  }
  return { businessId: grant.businessId, keyId: input.keyId };
}
