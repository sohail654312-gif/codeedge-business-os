import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

const connectionA = "72000000-0000-4000-8000-000000000001";
const connectionB = "72000000-0000-4000-8000-000000000002";
const accountA = "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const accountB = "ACbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const senderA = "+441234567890";
const senderB = "+441234567891";
const customerA = "+447700900123";
const customerB = "+447700900124";
const inboundA = "SM11111111111111111111111111111111";
const outboundA = "SM22222222222222222222222222222222";
const requestA = "82000000-0000-4000-8000-000000000001";

async function asCommunicationApi(db: TestDatabase) {
  await db.exec("RESET ROLE; SET LOCAL ROLE codeedge_communication_api");
}

async function receive(
  db: TestDatabase,
  sender = senderA,
  customer = customerA,
  messageId = inboundA,
  body = "Hello from SMS",
) {
  await asCommunicationApi(db);
  return db.query<{
    conversation_id: string;
    message_id: string;
    inserted: boolean;
  }>(
    "select * from public.sms_receive_text($1,$2,$3,$4)",
    [sender, customer, messageId, body],
  );
}

describe("SMS tenant security and canonical integration", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);

    await db.query(
      `insert into public.channel_connections(
        id,business_id,channel,provider,external_account_id,external_sender_id,
        display_address,credential_key,enabled
      ) values
        ($1,$2,'sms','twilio_sms',$3,$4,'SMS A','tenant_a',true),
        ($5,$6,'sms','twilio_sms',$7,$8,'SMS B','tenant_b',true)`,
      [connectionA, f.businessA, accountA, senderA, connectionB, f.businessB, accountB, senderB],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT sms_security_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT sms_security_case; RELEASE SAVEPOINT sms_security_case");
  });

  it("maps inbound SMS to the canonical Shared Inbox and creates an SMS Lead only when unknown", async () => {
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
      "select id,business_id,channel,channel_connection_id,external_thread_id,lead_id from public.conversations where channel='sms'",
    )).rows[0]!;

    expect(conversation).toMatchObject({
      business_id: f.businessA,
      channel: "sms",
      channel_connection_id: connectionA,
      external_thread_id: customerA,
    });

    expect((await db.query<{ body: string; direction: string; channel_message_id: string }>(
      "select body,direction,channel_message_id from public.messages where conversation_id=$1",
      [conversation.id],
    )).rows).toEqual([{
      body: "Hello from SMS",
      direction: "inbound",
      channel_message_id: inboundA,
    }]);

    expect((await db.query<{ source: string; phone: string }>(
      "select source,phone from public.leads where id=$1",
      [conversation.lead_id],
    )).rows).toEqual([{ source: "sms", phone: customerA }]);
  });

  it("makes inbound provider retries idempotent without duplicate Leads", async () => {
    expect((await receive(db)).rows[0]?.inserted).toBe(true);
    await db.exec("RESET ROLE");
    expect((await receive(db)).rows[0]?.inserted).toBe(false);

    await db.exec("RESET ROLE");
    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from public.messages where channel_message_id=$1",
      [inboundA],
    )).rows).toEqual([{ count: 1 }]);

    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from public.leads where business_id=$1 and regexp_replace(phone,'[^0-9]','','g')=$2",
      [f.businessA, customerA.replace(/[^0-9]/g, "")],
    )).rows).toEqual([{ count: 1 }]);
  });

  it("links an existing tenant Lead by phone instead of creating another identity", async () => {
    await db.exec("RESET ROLE");
    await db.query("update public.leads set phone=$1 where id=$2", [customerA, f.leadA]);

    const result = (await receive(db)).rows[0]!;
    await db.exec("RESET ROLE");

    expect((await db.query<{ lead_id: string; customer_id: string | null }>(
      "select lead_id,customer_id from public.conversations where id=$1",
      [result.conversation_id],
    )).rows).toEqual([{ lead_id: f.leadA, customer_id: null }]);

    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from public.leads where business_id=$1",
      [f.businessA],
    )).rows).toEqual([{ count: 1 }]);
  });

  it("prefers an existing tenant Customer and preserves its source Lead", async () => {
    await db.exec("RESET ROLE");
    await db.query("update public.leads set phone=$1 where id=$2", [customerA, f.leadA]);
    const customerId = "50000000-0000-4000-8000-000000000099";
    await db.query(
      `insert into public.customers(
        id,business_id,contact_name,phone,email,source_lead_id,erpnext_customer_id,
        erpnext_sync_status,created_by
      ) values ($1,$2,'SMS Customer',$3,'',$4,null,'pending',$5)`,
      [customerId, f.businessA, customerA, f.leadA, f.ownerA],
    );

    const result = (await receive(db)).rows[0]!;
    await db.exec("RESET ROLE");

    expect((await db.query<{ lead_id: string; customer_id: string }>(
      "select lead_id,customer_id from public.conversations where id=$1",
      [result.conversation_id],
    )).rows).toEqual([{ lead_id: f.leadA, customer_id: customerId }]);
  });

  it("keeps tenants isolated by configured SMS sender identity", async () => {
    await receive(db, senderA, customerA, inboundA, "Tenant A");
    await db.exec("RESET ROLE");
    await receive(db, senderB, customerB, "SM33333333333333333333333333333333", "Tenant B");
    await db.exec("RESET ROLE");

    await asUser(db, f.staffA);
    expect((await db.query<{ business_id: string }>(
      "select distinct business_id from public.conversations where channel='sms'",
    )).rows).toEqual([{ business_id: f.businessA }]);

    expect((await db.query<{ body: string }>(
      "select body from public.messages order by body",
    )).rows).toEqual([{ body: "Tenant A" }]);
  });

  it("browser users cannot forge SMS delivery and internal notes remain local", async () => {
    const conversationId = (await receive(db)).rows[0]!.conversation_id;

    await db.exec("RESET ROLE; SAVEPOINT sms_outbound_denial");
    await asUser(db, f.staffA);

    await expect(db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'outbound','Forged SMS')`,
      [f.businessA, conversationId, f.staffA],
    )).rejects.toThrow(/row-level security/);

    await db.exec("ROLLBACK TO SAVEPOINT sms_outbound_denial; RELEASE SAVEPOINT sms_outbound_denial");
    await asUser(db, f.staffA);
    await db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'internal','Private SMS note')`,
      [f.businessA, conversationId, f.staffA],
    );

    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from public.message_deliveries where conversation_id=$1",
      [conversationId],
    )).rows).toEqual([{ count: 0 }]);
  });

  it("uses the restricted outbox and reconciles delivery without broadening capability access", async () => {
    const conversationId = (await receive(db)).rows[0]!.conversation_id;
    await db.exec("RESET ROLE");
    await asCommunicationApi(db);

    const prepared = (await db.query<{
      message_id: string;
      provider: string;
      external_account_id: string;
      external_sender_id: string;
      recipient: string;
      delivery_status: string;
      created: boolean;
    }>(
      "select * from public.sms_prepare_outbound($1,$2,$3,$4,$5)",
      [f.businessA, conversationId, f.staffA, requestA, "Provider SMS reply"],
    )).rows[0]!;

    expect(prepared).toMatchObject({
      provider: "twilio_sms",
      external_account_id: accountA,
      external_sender_id: senderA,
      recipient: customerA,
      delivery_status: "sending",
      created: true,
    });

    expect((await db.query<{ completed: boolean }>(
      "select public.sms_complete_outbound($1,$2,'queued') as completed",
      [prepared.message_id, outboundA],
    )).rows).toEqual([{ completed: true }]);

    await db.exec("SAVEPOINT sms_direct_read");
    await expect(db.query(
      "select status from public.message_deliveries where message_id=$1",
      [prepared.message_id],
    )).rejects.toThrow(/permission denied/);
    await db.exec("ROLLBACK TO SAVEPOINT sms_direct_read; RELEASE SAVEPOINT sms_direct_read");

    expect((await db.query<{ updated: boolean }>(
      "select public.sms_update_delivery($1,'sent',null) as updated",
      [outboundA],
    )).rows).toEqual([{ updated: true }]);

    expect((await db.query<{ updated: boolean }>(
      "select public.sms_update_delivery($1,'delivered',null) as updated",
      [outboundA],
    )).rows).toEqual([{ updated: true }]);

    await db.exec("RESET ROLE");
    await asUser(db, f.staffA);
    expect((await db.query<{ status: string; provider_message_id: string }>(
      "select status,provider_message_id from public.message_deliveries where message_id=$1",
      [prepared.message_id],
    )).rows).toEqual([{ status: "delivered", provider_message_id: outboundA }]);
  });

  it("rejects cross-tenant and revoked-user outbound preparation", async () => {
    const conversationId = (await receive(db)).rows[0]!.conversation_id;
    await db.exec("RESET ROLE");
    await asCommunicationApi(db);

    await expect(db.query(
      "select public.sms_prepare_outbound($1,$2,$3,$4,$5)",
      [f.businessB, conversationId, f.ownerB, requestA, "Cross tenant"],
    )).rejects.toThrow(/Conversation unavailable/);

    await db.exec("ROLLBACK TO SAVEPOINT sms_security_case; SAVEPOINT sms_security_case");
    await receive(db);
    await db.exec("RESET ROLE");
    await asCommunicationApi(db);

    await expect(db.query(
      "select public.sms_prepare_outbound($1,$2,$3,$4,$5)",
      [f.businessA, conversationId, f.removedA, requestA, "Revoked"],
    )).rejects.toThrow(/Conversation unavailable/);
  });

  it("does not allow browser roles to execute transport RPCs or the private resolver", async () => {
    await asUser(db, null);
    await expect(db.query(
      "select public.sms_receive_text($1,$2,$3,$4)",
      [senderA, customerA, inboundA, "Attack"],
    )).rejects.toThrow(/permission denied/);

    await db.exec("ROLLBACK TO SAVEPOINT sms_security_case; SAVEPOINT sms_security_case");
    await asUser(db, f.ownerA);
    await expect(db.query(
      "select * from private.active_sms_connection($1)",
      [senderA],
    )).rejects.toThrow(/permission denied/);

    await db.exec("ROLLBACK TO SAVEPOINT sms_security_case; SAVEPOINT sms_security_case");
    await asUser(db, f.ownerA);
    expect((await db.query(
      "select pg_has_role('authenticated','codeedge_communication_api','MEMBER') as member",
    )).rows).toEqual([{ member: false }]);
  });

  it("preserves forced RLS on generic channel and delivery tables", async () => {
    const result = await db.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname,relrowsecurity,relforcerowsecurity
       from pg_class
       join pg_namespace n on n.oid=relnamespace
       where n.nspname='public'
         and relname in ('channel_connections','message_deliveries')
       order by relname`,
    );

    expect(result.rows).toEqual([
      { relname: "channel_connections", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "message_deliveries", relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });
});
