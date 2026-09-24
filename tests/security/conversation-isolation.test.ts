import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

const customerA = "50000000-0000-4000-8000-000000000011";
const customerB = "50000000-0000-4000-8000-000000000012";
const conversationA = "60000000-0000-4000-8000-000000000001";
const conversationB = "60000000-0000-4000-8000-000000000002";

describe("Conversations and Shared Inbox tenant security", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);

    await db.query(
      `insert into public.customers(
        id,business_id,contact_name,phone,email,source_lead_id,created_by
      ) values
        ($1,$2,'Customer A','111','',$3,$4),
        ($5,$6,'Customer B','','b@example.test',$7,$8)`,
      [customerA, f.businessA, f.leadA, f.ownerA, customerB, f.businessB, f.leadB, f.ownerB],
    );

    await db.query(
      `insert into public.conversations(
        id,business_id,lead_id,customer_id,channel,status,subject,created_by
      ) values
        ($1,$2,$3,$4,'website_chat','open','A website thread',$5),
        ($6,$7,$8,$9,'email','pending','B email thread',$10)`,
      [
        conversationA, f.businessA, f.leadA, customerA, f.ownerA,
        conversationB, f.businessB, f.leadB, customerB, f.ownerB,
      ],
    );

    await db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values
        ($1,$2,'customer',null,'inbound','Hello from A'),
        ($1,$2,'staff',$3,'outbound','Reply from A'),
        ($4,$5,'customer',null,'inbound','Hello from B')`,
      [f.businessA, conversationA, f.ownerA, f.businessB, conversationB],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT conversation_security_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT conversation_security_case; RELEASE SAVEPOINT conversation_security_case");
  });

  it.each([
    [f.ownerA, f.businessA, conversationA],
    [f.staffA, f.businessA, conversationA],
    [f.ownerB, f.businessB, conversationB],
  ])("members read only their tenant conversations and messages", async (userId, businessId, conversationId) => {
    await asUser(db, userId);

    expect((await db.query<{ business_id: string }>(
      "select distinct business_id from public.conversations",
    )).rows).toEqual([{ business_id: businessId }]);

    expect((await db.query<{ business_id: string; conversation_id: string }>(
      "select distinct business_id,conversation_id from public.messages",
    )).rows).toEqual([{ business_id: businessId, conversation_id: conversationId }]);
  });

  it.each([f.ownerA, f.staffA])("owner/staff can append a staff-authored local message", async (userId) => {
    await asUser(db, userId);

    const result = await db.query<{
      sender_type: string;
      sender_user_id: string | null;
      direction: string;
    }>(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'internal','Internal context')
      returning sender_type,sender_user_id,direction`,
      [f.businessA, conversationA, userId],
    );

    expect(result.rows).toEqual([{
      sender_type: "staff",
      sender_user_id: userId,
      direction: "internal",
    }]);
  });

  it("message insert refreshes the inbox preview without granting clients conversation timestamp writes", async () => {
    await asUser(db, f.ownerA);
    await db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'outbound','  Latest   local   reply  ')`,
      [f.businessA, conversationA, f.ownerA],
    );

    expect((await db.query<{
      last_message_preview: string;
      last_message_direction: string | null;
      last_message_sender_type: string | null;
    }>(
      "select last_message_preview,last_message_direction,last_message_sender_type from public.conversations where id=$1",
      [conversationA],
    )).rows).toEqual([{
      last_message_preview: "Latest local reply",
      last_message_direction: "outbound",
      last_message_sender_type: "staff",
    }]);

    await expect(db.query(
      "update public.conversations set last_message_at=now() where id=$1",
      [conversationA],
    )).rejects.toThrow(/permission denied/);
  });

  it("prevents forged business ownership on conversation creation", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      `insert into public.conversations(
        business_id,channel,status,subject,created_by
      ) values ($1,'internal','open','Attack',$2)`,
      [f.businessB, f.ownerA],
    )).rejects.toThrow(/row-level security/);
  });

  it("prevents forged creator identity", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      `insert into public.conversations(
        business_id,channel,status,subject,created_by
      ) values ($1,'internal','open','Attack',$2)`,
      [f.businessA, f.ownerB],
    )).rejects.toThrow(/row-level security/);
  });

  it("ordinary members cannot create an external-channel thread", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      `insert into public.conversations(
        business_id,channel,status,subject,created_by
      ) values ($1,'whatsapp','open','Not connected',$2)`,
      [f.businessA, f.ownerA],
    )).rejects.toThrow(/row-level security/);
  });

  it("prevents cross-tenant Lead and Customer links", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      `insert into public.conversations(
        business_id,lead_id,channel,status,subject,created_by
      ) values ($1,$2,'internal','open','Wrong Lead',$3)`,
      [f.businessA, f.leadB, f.ownerA],
    )).rejects.toThrow(/foreign key/);

    await db.exec("ROLLBACK TO SAVEPOINT conversation_security_case; SAVEPOINT conversation_security_case");
    await asUser(db, f.ownerA);

    await expect(db.query(
      `insert into public.conversations(
        business_id,customer_id,channel,status,subject,created_by
      ) values ($1,$2,'internal','open','Wrong Customer',$3)`,
      [f.businessA, customerB, f.ownerA],
    )).rejects.toThrow(/foreign key/);
  });

  it("prevents forged sender identity and sender type", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'outbound','Forged user')`,
      [f.businessA, conversationA, f.ownerB],
    )).rejects.toThrow(/row-level security/);

    await db.exec("ROLLBACK TO SAVEPOINT conversation_security_case; SAVEPOINT conversation_security_case");
    await asUser(db, f.ownerA);

    await expect(db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'customer',$3,'inbound','Forged customer')`,
      [f.businessA, conversationA, f.ownerA],
    )).rejects.toThrow(/row-level security/);
  });

  it("prevents cross-tenant message linking", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'outbound','Attack')`,
      [f.businessA, conversationB, f.ownerA],
    )).rejects.toThrow(/foreign key|row-level security/);
  });

  it("tenant-qualified relationship rejects a mismatched conversation even for the database owner", async () => {
    await db.exec("RESET ROLE");

    await expect(db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,direction,body
      ) values ($1,$2,'system','internal','Mismatch')`,
      [f.businessB, conversationA],
    )).rejects.toThrow(/foreign key/);
  });

  it.each([f.ownerA, f.staffA])("owner/staff can update own conversation status only", async (userId) => {
    await asUser(db, userId);

    expect((await db.query(
      "update public.conversations set status='resolved' where id=$1 returning status",
      [conversationA],
    )).rows).toEqual([{ status: "resolved" }]);

    expect((await db.query(
      "update public.conversations set status='closed' where id=$1 returning id",
      [conversationB],
    )).rows).toEqual([]);
  });

  it("conversation identity and subject are not mutable through browser grants", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      "update public.conversations set business_id=$1 where id=$2",
      [f.businessB, conversationA],
    )).rejects.toThrow(/permission denied/);

    await db.exec("ROLLBACK TO SAVEPOINT conversation_security_case; SAVEPOINT conversation_security_case");
    await asUser(db, f.ownerA);

    await expect(db.query(
      "update public.conversations set subject='Rewritten' where id=$1",
      [conversationA],
    )).rejects.toThrow(/permission denied/);
  });

  it("messages are append-only for authenticated members", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      "update public.messages set body='Rewritten' where conversation_id=$1",
      [conversationA],
    )).rejects.toThrow(/permission denied/);

    await db.exec("ROLLBACK TO SAVEPOINT conversation_security_case; SAVEPOINT conversation_security_case");
    await asUser(db, f.ownerA);

    await expect(db.query(
      "delete from public.messages where conversation_id=$1",
      [conversationA],
    )).rejects.toThrow(/permission denied/);
  });

  it("database rejects blank and oversized messages", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'outbound','   ')`,
      [f.businessA, conversationA, f.ownerA],
    )).rejects.toThrow(/check constraint/);

    await db.exec("ROLLBACK TO SAVEPOINT conversation_security_case; SAVEPOINT conversation_security_case");
    await asUser(db, f.ownerA);

    await expect(db.query(
      `insert into public.messages(
        business_id,conversation_id,sender_type,sender_user_id,direction,body
      ) values ($1,$2,'staff',$3,'outbound',$4)`,
      [f.businessA, conversationA, f.ownerA, "x".repeat(4001)],
    )).rejects.toThrow(/check constraint/);
  });

  it("revoked membership loses read and write access immediately", async () => {
    await asUser(db, f.removedA);

    expect((await db.query("select id from public.conversations")).rows).toEqual([]);
    expect((await db.query("select id from public.messages")).rows).toEqual([]);

    await expect(db.query(
      `insert into public.conversations(
        business_id,channel,status,subject,created_by
      ) values ($1,'internal','open','Revoked',$2)`,
      [f.businessA, f.removedA],
    )).rejects.toThrow(/row-level security/);
  });

  it.each(["conversations", "messages"])("anonymous users cannot read %s", async (table) => {
    await asUser(db, null);
    await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
  });

  it("suspended business loses inbox access immediately", async () => {
    await db.query("update public.businesses set status='suspended' where id=$1", [f.businessA]);
    await asUser(db, f.ownerA);

    expect((await db.query("select id from public.conversations")).rows).toEqual([]);
    expect((await db.query("select id from public.messages")).rows).toEqual([]);
  });

  it("conversation records do not duplicate or mutate CRM identities", async () => {
    await asUser(db, f.ownerA);

    expect((await db.query<{ contact_name: string }>(
      "select contact_name from public.leads where id=$1",
      [f.leadA],
    )).rows).toEqual([{ contact_name: "Lead A" }]);

    expect((await db.query<{ source_lead_id: string }>(
      "select source_lead_id from public.customers where id=$1",
      [customerA],
    )).rows).toEqual([{ source_lead_id: f.leadA }]);
  });

  it("forces RLS on Conversations and Messages", async () => {
    const result = await db.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname,relrowsecurity,relforcerowsecurity
       from pg_class
       join pg_namespace n on n.oid=relnamespace
       where n.nspname='public'
         and relname in ('conversations','messages')
       order by relname`,
    );

    expect(result.rows).toEqual([
      { relname: "conversations", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "messages", relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });
});
