import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDatabase, type TestDatabase } from "../helpers/database";

describe("owner onboarding", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  it("creates an isolated owner workspace only for CodeEdge signups", async () => {
    const userId = "90000000-0000-4000-8000-000000000001";

    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)",
      [
        userId,
        "owner@example.test",
        JSON.stringify({ codeedge_signup: true, business_name: "CodeEdge Test Business" }),
      ],
    );

    const businesses = await db.query<{ id: string; name: string; slug: string }>(
      "select id,name,slug from public.businesses",
    );
    const memberships = await db.query<{ business_id: string; user_id: string; role: string; status: string }>(
      "select business_id,user_id,role,status from public.business_memberships",
    );

    expect(businesses.rows).toHaveLength(1);
    expect(businesses.rows[0]?.name).toBe("CodeEdge Test Business");
    expect(businesses.rows[0]?.slug).toMatch(/^workspace-[a-f0-9]{20}$/);
    expect(memberships.rows).toEqual([{
      business_id: businesses.rows[0]!.id,
      user_id: userId,
      role: "owner",
      status: "active",
    }]);
  });

  it("does not provision users without the CodeEdge signup marker", async () => {
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)",
      [
        "90000000-0000-4000-8000-000000000002",
        "external@example.test",
        JSON.stringify({ business_name: "Should Not Exist" }),
      ],
    );

    expect((await db.query("select id from public.businesses")).rows).toHaveLength(0);
    expect((await db.query("select * from public.business_memberships")).rows).toHaveLength(0);
  });

  it("does not trust metadata for role or tenant assignment", async () => {
    const userId = "90000000-0000-4000-8000-000000000003";

    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)",
      [
        userId,
        "attacker@example.test",
        JSON.stringify({
          codeedge_signup: true,
          business_name: "Isolated Workspace",
          role: "staff",
          tenant_id: "20000000-0000-4000-8000-000000000001",
        }),
      ],
    );

    const membership = await db.query<{ user_id: string; role: string }>(
      "select user_id,role from public.business_memberships",
    );

    expect(membership.rows).toEqual([{ user_id: userId, role: "owner" }]);
  });
});
