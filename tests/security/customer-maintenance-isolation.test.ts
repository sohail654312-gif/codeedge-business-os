import {
  afterAll, afterEach, beforeAll, beforeEach, describe, expect, it,
} from "vitest";
import {
  asUser, fixtures as f, openDatabase, seedDatabase, type TestDatabase,
} from "../helpers/database";

describe("Customer maintenance isolation", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);
  });
  afterAll(async () => db.close());
  beforeEach(async () => db.exec("SAVEPOINT customer_case"));
  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT customer_case; RELEASE SAVEPOINT customer_case");
  });

  it("creates and edits a direct Customer inside the active tenant", async () => {
    await asUser(db, f.ownerA);
    const created = await db.query<{ id: string; source_lead_id: string | null }>(
      `insert into public.customers(
        business_id,contact_name,phone,email,source_lead_id,created_by
      ) values ($1,'Direct Customer','07000123456','',null,$2)
      returning id,source_lead_id`,
      [f.businessA, f.ownerA],
    );
    expect(created.rows[0]?.source_lead_id).toBeNull();

    await db.query(
      "update public.customers set contact_name='Updated Customer' where id=$1",
      [created.rows[0]!.id],
    );
    expect((await db.query<{ contact_name: string }>(
      "select contact_name from public.customers where id=$1",
      [created.rows[0]!.id],
    )).rows).toEqual([{ contact_name: "Updated Customer" }]);
  });

  it("rejects a forged cross-tenant direct Customer", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query(
      `insert into public.customers(
        business_id,contact_name,phone,email,source_lead_id,created_by
      ) values ($1,'Forged','07000999999','',null,$2)`,
      [f.businessB, f.ownerA],
    )).rejects.toThrow();
  });

  it("keeps customer search tenant-scoped and supports origin filtering", async () => {
    await asUser(db, f.ownerA);
    await db.query(
      `insert into public.customers(
        business_id,contact_name,phone,email,source_lead_id,created_by
      ) values ($1,'Searchable Direct','07000888888','',null,$2)`,
      [f.businessA, f.ownerA],
    );

    expect((await db.query<{ contact_name: string }>(
      "select contact_name from public.search_customers($1,$2,$3)",
      [f.businessA, "Searchable", "direct"],
    )).rows).toEqual([{ contact_name: "Searchable Direct" }]);

    expect((await db.query(
      "select * from public.search_customers($1,$2,$3)",
      [f.businessB, null, null],
    )).rows).toEqual([]);
  });

  it("denies anonymous maintenance", async () => {
    await asUser(db, null);
    await expect(db.query(
      `insert into public.customers(
        business_id,contact_name,phone,email,source_lead_id,created_by
      ) values ($1,'Anonymous','07000777777','',null,$2)`,
      [f.businessA, f.ownerA],
    )).rejects.toThrow(/permission denied|row-level security/i);
  });
});
