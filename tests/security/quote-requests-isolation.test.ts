import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

const quoteA = "60000000-0000-4000-8000-000000000001";
const quoteB = "60000000-0000-4000-8000-000000000002";

describe("Business OS Quote Request tenant isolation", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);
    await db.query(
      `insert into public.quote_requests(id,business_id,lead_id,details,status,created_by) values
        ($1,$2,$3,'Business A quote','requested',$4),
        ($5,$6,$7,'Business B quote','reviewing',$8)`,
      [quoteA, f.businessA, f.leadA, f.ownerA, quoteB, f.businessB, f.leadB, f.ownerB],
    );
  });

  afterAll(async () => db.close());
  beforeEach(async () => db.exec("SAVEPOINT quote_security_case"));
  afterEach(async () => db.exec("ROLLBACK TO SAVEPOINT quote_security_case; RELEASE SAVEPOINT quote_security_case"));

  it.each([
    [f.ownerA, quoteA],
    [f.staffA, quoteA],
    [f.ownerB, quoteB],
  ])("member reads only own-tenant Quote Requests", async (userId, expectedId) => {
    await asUser(db, userId);
    expect((await db.query("select id from public.quote_requests")).rows).toEqual([{ id: expectedId }]);
  });

  it("allows staff to create a Quote Request for an own-tenant Lead", async () => {
    await asUser(db, f.staffA);
    const result = await db.query<{ status: string }>(
      `insert into public.quote_requests(business_id,lead_id,details,status,created_by)
       values ($1,$2,'Staff quote','requested',$3) returning status`,
      [f.businessA, f.leadA, f.staffA],
    );
    expect(result.rows).toEqual([{ status: "requested" }]);
  });

  it("rejects cross-tenant creation and forged creators", async () => {
    await asUser(db, f.staffA);
    await expect(db.query(
      `insert into public.quote_requests(business_id,lead_id,details,status,created_by)
       values ($1,$2,'Attack','requested',$3)`,
      [f.businessB, f.leadB, f.staffA],
    )).rejects.toThrow(/row-level security/);

    await db.exec("ROLLBACK TO SAVEPOINT quote_security_case; SAVEPOINT quote_security_case");
    await asUser(db, f.ownerA);
    await expect(db.query(
      `insert into public.quote_requests(business_id,lead_id,details,status,created_by)
       values ($1,$2,'Forged','requested',$3)`,
      [f.businessA, f.leadA, f.ownerB],
    )).rejects.toThrow(/row-level security/);
  });

  it("rejects a cross-tenant Lead relationship", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query(
      `insert into public.quote_requests(business_id,lead_id,details,status,created_by)
       values ($1,$2,'Wrong Lead','requested',$3)`,
      [f.businessA, f.leadB, f.ownerA],
    )).rejects.toThrow(/foreign key/);
  });

  it("allows status changes only within the current tenant", async () => {
    await asUser(db, f.staffA);
    expect((await db.query(
      "update public.quote_requests set status='quoted' where id=$1 returning status",
      [quoteA],
    )).rows).toEqual([{ status: "quoted" }]);

    expect((await db.query(
      "update public.quote_requests set status='declined' where id=$1 returning id",
      [quoteB],
    )).rows).toEqual([]);
  });

  it("rejects invalid data and status values", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query(
      `insert into public.quote_requests(business_id,lead_id,details,status,created_by)
       values ($1,$2,' ','requested',$3)`,
      [f.businessA, f.leadA, f.ownerA],
    )).rejects.toThrow(/check constraint/);

    await db.exec("ROLLBACK TO SAVEPOINT quote_security_case; SAVEPOINT quote_security_case");
    await asUser(db, f.ownerA);
    await expect(db.query(
      "update public.quote_requests set status='paid' where id=$1",
      [quoteA],
    )).rejects.toThrow();
  });

  it("denies anonymous access", async () => {
    await asUser(db, null);
    await expect(db.query("select * from public.quote_requests")).rejects.toThrow(/permission denied/);
  });
});
