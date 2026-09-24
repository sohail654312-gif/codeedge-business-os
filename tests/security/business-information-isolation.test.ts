import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

describe("Business Profile and Services tenant security", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);

    await db.query(
      `insert into public.business_profiles(
        business_id,trading_name,phone,email,website,address,description,category,logo_alt
      ) values
        ($1,'Business A Trading','111','a@example.test','https://a.example.test','Address A','Profile A','Trade A','Logo A'),
        ($2,'Business B Trading','222','b@example.test','https://b.example.test','Address B','Profile B','Trade B','Logo B')`,
      [f.businessA, f.businessB],
    );

    await db.query(
      `update public.services
       set description='Seed service',starting_price_pence=5000,quote_required=true,display_order=1`,
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT business_information_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT business_information_case; RELEASE SAVEPOINT business_information_case");
  });

  it.each([
    [f.ownerA, f.businessA],
    [f.ownerB, f.businessB],
    [f.staffA, f.businessA],
  ])("members read Business Profile and Services only for their tenant", async (userId, businessId) => {
    await asUser(db, userId);

    expect((await db.query<{ business_id: string }>(
      "select business_id from public.business_profiles",
    )).rows).toEqual([{ business_id: businessId }]);

    expect((await db.query<{ business_id: string }>(
      "select business_id from public.services",
    )).rows).toEqual([{ business_id: businessId }]);
  });

  it("owner can update own Business Profile but cannot update another tenant", async () => {
    await asUser(db, f.ownerA);

    expect((await db.query(
      "update public.business_profiles set description='Owner edit' where business_id=$1 returning description",
      [f.businessA],
    )).rows).toEqual([{ description: "Owner edit" }]);

    expect((await db.query(
      "update public.business_profiles set description='Attack' where business_id=$1 returning business_id",
      [f.businessB],
    )).rows).toEqual([]);
  });

  it("owner cannot create a Business Profile for another tenant", async () => {
    await db.query("delete from public.business_profiles where business_id=$1", [f.businessB]);
    await asUser(db, f.ownerA);

    await expect(db.query(
      "insert into public.business_profiles(business_id,trading_name) values ($1,'Attack')",
      [f.businessB],
    )).rejects.toThrow(/row-level security/);
  });

  it("staff has read-only Business Information access", async () => {
    await asUser(db, f.staffA);

    expect((await db.query(
      "update public.business_profiles set description='Staff edit' returning business_id",
    )).rows).toEqual([]);

    expect((await db.query(
      "update public.services set description='Staff edit' returning business_id",
    )).rows).toEqual([]);

    await expect(db.query(
      "insert into public.services(business_id,name) values ($1,'Staff service')",
      [f.businessA],
    )).rejects.toThrow(/row-level security/);
  });

  it("owner creates richer Services only inside the authorized tenant", async () => {
    await asUser(db, f.ownerA);

    const created = await db.query<{
      business_id: string;
      description: string;
      starting_price_pence: number;
      quote_required: boolean;
      display_order: number;
    }>(
      `insert into public.services(
        business_id,name,description,starting_price_pence,quote_required,display_order
      ) values ($1,'New boiler service','Full description',7500,false,3)
      returning business_id,description,starting_price_pence,quote_required,display_order`,
      [f.businessA],
    );

    expect(created.rows).toEqual([{
      business_id: f.businessA,
      description: "Full description",
      starting_price_pence: 7500,
      quote_required: false,
      display_order: 3,
    }]);

    await expect(db.query(
      "insert into public.services(business_id,name) values ($1,'Cross tenant service')",
      [f.businessB],
    )).rejects.toThrow(/row-level security/);
  });

  it("extending Service metadata preserves the existing Lead to Service relationship", async () => {
    await asUser(db, f.ownerA);

    await db.query(
      `update public.services
       set description='Updated service',starting_price_pence=9900,quote_required=false,display_order=4
       where id=$1`,
      [f.serviceA],
    );

    expect((await db.query<{ service_id: string | null }>(
      "select service_id from public.leads where id=$1",
      [f.leadA],
    )).rows).toEqual([{ service_id: f.serviceA }]);
  });

  it("deleting a Service keeps the Lead and safely clears only its Service link", async () => {
    await asUser(db, f.ownerA);

    expect((await db.query(
      "delete from public.services where id=$1 returning id",
      [f.serviceA],
    )).rows).toEqual([{ id: f.serviceA }]);

    expect((await db.query<{ id: string; service_id: string | null }>(
      "select id,service_id from public.leads where id=$1",
      [f.leadA],
    )).rows).toEqual([{ id: f.leadA, service_id: null }]);
  });

  it.each([
    ["business_profiles", "business_id", f.businessB],
    ["services", "business_id", f.businessB],
  ])("tenant identity is immutable on %s", async (table, column, value) => {
    await asUser(db, f.ownerA);
    await expect(db.query(
      `update public.${table} set ${column}=$1 where business_id=$2`,
      [value, f.businessA],
    )).rejects.toThrow(/permission denied/);
  });

  it("database rejects invalid Business Profile values", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      "update public.business_profiles set website='http://insecure.example.test' where business_id=$1",
      [f.businessA],
    )).rejects.toThrow(/check constraint/);

    await db.exec("ROLLBACK TO SAVEPOINT business_information_case; SAVEPOINT business_information_case");
    await asUser(db, f.ownerA);

    await expect(db.query(
      "update public.business_profiles set email='invalid' where business_id=$1",
      [f.businessA],
    )).rejects.toThrow(/check constraint/);
  });

  it.each([
    "starting_price_pence=-1",
    "starting_price_pence=100000001",
    "display_order=-1",
    "display_order=10001",
    "description=repeat('x',3001)",
  ])("database rejects invalid Service metadata: %s", async (assignment) => {
    await asUser(db, f.ownerA);
    await expect(db.exec(
      `update public.services set ${assignment} where id='${f.serviceA}'`,
    )).rejects.toThrow(/check constraint/);
  });

  it("revoked members lose Business Information reads immediately", async () => {
    await asUser(db, f.removedA);
    expect((await db.query("select * from public.business_profiles")).rows).toEqual([]);
    expect((await db.query("select * from public.services")).rows).toEqual([]);
  });

  it("anonymous users cannot read Business Information", async () => {
    await asUser(db, null);
    await expect(db.query("select * from public.business_profiles")).rejects.toThrow(/permission denied/);
    await db.exec("ROLLBACK TO SAVEPOINT business_information_case; SAVEPOINT business_information_case");
    await asUser(db, null);
    await expect(db.query("select * from public.services")).rejects.toThrow(/permission denied/);
  });

  it("forces RLS on Business Profile and Services", async () => {
    const result = await db.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname,relrowsecurity,relforcerowsecurity
       from pg_class
       join pg_namespace n on n.oid=relnamespace
       where n.nspname='public'
         and relname in ('business_profiles','services')
       order by relname`,
    );

    expect(result.rows).toEqual([
      { relname: "business_profiles", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "services", relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });
});
