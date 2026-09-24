import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

const widgetA = "71000000-0000-4000-8000-000000000001";
const widgetB = "71000000-0000-4000-8000-000000000002";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const hashOther = "c".repeat(64);
const requestA = "72000000-0000-4000-8000-000000000001";
const requestB = "72000000-0000-4000-8000-000000000002";

async function asChatApi(db: TestDatabase) {
  await db.exec("RESET ROLE");
  await db.exec("SET LOCAL ROLE codeedge_chat_api");
}

async function start(db: TestDatabase, widget = widgetA, hash = hashA) {
  await asChatApi(db);
  return db.query<{
    available: boolean;
    widget_name: string;
    contact_saved: boolean;
  }>(
    "select available,widget_name,contact_saved from public.website_chat_start($1,$2)",
    [widget, hash],
  );
}

async function send(
  db: TestDatabase,
  body: string,
  requestId = requestA,
  widget = widgetA,
  hash = hashA,
) {
  await asChatApi(db);
  return db.query<{ inserted: boolean }>(
    "select public.website_chat_send($1,$2,$3,$4) as inserted",
    [widget, hash, requestId, body],
  );
}

async function history(db: TestDatabase, widget = widgetA, hash = hashA) {
  await asChatApi(db);
  return db.query<{
    sender_type: string;
    direction: string;
    body: string;
    created_at: string;
  }>(
    "select sender_type,direction,body,created_at from public.website_chat_history($1,$2)",
    [widget, hash],
  );
}

describe("Production Website Chat security and canonical integration", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);

    await db.query(
      `insert into public.website_chat_widgets(
        business_id,public_id,enabled,widget_name,launcher_label,greeting_text,
        welcome_message,offline_message,lead_capture_enabled,accent_color
      ) values
        ($1,$2,true,'Business A Chat','Chat A','Online A','Welcome A','Offline A',true,'#23BDF0'),
        ($3,$4,true,'Business B Chat','Chat B','Online B','Welcome B','Offline B',true,'#23BDF0')`,
      [f.businessA, widgetA, f.businessB, widgetB],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT website_chat_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT website_chat_case; RELEASE SAVEPOINT website_chat_case");
  });

  it("runs the end-to-end visitor -> Shared Inbox -> staff -> visitor -> Lead flow", async () => {
    expect((await start(db)).rows).toEqual([{
      available: true,
      widget_name: "Business A Chat",
      contact_saved: false,
    }]);

    expect((await send(db, "Need help with my boiler")).rows).toEqual([{ inserted: true }]);
    expect((await history(db)).rows.map((row) => ({
      sender_type: row.sender_type,
      direction: row.direction,
      body: row.body,
    }))).toEqual([{
      sender_type: "customer",
      direction: "inbound",
      body: "Need help with my boiler",
    }]);

    await db.exec("RESET ROLE");
    const conversations = await db.query<{
      id: string;
      business_id: string;
      channel: string;
      lead_id: string | null;
      last_message_preview: string;
    }>(
      "select id,business_id,channel,lead_id,last_message_preview from public.conversations where channel='website_chat'",
    );
    expect(conversations.rows).toHaveLength(1);
    expect(conversations.rows[0]).toMatchObject({
      business_id: f.businessA,
      channel: "website_chat",
      lead_id: null,
      last_message_preview: "Need help with my boiler",
    });
    const conversationId = conversations.rows[0]!.id;

    await asUser(db, f.staffA);
    await db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'outbound','A team member will help you here.')`,
      [f.businessA, conversationId, f.staffA],
    );

    const visitorView = await history(db);
    expect(visitorView.rows.map((row) => row.body)).toEqual([
      "Need help with my boiler",
      "A team member will help you here.",
    ]);
    expect(Object.keys(visitorView.rows[1] ?? {}).sort()).toEqual([
      "body",
      "created_at",
      "direction",
      "sender_type",
    ]);

    await asChatApi(db);
    expect((await db.query<{ captured: boolean }>(
      "select public.website_chat_capture_lead($1,$2,$3,$4,$5) as captured",
      [widgetA, hashA, "Fictional Visitor", "07123456789", ""],
    )).rows).toEqual([{ captured: true }]);

    await db.exec("RESET ROLE");
    const lead = await db.query<{
      id: string;
      business_id: string;
      source: string;
      contact_name: string;
    }>(
      "select id,business_id,source,contact_name from public.leads where contact_name='Fictional Visitor'",
    );
    expect(lead.rows).toHaveLength(1);
    expect(lead.rows[0]).toMatchObject({
      business_id: f.businessA,
      source: "website_chat",
      contact_name: "Fictional Visitor",
    });

    expect((await db.query<{ lead_id: string | null }>(
      "select lead_id from public.conversations where id=$1",
      [conversationId],
    )).rows).toEqual([{ lead_id: lead.rows[0]!.id }]);

    await asUser(db, f.ownerA);
    const conversion = await db.query<{ customer_id: string; created: boolean }>(
      "select * from public.convert_lead_to_customer($1)",
      [lead.rows[0]!.id],
    );
    expect(conversion.rows).toHaveLength(1);

    await db.exec("RESET ROLE");
    expect((await db.query<{ customer_id: string | null }>(
      "select customer_id from public.conversations where id=$1",
      [conversationId],
    )).rows).toEqual([{ customer_id: conversion.rows[0]!.customer_id }]);

    expect((await start(db)).rows[0]?.contact_saved).toBe(true);
    expect((await history(db)).rows.map((row) => row.body)).toEqual([
      "Need help with my boiler",
      "A team member will help you here.",
    ]);

    await start(db, widgetA, hashOther);
    expect((await history(db, widgetA, hashOther)).rows).toEqual([]);
  });

  it("isolates visitor A from visitor B on the same widget", async () => {
    await start(db, widgetA, hashA);
    await send(db, "Visitor A", requestA, widgetA, hashA);

    await db.exec("RESET ROLE");
    await start(db, widgetA, hashOther);

    expect((await history(db, widgetA, hashOther)).rows).toEqual([]);
    expect((await history(db, widgetA, hashA)).rows.map((row) => row.body)).toEqual(["Visitor A"]);
  });

  it("binds sessions to one widget and one tenant", async () => {
    await start(db, widgetA, hashA);
    await send(db, "Tenant A", requestA, widgetA, hashA);

    await expect(history(db, widgetB, hashA)).rejects.toThrow(/Chat unavailable/);
  });

  it("does not accept a conversation ID as visitor authorization", async () => {
    await start(db);
    await send(db, "Create canonical conversation");

    await db.exec("RESET ROLE");
    const conversation = (await db.query<{ id: string }>(
      "select id from public.conversations where channel='website_chat' limit 1",
    )).rows[0]!;

    await asUser(db, null);
    await expect(db.query(
      "select body from public.messages where conversation_id=$1",
      [conversation.id],
    )).rejects.toThrow(/permission denied/);

    await db.exec("ROLLBACK TO SAVEPOINT website_chat_case; SAVEPOINT website_chat_case");
    await asUser(db, null);
    await expect(db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,direction,body
      ) values ($1,$2,'customer','inbound','Forged')`,
      [f.businessA, conversation.id],
    )).rejects.toThrow(/permission denied/);
  });

  it("browser roles cannot execute or assume the server Website Chat capability", async () => {
    await asUser(db, null);
    await expect(db.query(
      "select public.website_chat_start($1,$2)",
      [widgetA, hashA],
    )).rejects.toThrow(/permission denied/);

    await db.exec("ROLLBACK TO SAVEPOINT website_chat_case; SAVEPOINT website_chat_case");
    await asUser(db, f.ownerA);
    await expect(db.query(
      "select public.website_chat_start($1,$2)",
      [widgetA, hashA],
    )).rejects.toThrow(/permission denied/);

    await db.exec("ROLLBACK TO SAVEPOINT website_chat_case; SAVEPOINT website_chat_case");
    await asUser(db, f.ownerA);
    expect((await db.query(
      "select pg_has_role('authenticated','codeedge_chat_api','MEMBER') as member",
    )).rows).toEqual([{ member: false }]);
  });

  it("prevents forged tenant, sender and normal-table access for anonymous visitors", async () => {
    await asUser(db, null);

    for (const table of ["businesses", "business_memberships", "leads", "customers", "conversations", "messages", "website_chat_widgets", "website_chat_sessions"]) {
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
      await db.exec("ROLLBACK TO SAVEPOINT website_chat_case; SAVEPOINT website_chat_case");
      await asUser(db, null);
    }
  });

  it("expires sessions without exposing old history", async () => {
    await start(db);
    await send(db, "Before expiry");

    await db.exec("RESET ROLE");
    await db.query(
      "update public.website_chat_sessions set expires_at=clock_timestamp()-interval '1 minute' where widget_id=$1",
      [widgetA],
    );

    await expect(history(db)).rejects.toThrow(/Chat unavailable/);
  });

  it("disabled widgets fail safely and do not expose conversation history", async () => {
    await db.query("update public.website_chat_widgets set enabled=false where public_id=$1", [widgetA]);

    const state = await start(db);
    expect(state.rows).toEqual([{
      available: false,
      widget_name: "Business A Chat",
      contact_saved: false,
    }]);

    await expect(history(db)).rejects.toThrow(/Chat unavailable/);
  });

  it("suspended tenants immediately lose public Website Chat access", async () => {
    await db.query("update public.businesses set status='suspended' where id=$1", [f.businessA]);
    await expect(start(db)).rejects.toThrow(/Chat unavailable/);
  });

  it("keeps internal notes private from the visitor", async () => {
    await start(db);
    await send(db, "Visitor public message");

    await db.exec("RESET ROLE");
    const conversationId = (await db.query<{ id: string }>(
      "select id from public.conversations where channel='website_chat' limit 1",
    )).rows[0]!.id;

    await asUser(db, f.staffA);
    await db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'internal','Private team note')`,
      [f.businessA, conversationId, f.staffA],
    );
    await db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'outbound','Public staff reply')`,
      [f.businessA, conversationId, f.staffA],
    );

    const publicRows = await history(db);
    expect(publicRows.rows.map((row) => row.body)).toEqual([
      "Visitor public message",
      "Public staff reply",
    ]);
    expect(JSON.stringify(publicRows.rows)).not.toContain("Private team note");
    expect(JSON.stringify(publicRows.rows)).not.toContain(f.staffA);
  });

  it("makes visitor message retries idempotent before rate-limit checks", async () => {
    await start(db);
    expect((await send(db, "One message", requestA)).rows).toEqual([{ inserted: true }]);
    expect((await send(db, "One message", requestA)).rows).toEqual([{ inserted: false }]);

    const rows = await history(db);
    expect(rows.rows.filter((row) => row.body === "One message")).toHaveLength(1);
  });

  it("rate-limits rapid visitor messages", async () => {
    await start(db);
    await send(db, "First", requestA);
    await expect(send(db, "Too fast", requestB)).rejects.toThrow(/Chat unavailable/);
  });

  it("enforces the per-session inbound message budget", async () => {
    await start(db);
    await send(db, "First", requestA);

    await db.exec("RESET ROLE");
    const conversation = (await db.query<{ id: string }>(
      "select id from public.conversations where channel='website_chat' limit 1",
    )).rows[0]!;

    await db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,direction,body,request_id,created_at
      )
      select $1,$2,'customer','inbound','Budget message ' || n,gen_random_uuid(),
        clock_timestamp()-interval '10 seconds'
      from generate_series(1,29) n`,
      [f.businessA, conversation.id],
    );

    await expect(send(db, "Over budget", requestB)).rejects.toThrow(/Chat unavailable/);
  });

  it("enforces the rolling new-session budget", async () => {
    await db.query(
      `insert into public.website_chat_sessions(
        business_id,widget_id,session_hash
      )
      select $1,$2,md5(n::text)||md5('x'||n::text)
      from generate_series(1,100) n`,
      [f.businessA, widgetA],
    );

    await expect(start(db, widgetA, "f".repeat(64))).rejects.toThrow(/Chat unavailable/);
  });

  it("creates at most one Website Lead per visitor session and derives the tenant", async () => {
    await start(db, widgetB, hashB);
    await asChatApi(db);

    await db.query(
      "select public.website_chat_capture_lead($1,$2,$3,$4,$5)",
      [widgetB, hashB, "Visitor B", "", "visitor-b@example.test"],
    );
    await db.query(
      "select public.website_chat_capture_lead($1,$2,$3,$4,$5)",
      [widgetB, hashB, "Visitor B Updated", "", "visitor-b@example.test"],
    );

    await db.exec("RESET ROLE");
    const rows = await db.query<{
      business_id: string;
      contact_name: string;
      source: string;
    }>(
      "select business_id,contact_name,source from public.leads where email='visitor-b@example.test'",
    );

    expect(rows.rows).toEqual([{
      business_id: f.businessB,
      contact_name: "Visitor B Updated",
      source: "website_chat",
    }]);
  });

  it("owner/staff can read widget settings, but only owner can write", async () => {
    await asUser(db, f.staffA);
    expect((await db.query<{ public_id: string }>(
      "select public_id from public.website_chat_widgets",
    )).rows).toEqual([{ public_id: widgetA }]);
    expect((await db.query(
      "update public.website_chat_widgets set enabled=false returning public_id",
    )).rows).toEqual([]);

    await db.exec("RESET ROLE");
    await asUser(db, f.ownerA);
    expect((await db.query(
      "update public.website_chat_widgets set enabled=false returning public_id",
    )).rows).toEqual([{ public_id: widgetA }]);
  });

  it("prevents widget ownership/public identity forgery", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      `insert into public.website_chat_widgets(
        business_id,enabled
      ) values ($1,true)`,
      [f.businessB],
    )).rejects.toThrow(/row-level security/);

    await db.exec("ROLLBACK TO SAVEPOINT website_chat_case; SAVEPOINT website_chat_case");
    await asUser(db, f.ownerA);
    await expect(db.query(
      "update public.website_chat_widgets set public_id=$1 where business_id=$2",
      [widgetB, f.businessA],
    )).rejects.toThrow(/permission denied/);
  });

  it("revoked staff cannot read or reply to Website Chat conversations", async () => {
    await start(db);
    await send(db, "Visitor message");

    await db.exec("RESET ROLE");
    const conversationId = (await db.query<{ id: string }>(
      "select id from public.conversations where channel='website_chat' limit 1",
    )).rows[0]!.id;

    await asUser(db, f.removedA);
    expect((await db.query("select id from public.conversations")).rows).toEqual([]);
    await expect(db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'outbound','Should fail')`,
      [f.businessA, conversationId, f.removedA],
    )).rejects.toThrow(/row-level security/);
  });

  it("forces RLS on widget/session and canonical communication tables", async () => {
    const result = await db.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname,relrowsecurity,relforcerowsecurity
       from pg_class
       join pg_namespace n on n.oid=relnamespace
       where n.nspname='public'
         and relname in ('conversations','messages','website_chat_sessions','website_chat_widgets')
       order by relname`,
    );

    expect(result.rows).toEqual([
      { relname: "conversations", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "messages", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "website_chat_sessions", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "website_chat_widgets", relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });
});
