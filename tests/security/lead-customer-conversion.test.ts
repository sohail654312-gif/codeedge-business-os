import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

describe("Lead to Customer conversion isolation", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT conversion_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT conversion_case; RELEASE SAVEPOINT conversion_case");
  });

  it("converts an own-tenant Lead and preserves the original Lead", async () => {
    await asUser(db, f.ownerA);
    const first = await db.query<{ customer_id: string; created: boolean }>(
      "select * from public.convert_lead_to_customer($1)",
      [f.leadA],
    );

    expect(first.rows).toHaveLength(1);
    expect(first.rows[0]?.created).toBe(true);

    const customer = await db.query<{ business_id: string; source_lead_id: string; created_by: string }>(
      "select business_id,source_lead_id,created_by from public.customers",
    );
    expect(customer.rows).toEqual([{
      business_id: f.businessA,
      source_lead_id: f.leadA,
      created_by: f.ownerA,
    }]);

    expect((await db.query("select id from public.leads where id=$1", [f.leadA])).rows)
      .toEqual([{ id: f.leadA }]);
  });

  it("is idempotent for repeated conversion of the same Lead", async () => {
    await asUser(db, f.staffA);
    const first = await db.query<{ customer_id: string; created: boolean }>(
      "select * from public.convert_lead_to_customer($1)",
      [f.leadA],
    );
    const second = await db.query<{ customer_id: string; created: boolean }>(
      "select * from public.convert_lead_to_customer($1)",
      [f.leadA],
    );

    expect(first.rows[0]?.created).toBe(true);
    expect(second.rows[0]).toEqual({
      customer_id: first.rows[0]!.customer_id,
      created: false,
    });
    expect((await db.query("select id from public.customers")).rows).toHaveLength(1);
  });

  it("rejects cross-tenant conversion", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query(
      "select * from public.convert_lead_to_customer($1)",
      [f.leadB],
    )).rejects.toThrow(/Lead unavailable|permission/i);
  });

  it("rejects revoked members", async () => {
    await asUser(db, f.removedA);
    await expect(db.query(
      "select * from public.convert_lead_to_customer($1)",
      [f.leadA],
    )).rejects.toThrow(/Lead unavailable|permission/i);
  });

  it("rejects anonymous conversion", async () => {
    await asUser(db, null);
    await expect(db.query(
      "select * from public.convert_lead_to_customer($1)",
      [f.leadA],
    )).rejects.toThrow(/permission/i);
  });

  it("keeps Customer reads tenant-scoped", async () => {
    await db.exec("RESET ROLE");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [f.ownerA]);
    await db.exec("SET LOCAL ROLE authenticated");
    await db.query("select * from public.convert_lead_to_customer($1)", [f.leadA]);

    await db.exec("RESET ROLE");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [f.ownerB]);
    await db.exec("SET LOCAL ROLE authenticated");
    await db.query("select * from public.convert_lead_to_customer($1)", [f.leadB]);

    await db.exec("RESET ROLE");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [f.ownerA]);
    await db.exec("SET LOCAL ROLE authenticated");

    expect((await db.query("select business_id from public.customers")).rows)
      .toEqual([{ business_id: f.businessA }]);
  });

  it("prevents deleting a converted Lead so traceability is preserved", async () => {
    await asUser(db, f.ownerA);
    await db.query("select * from public.convert_lead_to_customer($1)", [f.leadA]);

    await expect(db.query("delete from public.leads where id=$1", [f.leadA]))
      .rejects.toThrow(/foreign key|constraint/i);
  });
});
