import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

const faqA = "60000000-0000-4000-8000-000000000001";
const faqB = "60000000-0000-4000-8000-000000000002";

describe("FAQ tenant isolation", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);

    await db.query(
      `insert into public.business_faqs(
        id,business_id,question,answer,is_active,display_order
      ) values
        ($1,$2,'FAQ A?','Answer A',true,1),
        ($3,$4,'FAQ B?','Answer B',false,1)`,
      [faqA, f.businessA, faqB, f.businessB],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT faq_security_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT faq_security_case; RELEASE SAVEPOINT faq_security_case");
  });

  it.each([
    [f.ownerA, f.businessA, faqA],
    [f.ownerB, f.businessB, faqB],
    [f.staffA, f.businessA, faqA],
  ])("members read FAQs only for their tenant", async (userId, businessId, faqId) => {
    await asUser(db, userId);

    expect((await db.query<{ id: string; business_id: string }>(
      "select id,business_id from public.business_faqs order by id",
    )).rows).toEqual([{ id: faqId, business_id: businessId }]);
  });

  it("owner creates, updates and deletes FAQs only inside own tenant", async () => {
    await asUser(db, f.ownerA);

    const created = await db.query<{ id: string; business_id: string }>(
      `insert into public.business_faqs(
        business_id,question,answer,is_active,display_order
      ) values ($1,'New FAQ?','New answer',true,2)
      returning id,business_id`,
      [f.businessA],
    );

    expect(created.rows[0]?.business_id).toBe(f.businessA);

    expect((await db.query(
      "update public.business_faqs set answer='Owner edit' where id=$1 returning id",
      [faqA],
    )).rows).toEqual([{ id: faqA }]);

    expect((await db.query(
      "update public.business_faqs set answer='Attack' where id=$1 returning id",
      [faqB],
    )).rows).toEqual([]);

    expect((await db.query(
      "delete from public.business_faqs where id=$1 returning id",
      [faqB],
    )).rows).toEqual([]);

    expect((await db.query(
      "delete from public.business_faqs where id=$1 returning id",
      [faqA],
    )).rows).toEqual([{ id: faqA }]);
  });

  it("owner cannot create a FAQ in another tenant", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      "insert into public.business_faqs(business_id,question,answer) values ($1,'Attack?','Attack')",
      [f.businessB],
    )).rejects.toThrow(/row-level security/);
  });

  it("staff can read but cannot create, update or delete FAQs", async () => {
    await asUser(db, f.staffA);

    expect((await db.query(
      "update public.business_faqs set answer='Staff edit' returning id",
    )).rows).toEqual([]);

    expect((await db.query(
      "delete from public.business_faqs returning id",
    )).rows).toEqual([]);

    await expect(db.query(
      "insert into public.business_faqs(business_id,question,answer) values ($1,'Staff?','No')",
      [f.businessA],
    )).rejects.toThrow(/row-level security/);
  });

  it("FAQ tenant identity cannot be changed", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      "update public.business_faqs set business_id=$1 where id=$2",
      [f.businessB, faqA],
    )).rejects.toThrow(/permission denied/);
  });

  it.each([
    "question=' '",
    "answer=' '",
    "question=repeat('q',301)",
    "answer=repeat('a',5001)",
    "display_order=-1",
    "display_order=10001",
  ])("database rejects invalid FAQ values: %s", async (assignment) => {
    await asUser(db, f.ownerA);

    await expect(db.exec(
      `update public.business_faqs set ${assignment} where id='${faqA}'`,
    )).rejects.toThrow(/check constraint/);
  });

  it("stores FAQ markup-looking input as ordinary text", async () => {
    await asUser(db, f.ownerA);

    const answer = "<script>alert('x')</script>";
    const result = await db.query<{ answer: string }>(
      "update public.business_faqs set answer=$1 where id=$2 returning answer",
      [answer, faqA],
    );

    expect(result.rows).toEqual([{ answer }]);
  });

  it("inactive FAQs remain tenant-private", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query(
      "select id from public.business_faqs where is_active=false",
    )).rows).toEqual([]);

    await asUser(db, f.ownerB);
    expect((await db.query(
      "select id from public.business_faqs where is_active=false",
    )).rows).toEqual([{ id: faqB }]);
  });

  it("revoked members immediately lose FAQ reads", async () => {
    await asUser(db, f.removedA);
    expect((await db.query("select * from public.business_faqs")).rows).toEqual([]);
  });

  it("anonymous users cannot read FAQs", async () => {
    await asUser(db, null);
    await expect(db.query("select * from public.business_faqs"))
      .rejects.toThrow(/permission denied/);
  });

  it("suspended businesses immediately lose FAQ access", async () => {
    await db.query(
      "update public.businesses set status='suspended' where id=$1",
      [f.businessA],
    );
    await asUser(db, f.ownerA);

    expect((await db.query("select * from public.business_faqs")).rows).toEqual([]);
  });

  it("forces RLS on FAQs", async () => {
    const result = await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity,relforcerowsecurity
       from pg_class
       join pg_namespace n on n.oid=relnamespace
       where n.nspname='public' and relname='business_faqs'`,
    );

    expect(result.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
  });
});
