import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

describe("CRM activity history tenant isolation", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT crm_activity_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT crm_activity_case; RELEASE SAVEPOINT crm_activity_case");
  });

  it.each([
    [f.ownerA, f.businessA, f.leadA],
    [f.staffA, f.businessA, f.leadA],
    [f.ownerB, f.businessB, f.leadB],
  ])("member reads only own-tenant Lead activity", async (userId, businessId, leadId) => {
    await asUser(db, userId);
    const rows = await db.query<{ business_id: string; lead_id: string }>(
      "select business_id,lead_id from public.crm_activities order by created_at,id",
    );

    expect(rows.rows.length).toBeGreaterThan(0);
    expect(rows.rows.every((row) => row.business_id === businessId && row.lead_id === leadId)).toBe(true);
  });

  it("records Lead status changes with actor and safe status metadata", async () => {
    await asUser(db, f.ownerA);
    await db.query("update public.leads set status='qualified' where id=$1", [f.leadA]);

    const result = await db.query<{
      event_type: string;
      description: string;
      actor_user_id: string | null;
      metadata: { from_status?: string; to_status?: string };
    }>(
      `select event_type,description,actor_user_id,metadata
       from public.crm_activities
       where lead_id=$1 and event_type='lead_status_changed'
       order by created_at desc,id desc
       limit 1`,
      [f.leadA],
    );

    expect(result.rows).toEqual([{
      event_type: "lead_status_changed",
      description: "Lead status changed from New to Qualified",
      actor_user_id: f.ownerA,
      metadata: { from_status: "new", to_status: "qualified" },
    }]);
  });

  it("records ordinary Lead edits separately from status changes", async () => {
    await asUser(db, f.staffA);
    await db.query(
      "update public.leads set contact_name='Lead A Updated' where id=$1",
      [f.leadA],
    );

    const result = await db.query<{ event_type: string; description: string }>(
      `select event_type,description
       from public.crm_activities
       where lead_id=$1 and event_type='lead_edited'`,
      [f.leadA],
    );

    expect(result.rows).toContainEqual({
      event_type: "lead_edited",
      description: "Lead details edited",
    });
  });

  it("records note creation without copying note contents into activity data", async () => {
    await asUser(db, f.staffA);
    const secretNote = "Customer prefers an internal callback schedule.";
    await db.query(
      `insert into public.lead_notes(business_id,lead_id,body,created_by)
       values ($1,$2,$3,$4)`,
      [f.businessA, f.leadA, secretNote, f.staffA],
    );

    const result = await db.query<{ description: string; metadata: Record<string, unknown> }>(
      `select description,metadata
       from public.crm_activities
       where lead_id=$1 and event_type='lead_note_added'
       order by created_at desc,id desc limit 1`,
      [f.leadA],
    );

    expect(result.rows).toEqual([{ description: "Internal note added", metadata: {} }]);
    expect(JSON.stringify(result.rows)).not.toContain(secretNote);
  });

  it("records Quote Request creation and status changes without storing request details", async () => {
    await asUser(db, f.ownerA);
    const details = "Prepare a detailed commercial quotation.";
    const quote = await db.query<{ id: string }>(
      `insert into public.quote_requests(business_id,lead_id,details,status,created_by)
       values ($1,$2,$3,'requested',$4) returning id`,
      [f.businessA, f.leadA, details, f.ownerA],
    );

    await db.query(
      "update public.quote_requests set status='quoted' where id=$1",
      [quote.rows[0]!.id],
    );

    const result = await db.query<{ event_type: string; description: string; metadata: Record<string, unknown> }>(
      `select event_type,description,metadata
       from public.crm_activities
       where lead_id=$1
         and event_type in ('quote_request_created','quote_request_status_changed')
       order by created_at,id`,
      [f.leadA],
    );

    expect(result.rows).toContainEqual({
      event_type: "quote_request_created",
      description: "Quote Request created",
      metadata: { status: "requested" },
    });
    expect(result.rows).toContainEqual({
      event_type: "quote_request_status_changed",
      description: "Quote Request status changed from Requested to Quoted",
      metadata: { from_status: "requested", to_status: "quoted" },
    });
    expect(JSON.stringify(result.rows)).not.toContain(details);
  });

  it("records successful Lead conversion once and keeps the Lead", async () => {
    await asUser(db, f.ownerA);
    await db.query("select * from public.convert_lead_to_customer($1)", [f.leadA]);
    await db.query("select * from public.convert_lead_to_customer($1)", [f.leadA]);

    const events = await db.query<{ event_type: string; actor_user_id: string | null }>(
      `select event_type,actor_user_id
       from public.crm_activities
       where lead_id=$1 and event_type='lead_converted_to_customer'`,
      [f.leadA],
    );

    expect(events.rows).toEqual([{
      event_type: "lead_converted_to_customer",
      actor_user_id: f.ownerA,
    }]);
    expect((await db.query("select id from public.leads where id=$1", [f.leadA])).rows)
      .toEqual([{ id: f.leadA }]);
  });

  it("does not expose another tenant's activity through a forged Lead id", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query(
      "select id from public.crm_activities where lead_id=$1",
      [f.leadB],
    )).rows).toEqual([]);
  });

  it("does not allow authenticated members to forge, edit or delete history", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      `insert into public.crm_activities(
        business_id,lead_id,event_type,description,actor_user_id
      ) values ($1,$2,'lead_edited','Forged',$3)`,
      [f.businessA, f.leadA, f.ownerA],
    )).rejects.toThrow(/permission denied/);

    await db.exec("ROLLBACK TO SAVEPOINT crm_activity_case; SAVEPOINT crm_activity_case");
    await asUser(db, f.ownerA);

    await expect(db.query(
      "update public.crm_activities set description='Rewritten' where lead_id=$1",
      [f.leadA],
    )).rejects.toThrow(/permission denied/);

    await db.exec("ROLLBACK TO SAVEPOINT crm_activity_case; SAVEPOINT crm_activity_case");
    await asUser(db, f.ownerA);

    await expect(db.query(
      "delete from public.crm_activities where lead_id=$1",
      [f.leadA],
    )).rejects.toThrow(/permission denied/);
  });

  it("denies revoked and anonymous access", async () => {
    await asUser(db, f.removedA);
    expect((await db.query("select id from public.crm_activities")).rows).toEqual([]);

    await db.exec("RESET ROLE");
    await asUser(db, null);
    await expect(db.query("select * from public.crm_activities"))
      .rejects.toThrow(/permission denied/);
  });

  it("enables and forces RLS on CRM activity history", async () => {
    const result = await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity,relforcerowsecurity
       from pg_class
       join pg_namespace n on n.oid=relnamespace
       where n.nspname='public' and relname='crm_activities'`,
    );

    expect(result.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
  });
});
