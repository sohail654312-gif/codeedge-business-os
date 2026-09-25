import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

const connectionA = "71000000-0000-4000-8000-000000000001";
const connectionB = "71000000-0000-4000-8000-000000000002";
const inboxA = "inbox-a@codeedge.test";
const inboxB = "inbox-b@codeedge.test";
const customerA = "customer-a@example.test";
const customerB = "customer-b@example.test";
const requestA = "81000000-0000-4000-8000-000000000001";

async function asCommunicationApi(db: TestDatabase) {
  await db.exec("RESET ROLE; SET LOCAL ROLE codeedge_communication_api");
}

async function receive(
  db: TestDatabase,
  inbound = inboxA,
  providerId = "resend.inbound.a",
  rfcId = "<root-a@example.test>",
  fromEmail = customerA,
  body = "Hello from Email",
  inReplyTo: string | null = null,
  references: string[] = [],
) {
  await asCommunicationApi(db);
  return db.query<{
    conversation_id: string;
    message_id: string;
    inserted: boolean;
  }>(
    "select * from public.email_receive($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      inbound,
      providerId,
      rfcId,
      inReplyTo,
      references,
      fromEmail,
      "Email Customer",
      "",
      "Service enquiry",
      body,
    ],
  );
}

describe("Email tenant security and canonical integration", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);

    await db.query(
      `insert into public.channel_connections(
        id,business_id,channel,provider,external_account_id,external_sender_id,
        display_address,credential_key,enabled
      ) values
        ($1,$2,'email','resend_email','',$3,'Business A Email','tenant_a',true),
        ($4,$5,'email','resend_email','',$6,'Business B Email','tenant_b',true)`,
      [connectionA, f.businessA, "support-a@codeedge.test", connectionB, f.businessB, "support-b@codeedge.test"],
    );

    await db.query(
      `insert into public.email_channel_settings(
        connection_id,business_id,sender_name,sender_email,reply_to_email,inbound_email
      ) values
        ($1,$2,'Business A','support-a@codeedge.test','',$3),
        ($4,$5,'Business B','support-b@codeedge.test','',$6)`,
      [connectionA, f.businessA, inboxA, connectionB, f.businessB, inboxB],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT email_security_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT email_security_case; RELEASE SAVEPOINT email_security_case");
  });

  it("maps inbound Email to the canonical Shared Inbox and CRM Lead", async () => {
    expect((await receive(db)).rows).toMatchObject([{ inserted: true }]);

    await db.exec("RESET ROLE");
    const conversation = (await db.query<{
      id: string;
      business_id: string;
      channel: string;
      channel_connection_id: string;
      external_thread_id: string;
      lead_id: string;
    }>(
      "select id,business_id,channel,channel_connection_id,external_thread_id,lead_id from public.conversations where channel='email'",
    )).rows[0]!;

    expect(conversation).toMatchObject({
      business_id: f.businessA,
      channel: "email",
      channel_connection_id: connectionA,
      external_thread_id: "<root-a@example.test>",
    });

    expect((await db.query<{
      body: string;
      direction: string;
      channel_message_id: string;
    }>(
      "select body,direction,channel_message_id from public.messages where conversation_id=$1",
      [conversation.id],
    )).rows).toEqual([{
      body: "Hello from Email",
      direction: "inbound",
      channel_message_id: "resend.inbound.a",
    }]);

    expect((await db.query<{ source: string; email: string }>(
      "select source,email from public.leads where id=$1",
      [conversation.lead_id],
    )).rows).toEqual([{
      source: "email",
      email: customerA,
    }]);
  });

  it("makes repeated provider delivery idempotent without duplicate Leads", async () => {
    expect((await receive(db)).rows[0]?.inserted).toBe(true);
    await db.exec("RESET ROLE");
    expect((await receive(db)).rows[0]?.inserted).toBe(false);

    await db.exec("RESET ROLE");
    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from public.email_message_metadata where provider_message_id='resend.inbound.a'",
    )).rows).toEqual([{ count: 1 }]);

    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from public.leads where business_id=$1 and lower(email)=$2",
      [f.businessA, customerA],
    )).rows).toEqual([{ count: 1 }]);
  });

  it("threads replies by RFC headers but does not merge unrelated Email by subject or sender alone", async () => {
    const first = (await receive(db)).rows[0]!;
    await db.exec("RESET ROLE");

    const reply = (await receive(
      db,
      inboxA,
      "resend.inbound.reply",
      "<reply-a@example.test>",
      customerA,
      "Following up",
      "<root-a@example.test>",
      ["<root-a@example.test>"],
    )).rows[0]!;
    expect(reply.conversation_id).toBe(first.conversation_id);

    await db.exec("RESET ROLE");
    const unrelated = (await receive(
      db,
      inboxA,
      "resend.inbound.unrelated",
      "<unrelated-a@example.test>",
      customerA,
      "Same sender, new thread",
      null,
      [],
    )).rows[0]!;

    expect(unrelated.conversation_id).not.toBe(first.conversation_id);

    await db.exec("RESET ROLE");
    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from public.leads where business_id=$1 and lower(email)=$2",
      [f.businessA, customerA],
    )).rows).toEqual([{ count: 1 }]);
  });

  it("keeps Email settings, conversations and messages tenant-isolated", async () => {
    await receive(db, inboxA, "resend.a", "<a@example.test>", customerA, "Tenant A");
    await db.exec("RESET ROLE");
    await receive(db, inboxB, "resend.b", "<b@example.test>", customerB, "Tenant B");
    await db.exec("RESET ROLE");

    await asUser(db, f.staffA);
    expect((await db.query<{ business_id: string }>(
      "select business_id from public.email_channel_settings order by business_id",
    )).rows).toEqual([{ business_id: f.businessA }]);

    expect((await db.query<{ business_id: string }>(
      "select distinct business_id from public.conversations where channel='email'",
    )).rows).toEqual([{ business_id: f.businessA }]);

    expect((await db.query<{ body: string }>(
      "select body from public.messages order by body",
    )).rows).toEqual([{ body: "Tenant A" }]);
  });

  it("browser users cannot forge outbound Email while internal notes remain private/local", async () => {
    const conversationId = (await receive(db)).rows[0]!.conversation_id;

    await db.exec("RESET ROLE; SAVEPOINT email_outbound_denial");
    await asUser(db, f.staffA);

    await expect(db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'outbound','Forged Email send')`,
      [f.businessA, conversationId, f.staffA],
    )).rejects.toThrow(/row-level security/);

    await db.exec("ROLLBACK TO SAVEPOINT email_outbound_denial; RELEASE SAVEPOINT email_outbound_denial");
    await asUser(db, f.staffA);

    await db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'internal','Private Email note')`,
      [f.businessA, conversationId, f.staffA],
    );

    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from public.email_message_metadata where conversation_id=$1",
      [conversationId],
    )).rows).toEqual([{ count: 1 }]);

    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from public.message_deliveries where conversation_id=$1",
      [conversationId],
    )).rows).toEqual([{ count: 0 }]);
  });

  it("dispatches Email through the restricted outbox and reconciles delivery states", async () => {
    const conversationId = (await receive(db)).rows[0]!.conversation_id;

    await db.exec("RESET ROLE");
    await asCommunicationApi(db);

    const prepared = (await db.query<{
      message_id: string;
      provider: string;
      recipient: string;
      subject: string;
      in_reply_to: string;
      reference_ids: string[];
      delivery_status: string;
      created: boolean;
    }>(
      "select * from public.email_prepare_outbound($1,$2,$3,$4,$5)",
      [f.businessA, conversationId, f.staffA, requestA, "Provider Email reply"],
    )).rows[0]!;

    expect(prepared).toMatchObject({
      provider: "resend_email",
      recipient: customerA,
      subject: "Re: Service enquiry",
      in_reply_to: "<root-a@example.test>",
      delivery_status: "sending",
      created: true,
    });
    expect(prepared.reference_ids).toContain("<root-a@example.test>");

    expect((await db.query<{ completed: boolean }>(
      "select public.email_complete_outbound($1,$2,$3) as completed",
      [prepared.message_id, "resend.outbound.a", "<outbound-a@codeedge.test>"],
    )).rows).toEqual([{ completed: true }]);

    expect((await db.query<{ status: string }>(
      "select status from public.message_deliveries where message_id=$1",
      [prepared.message_id],
    )).rows).toEqual([{ status: "queued" }]);

    expect((await db.query<{ updated: boolean }>(
      "select public.email_update_delivery($1,'sent',$2,null) as updated",
      ["resend.outbound.a", "<outbound-a@codeedge.test>"],
    )).rows).toEqual([{ updated: true }]);

    expect((await db.query<{ updated: boolean }>(
      "select public.email_update_delivery($1,'delivered',$2,null) as updated",
      ["resend.outbound.a", "<outbound-a@codeedge.test>"],
    )).rows).toEqual([{ updated: true }]);

    await db.exec("RESET ROLE");
    await asUser(db, f.staffA);
    expect((await db.query<{ status: string; rfc_message_id: string }>(
      `select d.status,em.rfc_message_id
       from public.message_deliveries d
       join public.email_message_metadata em on em.message_id=d.message_id
       where d.message_id=$1`,
      [prepared.message_id],
    )).rows).toEqual([{
      status: "delivered",
      rfc_message_id: "<outbound-a@codeedge.test>",
    }]);
  });

  it("prevents cross-tenant, revoked-staff and forged provider access", async () => {
    const conversationId = (await receive(db)).rows[0]!.conversation_id;
    await db.exec("RESET ROLE");
    await asCommunicationApi(db);

    await expect(db.query(
      "select public.email_prepare_outbound($1,$2,$3,$4,$5)",
      [f.businessB, conversationId, f.ownerB, requestA, "Cross tenant"],
    )).rejects.toThrow(/Conversation unavailable/);

    await db.exec("ROLLBACK TO SAVEPOINT email_security_case; SAVEPOINT email_security_case");
    await receive(db);
    await db.exec("RESET ROLE");
    await asCommunicationApi(db);

    await expect(db.query(
      "select public.email_prepare_outbound($1,$2,$3,$4,$5)",
      [f.businessA, conversationId, f.removedA, requestA, "Revoked"],
    )).rejects.toThrow(/Conversation unavailable/);

    await db.exec("ROLLBACK TO SAVEPOINT email_security_case; SAVEPOINT email_security_case");
    await asCommunicationApi(db);
    await expect(db.query(
      "select * from private.active_email_connection('forged@codeedge.test')",
    )).rejects.toThrow(/Email unavailable/);
  });

  it("does not allow anon/authenticated roles to execute Email transport functions or assume capability", async () => {
    await asUser(db, null);
    await expect(db.query(
      "select public.email_receive($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [inboxA, "attack", "<attack@test>", null, [], "attacker@test", "", "", "", "Attack"],
    )).rejects.toThrow(/permission denied/);

    await db.exec("ROLLBACK TO SAVEPOINT email_security_case; SAVEPOINT email_security_case");
    await asUser(db, f.ownerA);
    await expect(db.query(
      "select * from private.active_email_connection($1)",
      [inboxA],
    )).rejects.toThrow(/permission denied/);

    expect((await db.query(
      "select pg_has_role('authenticated','codeedge_communication_api','MEMBER') as member",
    )).rows).toEqual([{ member: false }]);
  });

  it("only owners can change Email settings and Tenant A cannot touch Tenant B", async () => {
    await asUser(db, f.staffA);
    expect((await db.query(
      "update public.email_channel_settings set sender_name='Staff forged' returning business_id",
    )).rows).toEqual([]);

    await db.exec("RESET ROLE");
    await asUser(db, f.ownerA);
    expect((await db.query(
      "update public.email_channel_settings set sender_name='Owner A' returning business_id",
    )).rows).toEqual([{ business_id: f.businessA }]);

    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from public.email_channel_settings",
    )).rows).toEqual([{ count: 1 }]);
  });

  it("forces RLS on Email settings and metadata", async () => {
    const result = await db.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname,relrowsecurity,relforcerowsecurity
       from pg_class
       join pg_namespace n on n.oid=relnamespace
       where n.nspname='public'
         and relname in ('email_channel_settings','email_message_metadata')
       order by relname`,
    );

    expect(result.rows).toEqual([
      { relname: "email_channel_settings", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "email_message_metadata", relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });
});
