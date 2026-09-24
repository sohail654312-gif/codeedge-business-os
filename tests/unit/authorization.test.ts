import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireDefaultTenant,
  requireOwner,
  requireTenant,
  verifiedUser,
} from "../../src/server/authorization/tenant";
import type { Database } from "../../src/types/database";

type MockOptions = {
  user?: Record<string, unknown> | null;
  business?: Record<string, unknown> | null;
  membership?: Record<string, unknown> | null;
};

function fakeClient({
  user = { id: "user-a", email_confirmed_at: "2026-09-24T10:00:00Z" },
  business = {
    id: "business-a",
    name: "Business A",
    slug: "business-a",
    status: "active",
    timezone: "Europe/London",
    created_at: "2026-09-24T10:00:00Z",
    updated_at: "2026-09-24T10:00:00Z",
  },
  membership = {
    business_id: "business-a",
    role: "staff",
    status: "active",
    created_at: "2026-09-24T10:00:00Z",
  },
}: MockOptions = {}) {
  const queries: Array<{ table: string; filters: unknown[][] }> = [];

  const from = vi.fn((table: string) => {
    const query = { table, filters: [] as unknown[][] };
    queries.push(query);

    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((...filter: unknown[]) => {
        query.filters.push(filter);
        return chain;
      }),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: table === "businesses" ? business : membership,
        error: null,
      })),
    };

    return chain;
  });

  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
    },
    from,
  } as unknown as SupabaseClient<Database>;

  return { client, queries, from };
}

describe("runtime tenant authorization", () => {
  it("rejects unauthenticated users before tenant queries", async () => {
    const { client, from } = fakeClient({ user: null });
    await expect(requireTenant(client, { id: "business-a" }))
      .rejects.toMatchObject({ status: 401 });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects unverified email identities", async () => {
    const { client } = fakeClient({ user: { id: "user-a" } });
    await expect(verifiedUser(client)).rejects.toMatchObject({ status: 401 });
  });

  it("fails closed when RLS hides the selected business", async () => {
    const { client } = fakeClient({ business: null });
    await expect(requireTenant(client, { id: "business-b" }))
      .rejects.toMatchObject({ status: 404 });
  });

  it("requires a live active membership after the business lookup", async () => {
    const { client } = fakeClient({ membership: null });
    await expect(requireTenant(client, { id: "business-a" }))
      .rejects.toMatchObject({ status: 404 });
  });

  it("derives role and user from verified runtime data", async () => {
    const { client, queries } = fakeClient();
    const context = await requireTenant(client, { id: "business-a" });

    expect(context.userId).toBe("user-a");
    expect(context.role).toBe("staff");
    expect(context.business.id).toBe("business-a");
    expect(queries[1]?.filters).toEqual([
      ["business_id", "business-a"],
      ["user_id", "user-a"],
      ["status", "active"],
    ]);
    expect(() => requireOwner(context)).toThrow(/Only a business owner/);
  });

  it("resolves the default workspace only from the signed-in user's active membership", async () => {
    const { client, queries } = fakeClient();
    const context = await requireDefaultTenant(client);

    expect(context.business.id).toBe("business-a");
    expect(queries[0]?.table).toBe("business_memberships");
    expect(queries[0]?.filters).toEqual([
      ["user_id", "user-a"],
      ["status", "active"],
    ]);
  });
});
