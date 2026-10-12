import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser, fixtures as f, openDatabase, seedDatabase, type TestDatabase,
} from "../helpers/database";

const connectionA = "71000000-0000-4000-8000-000000000001";
const connectionB = "71000000-0000-4000-8000-000000000002";
const senderA = "109876540001";
const senderB = "109876540002";
const customerA = "447700900123";

async function asCommunication(db: TestDatabase) {
  await db.exec("RESET ROLE; SET LOCAL ROLE codeedge_communication_api");
}

async function receive(db: TestDatabase, sender = senderA, id = "wamid.a1", text = "Hello") {
  await asCommunication(db);
  return (await db.query<{ message_id: string; conversation_id: string }>(
    "select * from public.whatsapp_receive_text($1,$2,$3,$4,$5)",
    [sender, customerA, "Customer", id, text],
  )).rows[0]!;
}

async function plan(db: TestDatabase, sender: string, id: string,
  action = "draft", suggestion = "Hello from Codeedge") {
  await asCommunication(db);
  return (await db.query<{ decision: string }>(
    "select public.whatsapp_plan_auto_reply($1,$2,$3,$4) as decision",
    [sender, id, action, suggestion],
  )).rows[0]!.decision;
}

describe("WhatsApp auto-reply durable draft and RLS boundary", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);
    await db.query(
      `insert into public.channel_connections
        (id,business_id,channel,provider,external_sender_id,credential_key,enabled)
        values
        ($1,$2,'whatsapp','meta_whatsapp_cloud',$3,'tenant_a',true),
        ($4,$5,'whatsapp','meta_whatsapp_cloud',$6,'tenant_b',true)`,
      [connectionA, f.businessA, senderA, connectionB, f.businessB, senderB],
    );
  });
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.exec("RESET ROLE; SAVEPOINT whatsapp_draft_case");
  });
  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT whatsapp_draft_case; RELEASE SAVEPOINT whatsapp_draft_case; RESET ROLE");
  });

  it("defaults to disabled and creates no suggestions or provider sends", async () => {
    const inbound = await receive(db);
    expect(await plan(db, senderA, inbound.message_id)).toBe("disabled");
    await db.exec("RESET ROLE");
    expect((await db.query<{ n: number }>(
      "select count(*)::int n from public.whatsapp_auto_reply_drafts",
    )).rows[0]?.n).toBe(0);
    expect((await db.query<{ n: number }>(
      "select count(*)::int n from public.message_deliveries",
    )).rows[0]?.n).toBe(0);
  });

  it("creates one durable draft per canonical inbound; retries never duplicate", async () => {
    await db.query(
      "insert into public.whatsapp_auto_reply_settings(business_id,enabled) values ($1,true)",
      [f.businessA],
    );
    const inbound = await receive(db);
    expect(await plan(db, senderA, inbound.message_id)).toBe("draft");
    expect(await plan(db, senderA, inbound.message_id)).toBe("duplicate");
    const retried = await receive(db);
    expect(retried.message_id).toBe(inbound.message_id);
    expect(await plan(db, senderA, retried.message_id)).toBe("duplicate");
    await db.exec("RESET ROLE");
    expect((await db.query<{ n: number }>(
      "select count(*)::int n from public.whatsapp_auto_reply_drafts",
    )).rows[0]?.n).toBe(1);
    expect((await db.query<{ n: number }>(
      "select count(*)::int n from public.message_deliveries",
    )).rows[0]?.n).toBe(0);
  });

  it("persists STOP and human handoff across further inbound requests", async () => {
    await db.query(
      "insert into public.whatsapp_auto_reply_settings(business_id,enabled) values ($1,true)",
      [f.businessA],
    );
    const human = await receive(db, senderA, "wamid.human", "Human please");
    expect(await plan(db, senderA, human.message_id, "human_requested", "")).toBe("human_requested");
    const later = await receive(db, senderA, "wamid.next", "Website");
    expect(await plan(db, senderA, later.message_id)).toBe("muted");
    const stop = await receive(db, senderA, "wamid.stop", "STOP");
    expect(await plan(db, senderA, stop.message_id, "opt_out", "")).toBe("opt_out");
    await db.exec("RESET ROLE");
    expect((await db.query<{ muted_reason: string }>(
      "select muted_reason from public.whatsapp_auto_reply_contacts",
    )).rows).toEqual([{ muted_reason: "opt_out" }]);
  });

  it("enforces a durable monthly draft cap independent of Meta billing", async () => {
    await db.query(
      "insert into public.whatsapp_auto_reply_settings(business_id,enabled,monthly_draft_limit) values ($1,true,1)",
      [f.businessA],
    );
    const first = await receive(db);
    expect(await plan(db, senderA, first.message_id)).toBe("draft");
    const second = await receive(db, senderA, "wamid.a2", "SEO");
    expect(await plan(db, senderA, second.message_id)).toBe("limit_reached");
  });

  it("cannot attach a signed inbound from a different tenant or sender", async () => {
    await db.query(
      "insert into public.whatsapp_auto_reply_settings(business_id,enabled) values ($1,true),($2,true)",
      [f.businessA, f.businessB],
    );
    const inbound = await receive(db, senderA);
    await expect(plan(db, senderB, inbound.message_id))
      .rejects.toThrow(/Inbound unavailable/);
  });

  it("limits settings changes to owners and hides other tenants' data", async () => {
    await asUser(db, f.staffA);
    await expect(db.query(
      "insert into public.whatsapp_auto_reply_settings(business_id,enabled) values ($1,true)",
      [f.businessA],
    )).rejects.toThrow(/row-level security/);
    await db.exec("ROLLBACK TO SAVEPOINT whatsapp_draft_case; SAVEPOINT whatsapp_draft_case");
    await asUser(db, f.ownerA);
    await db.query(
      "insert into public.whatsapp_auto_reply_settings(business_id,enabled) values ($1,true)",
      [f.businessA],
    );
    expect((await db.query<{ business_id: string }>(
      "select business_id from public.whatsapp_auto_reply_settings",
    )).rows).toEqual([{ business_id: f.businessA }]);
  });

  it("denies browser execution of the communication-only draft planner", async () => {
    const inbound = await receive(db);
    await db.exec("RESET ROLE");
    await asUser(db, f.ownerA);
    await expect(db.query(
      "select public.whatsapp_plan_auto_reply($1,$2,$3,$4)",
      [senderA, inbound.message_id, "draft", "Forged"],
    )).rejects.toThrow(/permission denied/);
  });

  it("forces tenant row-level security on all three persisted tables", async () => {
    const result = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname,relrowsecurity,relforcerowsecurity from pg_class
       join pg_namespace n on n.oid=relnamespace
       where n.nspname='public' and relname like 'whatsapp_auto_reply_%'
       order by relname`,
    );
    expect(result.rows).toEqual([
      { relname: "whatsapp_auto_reply_contacts", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "whatsapp_auto_reply_drafts", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "whatsapp_auto_reply_settings", relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });
});
