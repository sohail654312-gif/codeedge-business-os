import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

describe("Business OS Lead tenant isolation", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT lead_security_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT lead_security_case; RELEASE SAVEPOINT lead_security_case");
  });

  it.each([
    [f.ownerA, f.businessA],
    [f.ownerB, f.businessB],
    [f.staffA, f.businessA],
  ])("member reads only their own tenant leads", async (userId, businessId) => {
    await asUser(db, userId);
    expect((await db.query("select business_id from public.leads")).rows)
      .toEqual([{ business_id: businessId }]);
  });

  it("hides cross-tenant lead reads", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query("select id from public.leads where business_id=$1", [f.businessB])).rows)
      .toEqual([]);
  });

  it("allows owner and staff to create leads only for their active tenant", async () => {
    await asUser(db, f.staffA);
    const created = await db.query<{ id: string }>(
      `insert into public.leads(
        business_id,contact_name,phone,email,source,enquiry_summary,status,created_by
      ) values ($1,'Staff Lead','222','','manual','Created by staff','new',$2)
      returning id`,
      [f.businessA, f.staffA],
    );
    expect(created.rows).toHaveLength(1);

    await expect(db.query(
      `insert into public.leads(
        business_id,contact_name,phone,email,source,enquiry_summary,status,created_by
      ) values ($1,'Attack','333','','manual','Cross tenant','new',$2)`,
      [f.businessB, f.staffA],
    )).rejects.toThrow(/row-level security/);
  });

  it("rejects forged creators", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query(
      `insert into public.leads(
        business_id,contact_name,phone,email,source,enquiry_summary,status,created_by
      ) values ($1,'Attack','333','','manual','Forged creator','new',$2)`,
      [f.businessA, f.ownerB],
    )).rejects.toThrow(/row-level security/);
  });

  it("allows staff to update own-tenant leads but not delete them", async () => {
    await asUser(db, f.staffA);
    expect((await db.query(
      "update public.leads set status='qualified' where id=$1 returning status",
      [f.leadA],
    )).rows).toEqual([{ status: "qualified" }]);

    expect((await db.query(
      "delete from public.leads where id=$1 returning id",
      [f.leadA],
    )).rows).toEqual([]);
  });

  it("allows owners to delete only their own tenant leads", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query(
      "delete from public.leads where id=$1 returning id",
      [f.leadB],
    )).rows).toEqual([]);

    expect((await db.query(
      "delete from public.leads where id=$1 returning id",
      [f.leadA],
    )).rows).toEqual([{ id: f.leadA }]);
  });

  it("revoked membership immediately removes Lead access", async () => {
    await asUser(db, f.staffA);
    expect((await db.query("select id from public.leads")).rows).toHaveLength(1);

    await db.exec("RESET ROLE");
    await db.query(
      "update public.business_memberships set status='revoked' where business_id=$1 and user_id=$2",
      [f.businessA, f.staffA],
    );
    await db.exec("SET LOCAL ROLE authenticated");

    expect((await db.query("select id from public.leads")).rows).toEqual([]);
    expect((await db.query("update public.leads set status='won' returning id")).rows).toEqual([]);
  });

  it("suspended businesses immediately lose Lead access", async () => {
    await db.query(
      "update public.businesses set status='suspended' where id=$1",
      [f.businessA],
    );
    await asUser(db, f.ownerA);
    expect((await db.query("select id from public.leads")).rows).toEqual([]);
  });

  it("denies anonymous Lead access", async () => {
    await asUser(db, null);
    await expect(db.query("select * from public.leads")).rejects.toThrow(/permission denied/);
  });

  it("does not trust forged tenant or role metadata", async () => {
    await asUser(db, f.staffA);
    await db.query(
      "select set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub: f.staffA, tenant_id: f.businessB, role: "owner" })],
    );

    expect((await db.query("select business_id from public.leads")).rows)
      .toEqual([{ business_id: f.businessA }]);
    expect((await db.query(
      "delete from public.leads where id=$1 returning id",
      [f.leadA],
    )).rows).toEqual([]);
  });

  it("prevents immutable tenant and creator columns from being changed", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query(
      "update public.leads set business_id=$1 where id=$2",
      [f.businessB, f.leadA],
    )).rejects.toThrow(/permission denied/);
    await expect(db.query(
      "update public.leads set created_by=$1 where id=$2",
      [f.ownerB, f.leadA],
    )).rejects.toThrow(/permission denied/);
  });

  it("prevents cross-tenant service links", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query(
      "update public.leads set service_id=$1 where id=$2",
      [f.serviceB, f.leadA],
    )).rejects.toThrow(/foreign key/);
  });

  it.each([
    "contact_name=''",
    "phone='',email=''",
    "email='invalid'",
    "source='Bad Source'",
    "enquiry_summary=' '",
    "estimated_value_pence=-1",
  ])("database rejects invalid Lead mutation: %s", async (assignment) => {
    await asUser(db, f.ownerA);
    await expect(db.exec(`update public.leads set ${assignment}`))
      .rejects.toThrow(/check constraint/);
  });

  it("enables and forces RLS on tenant-owned core tables", async () => {
    const result = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname, relrowsecurity, relforcerowsecurity
       from pg_class
       join pg_namespace n on n.oid=relnamespace
       where n.nspname='public'
         and relname in ('businesses','business_memberships','services','leads')
       order by relname`,
    );

    expect(result.rows).toHaveLength(4);
    for (const row of result.rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });
});
