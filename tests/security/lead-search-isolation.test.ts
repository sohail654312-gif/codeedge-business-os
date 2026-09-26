import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

describe("Business OS Lead search isolation", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);
    await db.query(
      `insert into public.leads(
        business_id,contact_name,phone,email,source,service_id,enquiry_summary,status,created_by
      ) values
        ($1,'Alice Boiler','07000111222','alice@example.test','google',$2,'Boiler pressure issue','qualified',$3),
        ($1,'Bob Bathroom','07000999888','bob@example.test','referral',$2,'Bathroom renovation quote','contacted',$3)`,
      [f.businessA, f.serviceA, f.ownerA],
    );
  });

  afterAll(async () => db.close());
  beforeEach(async () => db.exec("SAVEPOINT lead_search_case"));
  afterEach(async () => db.exec("ROLLBACK TO SAVEPOINT lead_search_case; RELEASE SAVEPOINT lead_search_case"));

  async function search(
    businessId: string,
    query: string | null,
    status: string | null,
    source: string | null,
    serviceId: string | null,
  ) {
    return db.query<{ contact_name: string }>(
      `select contact_name from public.search_leads(
        $1::uuid,$2::text,$3::public.lead_status,$4::text,$5::uuid
      ) order by contact_name`,
      [businessId, query, status, source, serviceId],
    );
  }

  it.each([
    ["alice", "Alice Boiler"],
    ["07000999888", "Bob Bathroom"],
    ["bob@example.test", "Bob Bathroom"],
    ["pressure issue", "Alice Boiler"],
  ])("searches allowed Lead fields for the current tenant: %s", async (query, expected) => {
    await asUser(db, f.ownerA);
    expect((await search(f.businessA, query, null, null, null)).rows)
      .toContainEqual({ contact_name: expected });
  });

  it("filters by status, source and service", async () => {
    await asUser(db, f.ownerA);
    expect((await search(f.businessA, null, "qualified", "google", f.serviceA)).rows)
      .toEqual([{ contact_name: "Alice Boiler" }]);
  });

  it("does not expose another tenant even with a forged business id parameter", async () => {
    await asUser(db, f.ownerA);
    expect((await search(f.businessB, null, null, null, null)).rows).toEqual([]);
  });

  it("returns no rows for another tenant's service filter", async () => {
    await asUser(db, f.ownerA);
    expect((await search(f.businessA, null, null, null, f.serviceB)).rows).toEqual([]);
  });

  it("supports deterministic pages beyond the former 250-row ceiling with an exact count", async () => {
    await db.exec("RESET ROLE");
    await db.query(
      `insert into public.leads(
        business_id,contact_name,phone,email,source,enquiry_summary,status,created_by
      )
      select $1,'Bulk Lead ' || gs,'07000' || lpad(gs::text,6,'0'),'','manual',
        'Bulk pagination boundary','new',$2
      from generate_series(1,275) gs`,
      [f.businessA, f.ownerA],
    );

    await asUser(db, f.ownerA);
    const count = await db.query<{ count_leads: string }>(
      "select public.count_leads($1,$2,null,null,null)::text",
      [f.businessA, "Bulk Lead"],
    );
    expect(count.rows[0]?.count_leads).toBe("275");

    const lastPage = await db.query<{ contact_name: string }>(
      `select contact_name
       from public.search_leads($1,$2,null,null,null)
       limit 50 offset 250`,
      [f.businessA, "Bulk Lead"],
    );
    expect(lastPage.rows).toHaveLength(25);
  });

  it("denies anonymous RPC access", async () => {
    await asUser(db, null);
    await expect(search(f.businessA, null, null, null, null))
      .rejects.toThrow(/permission denied/);
  });
});
