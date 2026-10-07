import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/server/cigo/capability", () => ({
  withCigoReadCapability: (work: (db: { query: typeof query }) => unknown) => work({ query }),
}));
import { readCigoProjection } from "@/server/cigo/read-model";

describe("CIGO projection pagination", () => {
  beforeEach(() => query.mockReset());
  it("retains the exact PostgreSQL microsecond ordering boundary across pages", async () => {
    const time = "2026-10-07 16:20:00.123456+00";
    const row = (id: string) => ({ sort_time: time, sort_id: id, record: {
      externalReference: `lead:${id}`, version: time, observedAt: time, value: { status: "new" },
    } });
    query.mockResolvedValueOnce({ rows: [row("a"), row("b")] });
    const input = { workspaceId: "synthetic-workspace", keyId: "synthetic", credentialFingerprint: "f".repeat(64), resourceKind: "lead" as const, limit: 1 };
    const first = await readCigoProjection(input);
    expect(first.nextState).toEqual({ afterTime: time, afterId: "a" });
    expect(first.records[0].observedAt).toBe("2026-10-07T16:20:00.123Z");
    query.mockResolvedValueOnce({ rows: [row("b")] });
    const second = await readCigoProjection({ ...input, cursor: first.nextState });
    expect(query.mock.calls[1][1].slice(5)).toEqual([time, "a"]);
    expect(second.records[0].reference.externalReference).toBe("lead:b");
    expect(second.nextState).toBeUndefined();
  });
});
