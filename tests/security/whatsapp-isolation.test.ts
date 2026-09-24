import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

const connectionA = "70000000-0000-4000-8000-000000000001";
const connectionB = "70000000-0000-4000-8000-000000000002";
const senderA = "109876543210";
const senderB = "109876543211";
const customerA = "447700900123";
const customerB = "447700900124";
const requestA = "80000000-0000-4000-8000-000000000001";

async function asCommunicationApi(db: TestDatabase) {
  await db.exec("RESET ROLE; SET LOCAL ROLE codeedge_communication_api");
}

async function receive(
  db: TestDatabase,
  sender = senderA,
  customer = customerA,
  messageId = "wamid.inbound.a",
  body = "Hello from WhatsApp",
) {
  await asCommunicationApi(db);
  return db.query<{
    conversation_id: string;
    message_id: string;
    inserted: boolean;
  }>(
    "select * from public.whatsapp_receive_text($1,$2,$3,$4,$5)",
    [sender, customer, "WhatsApp Customer", messageId, body],
  );
}

describe("WhatsApp tenant security and canonical integration", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);

    await db.query(
      `insert into public.channel_connections(
        id,business_id,channel,provider,external_account_id,external_sender_id,
        display_address,credential_key,enabled
      ) values
        ($1,$2,'whatsapp','meta_whatsapp_cloud','waba-a',$3,'+44 A','tenant_a',true),
        ($4,$5,'whatsapp','meta_whatsapp_cloud','waba-b',$6,'+44 B','tenant_b',true)`,
      [connectionA, f.businessA, senderA, connectionB, f.businessB, senderB],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT whatsapp_security_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT whatsapp_security_case; RELEASE SAVEPOINT whatsapp_security_case");
  });

  it("maps inbound WhatsApp text to the canonical Shared Inbox and CRM Lead", async () => {
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
      `select id,business_id,channel,channel_connection_id,external_thread_id,lead_id
       from public.conversations where channel='whatsapp'`,
    )).rows[0]!;

    expect(conversation).toMatchObject({
      business_id: f.businessA,
      channel: "whatsapp",
      channel_connection_id: connectionA,
      external_thread_id: customerA,
    });

    expect((await db.query<{
      business_id: string;
      conversation_id: string;
      sender_type: string;
      direction: string;
      body: string;
      channel_message_id: string;
    }>(
      "select business_id,conversation_id,sender_type,direction,body,channel_message_id from public.messages where conversation_id=$1",
      [conversation.id],
    )).rows).toEqual([{
      business_id: f.businessA,
      conversation_id: conversation.id,
      sender_type: "customer",
      direction: "inbound",
      body: "Hello from WhatsApp",
      channel_message_id: "wamid.inbound.a",
    }]);

    expect((await db.query<{ business_id: string; source: string; phone: string }>(
      "select business_id,source,phone from public.leads where id=$1",
      [conversation.lead_id],
    )).rows).toEqual([{
      business_id: f.businessA,
      source: "whatsapp",
      phone: "+" + customerA,
    }]);
  });

  it("makes inbound provider retries idempotent", async () => {
    expect((await receive(db)).rows[0]?.inserted).toBe(true);
    await db.exec("RESET ROLE");
    expect((await receive(db)).rows[0]?.inserted).toBe(false);

    await db.exec("RESET ROLE");
    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from public.messages where channel_message_id='wamid.inbound.a'",
    )).rows).toEqual([{ count: 1 }]);
  });

  it("keeps tenants isolated by configured provider sender identity", async () => {
    await receive(db, senderA, customerA, "wamid.a", "Tenant A");
    await db.exec("RESET ROLE");
    await receive(db, senderB, customerB, "wamid.b", "Tenant B");
    await db.exec("RESET ROLE");

    await asUser(db, f.staffA);
    expect((await db.query<{ business_id: string }>(
      "select distinct business_id from public.conversations where channel='whatsapp'",
    )).rows).toEqual([{ business_id: f.businessA }]);

    expect((await db.query<{ body: string }>(
      "select body from public.messages order by body",
    )).rows).toEqual([{ body: "Tenant A" }]);
  });

  it("browser users cannot forge a WhatsApp outbound delivery", async () => {
    const inbound = await receive(db);
    const conversationId = inbound.rows[0]!.conversation_id;

    await db.exec("RESET ROLE");
    await asUser(db, f.staffA);

    await expect(db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'outbound','Forged WhatsApp send')`,
      [f.businessA, conversationId, f.staffA],
    )).rejects.toThrow(/row-level security/);

    await db.exec("ROLLBACK TO SAVEPOINT whatsapp_security_case; SAVEPOINT whatsapp_security_case");
    await asUser(db, f.staffA);

    await db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'internal','Private note')`,
      [f.businessA, conversationId, f.staffA],
    );

    expect((await db.query<{ direction: string; body: string }>(
      "select direction,body from public.messages where body='Private note'",
    )).rows).toEqual([{ direction: "internal", body: "Private note" }]);
  });

  it("prepares and completes an outbound reply only through the restricted capability", async () => {
    const inbound = await receive(db);
    const conversationId = inbound.rows[0]!.conversation_id;

    await db.exec("RESET ROLE");
    await asCommunicationApi(db);

    const prepared = (await db.query<{
      message_id: string;
      provider: string;
      recipient: string;
      delivery_status: string;
      created: boolean;
    }>(
      "select * from public.whatsapp_prepare_outbound($1,$2,$3,$4,$5)",
      [f.businessA, conversationId, f.staffA, requestA, "Provider reply"],
    )).rows[0]!;

    expect(prepared).toMatchObject({
      provider: "meta_whatsapp_cloud",
      recipient: customerA,
      delivery_status: "sending",
      created: true,
    });

    expect((await db.query<{ completed: boolean }>(
      "select public.whatsapp_complete_outbound($1,$2) as completed",
      [prepared.message_id, "wamid.outbound.a"],
    )).rows).toEqual([{ completed: true }]);

    expect((await db.query<{ updated: boolean }>(
      "select public.whatsapp_update_delivery($1,'delivered',null) as updated",
      ["wamid.outbound.a"],
    )).rows).toEqual([{ updated: true }]);

    await db.exec("RESET ROLE");
    await asUser(db, f.staffA);
    expect((await db.query<{ status: string; provider_message_id: string }>(
      "select status,provider_message_id from public.message_deliveries where message_id=$1",
      [prepared.message_id],
    )).rows).toEqual([{
      status: "delivered",
      provider_message_id: "wamid.outbound.a",
    }]);
  });

  it("does not allow anon/authenticated roles to execute or assume the transport capability", async () => {
    await asUser(db, null);
    await expect(db.query(
      "select public.whatsapp_receive_text($1,$2,$3,$4,$5)",
      [senderA, customerA, "Attacker", "wamid.attack", "Attack"],
    )).rejects.toThrow(/permission denied/);

    await db.exec("ROLLBACK TO SAVEPOINT whatsapp_security_case; SAVEPOINT whatsapp_security_case");
    await asUser(db, f.ownerA);
    await expect(db.query(
      "select public.whatsapp_prepare_outbound($1,$2,$3,$4,$5)",
      [f.businessA, "60000000-0000-4000-8000-000000000099", f.ownerA, requestA, "Attack"],
    )).rejects.toThrow(/permission denied/);

    expect((await db.query(
      "select pg_has_role('authenticated','codeedge_communication_api','MEMBER') as member",
    )).rows).toEqual([{ member: false }]);
  });

  it("only owners can change their own connection and cannot forge provider identity columns", async () => {
    await asUser(db, f.staffA);
    expect((await db.query(
      "update public.channel_connections set enabled=false returning id",
    )).rows).toEqual([]);

    await db.exec("RESET ROLE");
    await asUser(db, f.ownerA);
    expect((await db.query(
      "update public.channel_connections set enabled=false returning id",
    )).rows).toEqual([{ id: connectionA }]);

    await expect(db.query(
      "update public.channel_connections set provider='attacker' where id=$1",
      [connectionA],
    )).rejects.toThrow(/permission denied/);
  });

  it("forces RLS on generic channel and delivery tables", async () => {
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
