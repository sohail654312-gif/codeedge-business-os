import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { CigoReadResourceKind } from "./contract";

type CursorScope = Readonly<{
  workspaceId: string;
  resourceKind: CigoReadResourceKind;
  limit: number;
}>;

export type CigoReadCursorState = Readonly<{
  afterTime: string;
  afterId: string;
}>;

type Payload = {
  v: 1;
  s: CursorScope;
  p: CigoReadCursorState;
  exp: number;
};

const domain = Buffer.from("codeedge:business-os:cigo-read-cursor:v1");
const idPattern = /^[A-Za-z0-9_-]{1,32}$/;

function validIso(value: string) {
  return typeof value === "string"
    && value.length <= 64
    && Number.isFinite(Date.parse(value));
}

export class BusinessOsCigoReadCursorCodec {
  private readonly keys: ReadonlyMap<string, Uint8Array>;

  constructor(
    keys: ReadonlyMap<string, Uint8Array>,
    private readonly activeKeyId: string,
    private readonly now: () => number = () => Date.now(),
    private readonly ttlMs = 300_000,
  ) {
    if (
      !Number.isSafeInteger(ttlMs)
      || ttlMs < 1000
      || ttlMs > 86_400_000
      || !keys.size
      || !idPattern.test(activeKeyId)
      || !keys.has(activeKeyId)
      || ![...keys].every(([id, key]) => (
        idPattern.test(id)
        && Buffer.from(key).length === 32
      ))
    ) {
      throw new Error("Invalid CIGO read cursor configuration.");
    }
    this.keys = new Map([...keys].map(([id, key]) => [id, Buffer.from(key)]));
  }

  encode(scope: CursorScope, state: CigoReadCursorState) {
    if (
      !scope.workspaceId
      || !scope.resourceKind
      || !Number.isSafeInteger(scope.limit)
      || scope.limit < 1
      || scope.limit > 100
      || !validIso(state.afterTime)
      || !state.afterId
      || state.afterId.length > 255
    ) {
      throw new Error("Invalid CIGO read cursor scope.");
    }
    const current = this.now();
    if (!Number.isSafeInteger(current) || current < 0) {
      throw new Error("Invalid CIGO read cursor clock.");
    }
    const nonce = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      this.keys.get(this.activeKeyId)!,
      nonce,
    );
    cipher.setAAD(domain);
    const payload: Payload = {
      v: 1,
      s: scope,
      p: state,
      exp: current + this.ttlMs,
    };
    const body = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    const token = [
      "v1",
      this.activeKeyId,
      nonce.toString("base64url"),
      body.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
    ].join(".");
    if (token.length > 4096) throw new Error("CIGO read cursor is too long.");
    return token;
  }

  decode(scope: CursorScope, token: string): CigoReadCursorState | undefined {
    if (
      typeof token !== "string"
      || token.length > 4096
      || !/^v1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
    ) return undefined;
    const [version, kid, iv, body, tag] = token.split(".");
    const key = this.keys.get(kid);
    if (version !== "v1" || !key) return undefined;
    try {
      const nonce = Buffer.from(iv, "base64url");
      const encrypted = Buffer.from(body, "base64url");
      const authTag = Buffer.from(tag, "base64url");
      if (
        nonce.length !== 12
        || authTag.length !== 16
        || !encrypted.length
        || encrypted.length > 3072
        || nonce.toString("base64url") !== iv
        || encrypted.toString("base64url") !== body
        || authTag.toString("base64url") !== tag
      ) return undefined;
      const decipher = createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAAD(domain);
      decipher.setAuthTag(authTag);
      const payload = JSON.parse(Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString("utf8")) as Payload;
      const current = this.now();
      if (
        payload.v !== 1
        || payload.s?.workspaceId !== scope.workspaceId
        || payload.s?.resourceKind !== scope.resourceKind
        || payload.s?.limit !== scope.limit
        || !Number.isSafeInteger(payload.exp)
        || !Number.isSafeInteger(current)
        || current >= payload.exp
        || payload.exp - current > this.ttlMs
        || !payload.p
        || !validIso(payload.p.afterTime)
        || !payload.p.afterId
        || payload.p.afterId.length > 255
      ) return undefined;
      return {
        afterTime: payload.p.afterTime,
        afterId: payload.p.afterId,
      };
    } catch {
      return undefined;
    }
  }
}

function decodeKey(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error("Invalid CIGO read cursor key.");
  }
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== value) {
    throw new Error("Invalid CIGO read cursor key.");
  }
  return key;
}

export function cigoReadCursorCodecFromEnvironment(
  env: Record<string, string | undefined> = process.env,
) {
  if (!env.CIGO_READ_CURSOR_KEYS_JSON || !env.CIGO_READ_CURSOR_ACTIVE_KEY_ID) {
    throw new Error("CIGO read cursor is not configured.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(env.CIGO_READ_CURSOR_KEYS_JSON);
  } catch {
    throw new Error("CIGO read cursor is not configured.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CIGO read cursor is not configured.");
  }
  const keys = new Map<string, Uint8Array>();
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!idPattern.test(id)) throw new Error("CIGO read cursor is not configured.");
    keys.set(id, decodeKey(value));
  }
  return new BusinessOsCigoReadCursorCodec(
    keys,
    env.CIGO_READ_CURSOR_ACTIVE_KEY_ID,
  );
}
