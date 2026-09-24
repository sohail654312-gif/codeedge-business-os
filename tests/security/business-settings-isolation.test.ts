import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

describe("Business Settings tenant isolation", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);

    await db.query(
      `insert into public.business_settings(
        business_id,locale,lead_notification_email,notify_new_leads
      ) values
        ($1,'en-GB','a@example.test',true),
        ($2,'ur-PK','b@example.test',false)`,
      [f.businessA, f.businessB],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT settings_security_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT settings_security_case; RELEASE SAVEPOINT settings_security_case");
  });

  it.each([
    [f.ownerA, f.businessA, "en-GB"],
    [f.ownerB, f.businessB, "ur-PK"],
    [f.staffA, f.businessA, "en-GB"],
  ])("members read settings only for their tenant", async (userId, businessId, locale) => {
    await asUser(db, userId);

    expect((await db.query<{ business_id: string; locale: string }>(
      "select business_id,locale from public.business_settings",
    )).rows).toEqual([{ business_id: businessId, locale }]);
  });

  it("owner updates only own Business Settings", async () => {
    await asUser(db, f.ownerA);

    expect((await db.query(
      `update public.business_settings
       set locale='en-US',lead_notification_email='new@example.test',notify_new_leads=false
       where business_id=$1
       returning business_id,locale,notify_new_leads`,
      [f.businessA],
    )).rows).toEqual([{
      business_id: f.businessA,
      locale: "en-US",
      notify_new_leads: false,
    }]);

    expect((await db.query(
      "update public.business_settings set locale='en-US' where business_id=$1 returning business_id",
      [f.businessB],
    )).rows).toEqual([]);
  });

  it("owner can create settings only for own tenant", async () => {
    await db.query("delete from public.business_settings where business_id=$1", [f.businessA]);
    await asUser(db, f.ownerA);

    expect((await db.query(
      "insert into public.business_settings(business_id) values ($1) returning business_id,locale,lead_notification_email,notify_new_leads",
      [f.businessA],
    )).rows).toEqual([{
      business_id: f.businessA,
      locale: "en-GB",
      lead_notification_email: "",
      notify_new_leads: true,
    }]);
  });

  it("owner cannot create settings for another tenant", async () => {
    await db.query("delete from public.business_settings where business_id=$1", [f.businessB]);
    await asUser(db, f.ownerA);

    await expect(db.query(
      "insert into public.business_settings(business_id) values ($1)",
      [f.businessB],
    )).rejects.toThrow(/row-level security/);
  });

  it("staff can read but cannot create or update Business Settings", async () => {
    await asUser(db, f.staffA);

    expect((await db.query(
      "update public.business_settings set locale='en-US' returning business_id",
    )).rows).toEqual([]);

    await expect(db.query(
      "insert into public.business_settings(business_id) values ($1)",
      [f.businessA],
    )).rejects.toThrow(/row-level security|unique constraint/);
  });

  it("Business Settings tenant identity cannot be changed", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      "update public.business_settings set business_id=$1 where business_id=$2",
      [f.businessB, f.businessA],
    )).rejects.toThrow(/permission denied/);
  });

  it.each([
    "locale='x'",
    "locale='en GB'",
    "lead_notification_email='invalid'",
    "lead_notification_email=repeat('a',255)",
  ])("database rejects invalid Business Settings: %s", async (assignment) => {
    await asUser(db, f.ownerA);

    await expect(db.exec(
      `update public.business_settings set ${assignment} where business_id='${f.businessA}'`,
    )).rejects.toThrow(/check constraint/);
  });

  it("revoked members immediately lose Business Settings reads", async () => {
    await asUser(db, f.removedA);
    expect((await db.query("select * from public.business_settings")).rows).toEqual([]);
  });

  it("anonymous users cannot read Business Settings", async () => {
    await asUser(db, null);
    await expect(db.query("select * from public.business_settings"))
      .rejects.toThrow(/permission denied/);
  });

  it("suspended businesses immediately lose Business Settings access", async () => {
    await db.query(
      "update public.businesses set status='suspended' where id=$1",
      [f.businessA],
    );
    await asUser(db, f.ownerA);

    expect((await db.query("select * from public.business_settings")).rows).toEqual([]);
  });

  it("does not grant delete access to ordinary authenticated users", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query(
      "delete from public.business_settings where business_id=$1",
      [f.businessA],
    )).rejects.toThrow(/permission denied/);
  });

  it("forces RLS on Business Settings", async () => {
    const result = await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity,relforcerowsecurity
       from pg_class
       join pg_namespace n on n.oid=relnamespace
       where n.nspname='public' and relname='business_settings'`,
    );

    expect(result.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
  });
});
