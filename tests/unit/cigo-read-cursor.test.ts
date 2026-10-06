import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BusinessOsCigoReadCursorCodec } from "@/server/cigo/cursor";

const A = {
  workspaceId: "10000000-0000-4000-8000-000000000001",
  resourceKind: "lead" as const,
  limit: 25,
};
const state = {
  afterTime: "2026-10-06T05:00:00.000Z",
  afterId: "20000000-0000-4000-8000-000000000001",
};

describe("Business OS CIGO read cursor", () => {
  it("is confidential, randomized and round-trips", () => {
    const key = randomBytes(32);
    const codec = new BusinessOsCigoReadCursorCodec(new Map([["k1", key]]), "k1", () => 1000, 10000);
    const one = codec.encode(A, state);
    const two = codec.encode(A, state);
    expect(one).not.toBe(two);
    expect(one).not.toContain(state.afterId);
    expect(codec.decode(A, one)).toEqual(state);
  });

  it("binds workspace, resource, page size, expiry and integrity", () => {
    let now = 1000;
    const codec = new BusinessOsCigoReadCursorCodec(new Map([["k1", randomBytes(32)]]), "k1", () => now, 1000);
    const token = codec.encode(A, state);
    expect(codec.decode({ ...A, workspaceId: "10000000-0000-4000-8000-000000000002" }, token)).toBeUndefined();
    expect(codec.decode({ ...A, resourceKind: "customer" }, token)).toBeUndefined();
    expect(codec.decode({ ...A, limit: 24 }, token)).toBeUndefined();
    const parts = token.split(".");
    parts[3] = parts[3].slice(0, -1) + (parts[3].at(-1) === "A" ? "B" : "A");
    expect(codec.decode(A, parts.join("."))).toBeUndefined();
    now = 2000;
    expect(codec.decode(A, token)).toBeUndefined();
  });

  it("supports rotation while old keys remain and rejects them after removal", () => {
    const oldKey = randomBytes(32);
    const newKey = randomBytes(32);
    const oldCodec = new BusinessOsCigoReadCursorCodec(new Map([["old", oldKey]]), "old", () => 1000, 10000);
    const token = oldCodec.encode(A, state);
    const rotating = new BusinessOsCigoReadCursorCodec(new Map([["old", oldKey], ["new", newKey]]), "new", () => 1001, 10000);
    expect(rotating.decode(A, token)).toEqual(state);
    const newOnly = new BusinessOsCigoReadCursorCodec(new Map([["new", newKey]]), "new", () => 1002, 10000);
    expect(newOnly.decode(A, token)).toBeUndefined();
  });
});
