import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

const areaA = "50000000-0000-4000-8000-000000000001";
const areaB = "50000000-0000-4000-8000-000000000002";

describe("Service Areas and Opening Hours tenant security", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);

    await db.query(
      `insert into public.service_areas(
        id,business_id,name,postcode,notes,active,display_order
      ) values
        ($1,$2,'Westminster','SW1A','Central coverage',true,1),
        ($3,$4,'Manchester','M1','City centre',true,1)`,
      [areaA, f.businessA, areaB, f.businessB],
    );

    await db.query(
      `insert into public.opening_hours(
        business_id,weekday,is_closed,opens_at,closes_at
      ) values
        ($1,1,false,'09:00','17:00'),
        ($2,1,false,'10:00','18:00')`,
      [f.businessA, f.businessB],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT coverage_security_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT coverage_security_case; RELEASE SAVEPOINT coverage_security_case");
  });

  it.each([
    [f.ownerA, f.businessA],
    [f.ownerB, f.businessB],
    [f.staffA, f.businessA],
  ])("members read coverage data only for their tenant", async (userId, businessId) => {
    await asUser(db, userId);

    expect((await db.query<{ business_id: string }>(
      "select business_id from public.service_areas",
    )).rows).toEqual([{ business_id: businessId }]);

    expect((await db.query<{ business_id: string }>(
      "select business_id from public.opening_hours",
    )).rows).toEqual([{ business_id: businessId }]);
  });

  it("owner CRUD on Service Areas is limited to the active tenant", async () => {
    await asUser(db, f.ownerA);

    expect((await db.query(
      "update public.service_areas set notes='Owner edit',active=false,display_order=3 where id=$1 returning id",
      [areaA],
    )).rows).toEqual([{ id: areaA }]);

    expect((await db.query(
      "update public.service_areas set notes='Attack' where id=$1 returning id",
      [areaB],
    )).rows).toEqual([]);

    expect((await db.query(
      "delete from public.service_areas where id=$1 returning id",
      [areaB],
    )).rows).toEqual([]);

    expect((await db.query(
      "delete from public.service_areas where id=$1 returning id",
      [areaA],
    )).rows).toEqual([{ id: areaA }]);
  });

  it("owner cannot create a Service Area in another tenant", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      "insert into public.service_areas(business_id,name,postcode) values ($1,'Attack','SW1A')",
      [f.businessB],
    )).rejects.toThrow(/row-level security/);
  });

  it("staff can read but cannot update Service Areas", async () => {
    await asUser(db, f.staffA);

    expect((await db.query(
      "update public.service_areas set notes='Staff edit' returning id",
    )).rows).toEqual([]);
  });

  it("staff cannot create Service Areas", async () => {
    await asUser(db, f.staffA);

    await expect(db.query(
      "insert into public.service_areas(business_id,name) values ($1,'Staff area')",
      [f.businessA],
    )).rejects.toThrow(/row-level security/);
  });

  it("Service Area tenant identity cannot be changed", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      "update public.service_areas set business_id=$1 where id=$2",
      [f.businessB, areaA],
    )).rejects.toThrow(/permission denied/);
  });

  it.each([
    "name=' '",
    "postcode='INVALID'",
    "notes=repeat('x',1001)",
    "display_order=-1",
    "display_order=10001",
  ])("database rejects invalid Service Area values: %s", async (assignment) => {
    await asUser(db, f.ownerA);

    await expect(db.exec(
      `update public.service_areas set ${assignment} where id='${areaA}'`,
    )).rejects.toThrow(/check constraint/);
  });

  it("owner updates only own Opening Hours", async () => {
    await asUser(db, f.ownerA);

    expect((await db.query(
      "update public.opening_hours set opens_at='08:30',closes_at='16:30' where business_id=$1 and weekday=1 returning business_id",
      [f.businessA],
    )).rows).toEqual([{ business_id: f.businessA }]);

    expect((await db.query(
      "update public.opening_hours set opens_at='07:00',closes_at='15:00' where business_id=$1 and weekday=1 returning business_id",
      [f.businessB],
    )).rows).toEqual([]);
  });

  it("owner can create another weekday only for own tenant", async () => {
    await asUser(db, f.ownerA);

    expect((await db.query(
      `insert into public.opening_hours(
        business_id,weekday,is_closed,opens_at,closes_at
      ) values ($1,2,false,'09:00','17:00') returning business_id,weekday`,
      [f.businessA],
    )).rows).toEqual([{ business_id: f.businessA, weekday: 2 }]);
  });

  it("owner cannot create Opening Hours in another tenant", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      "insert into public.opening_hours(business_id,weekday) values ($1,2)",
      [f.businessB],
    )).rejects.toThrow(/row-level security/);
  });

  it("staff can read but cannot update Opening Hours", async () => {
    await asUser(db, f.staffA);

    expect((await db.query(
      "update public.opening_hours set is_closed=true,opens_at=null,closes_at=null returning weekday",
    )).rows).toEqual([]);
  });

  it("staff cannot create Opening Hours", async () => {
    await asUser(db, f.staffA);

    await expect(db.query(
      "insert into public.opening_hours(business_id,weekday) values ($1,2)",
      [f.businessA],
    )).rejects.toThrow(/row-level security/);
  });

  it("ordinary clients cannot delete Opening Hours", async () => {
    await asUser(db, f.ownerA);

    await expect(db.exec(
      "delete from public.opening_hours where business_id='20000000-0000-4000-8000-000000000001'",
    )).rejects.toThrow(/permission denied/);
  });

  it("Opening Hours tenant and weekday identity cannot be rewritten", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      "update public.opening_hours set weekday=2 where business_id=$1 and weekday=1",
      [f.businessA],
    )).rejects.toThrow(/permission denied/);
  });

  it.each([
    "is_closed=false,opens_at=null,closes_at='17:00'",
    "is_closed=false,opens_at='09:00',closes_at=null",
    "is_closed=false,opens_at='17:00',closes_at='09:00'",
    "is_closed=false,opens_at='09:00',closes_at='09:00'",
    "is_closed=true,opens_at='09:00',closes_at='17:00'",
    "is_closed=false,opens_at='09:00:01',closes_at='17:00'",
  ])("database rejects invalid Opening Hours state: %s", async (assignment) => {
    await asUser(db, f.ownerA);

    await expect(db.exec(
      `update public.opening_hours set ${assignment} where business_id='${f.businessA}' and weekday=1`,
    )).rejects.toThrow(/check constraint/);
  });

  it.each([0, 8])("database rejects invalid weekday %s", async (weekday) => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      "insert into public.opening_hours(business_id,weekday) values ($1,$2)",
      [f.businessA, weekday],
    )).rejects.toThrow(/check constraint/);
  });

  it("allows only one Opening Hours record per tenant and weekday", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      "insert into public.opening_hours(business_id,weekday) values ($1,1)",
      [f.businessA],
    )).rejects.toThrow(/unique constraint/);
  });

  it("stores Opening Hours as local wall-clock time alongside the business timezone", async () => {
    const column = await db.query<{ data_type: string }>(
      `select data_type
       from information_schema.columns
       where table_schema='public'
         and table_name='opening_hours'
         and column_name='opens_at'`,
    );
    const business = await db.query<{ timezone: string }>(
      "select timezone from public.businesses where id=$1",
      [f.businessA],
    );

    expect(column.rows).toEqual([{ data_type: "time without time zone" }]);
    expect(business.rows).toEqual([{ timezone: "Europe/London" }]);
  });

  it("revoked members immediately lose Service Area and Opening Hours reads", async () => {
    await asUser(db, f.removedA);

    expect((await db.query("select * from public.service_areas")).rows).toEqual([]);
    expect((await db.query("select * from public.opening_hours")).rows).toEqual([]);
  });

  it.each(["service_areas", "opening_hours"])("anonymous users cannot read %s", async (table) => {
    await asUser(db, null);

    await expect(db.query(`select * from public.${table}`))
      .rejects.toThrow(/permission denied/);
  });

  it("suspended businesses immediately lose coverage access", async () => {
    await db.query(
      "update public.businesses set status='suspended' where id=$1",
      [f.businessA],
    );
    await asUser(db, f.ownerA);

    expect((await db.query("select * from public.service_areas")).rows).toEqual([]);
    expect((await db.query("select * from public.opening_hours")).rows).toEqual([]);
  });

  it("forces RLS on Service Areas and Opening Hours", async () => {
    const result = await db.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname,relrowsecurity,relforcerowsecurity
       from pg_class
       join pg_namespace n on n.oid=relnamespace
       where n.nspname='public'
         and relname in ('opening_hours','service_areas')
       order by relname`,
    );

    expect(result.rows).toEqual([
      { relname: "opening_hours", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "service_areas", relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });
});
