import { describe, expect, it } from "vitest";
import { authorizeCigoReadRequest } from "@/server/cigo/auth";

const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const secret = "a".repeat(48);
const raw = JSON.stringify({
  key_a: { businessId: A, secret },
  key_b: { businessId: B, secret: "b".repeat(48) },
});

describe("CIGO read service authentication", () => {
  it("authorizes only the server-bound workspace grant", () => {
    expect(authorizeCigoReadRequest({
      workspaceId: A,
      keyId: "key_a",
      authorization: `Bearer ${secret}`,
      rawCredentials: raw,
    })).toEqual({ businessId: A, keyId: "key_a" });
  });

  it("rejects cross-workspace swapping even with another valid-looking target", () => {
    expect(() => authorizeCigoReadRequest({
      workspaceId: B,
      keyId: "key_a",
      authorization: `Bearer ${secret}`,
      rawCredentials: raw,
    })).toThrow(/denied/i);
  });

  it("fails closed for missing, weak, malformed, wrong or revoked credentials", () => {
    const attempts = [
      { workspaceId: A, keyId: null, authorization: `Bearer ${secret}`, rawCredentials: raw },
      { workspaceId: A, keyId: "key_a", authorization: null, rawCredentials: raw },
      { workspaceId: A, keyId: "key_a", authorization: "Bearer wrong", rawCredentials: raw },
      { workspaceId: A, keyId: "key_a", authorization: `Bearer ${secret}`, rawCredentials: "{}" },
      { workspaceId: A, keyId: "key_a", authorization: `Bearer ${secret}`, rawCredentials: JSON.stringify({ key_a: { businessId: A, secret: "short" } }) },
    ];
    for (const attempt of attempts) {
      expect(() => authorizeCigoReadRequest(attempt)).toThrow();
    }
  });
});
