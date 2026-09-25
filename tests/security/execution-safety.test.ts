import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

const connectionA = "73000000-0000-4000-8000-000000000001";
const connectionB = "73000000-0000-4000-8000-000000000002";
const conversationA = "63000000-0000-4000-8000-000000000001";
const requestA = "83000000-0000-4000-8000-000000000001";

async function asCommunicationApi(db: TestDatabase) {
  await db.exec("RESET ROLE; SET LOCAL ROLE codeedge_communication_api");
}

async function createDelivery(db: TestDatabase, suffix = "01") {
  const messageId = `93000000-0000-4000-8000-0000000000${suffix}`;
  const deliveryId = `94000000-0000-4000-8000-0000000000${suffix}`;

  await db.query(
    `insert into public.messages(
      id,business_id,conversation_id,sender_type,sender_user_id,direction,body,request_id
    ) values ($1,$2,$3,'staff',$4,'outbound','Execution safety test',$5)`,
    [messageId, f.businessA, conversationA, f.staffA, requestA],
  );

  await db.query(
    `insert into public.message_deliveries(
      id,business_id,message_id,conversation_id,connection_id,provider,status
    ) values ($1,$2,$3,$4,$5,'twilio_sms','sending')`,
    [deliveryId, f.businessA, messageId, conversationA, connectionA],
  );

  return { messageId, deliveryId };
}

describe("execution mode and external-effect database safety", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);

    await db.query(
      `insert into public.channel_connections(
        id,business_id,channel,provider,external_account_id,external_sender_id,
        display_address,credential_key,enabled
      ) values
        ($1,$2,'sms','twilio_sms','ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          '+441234567890','Execution A','exec_a',true),
        ($3,$4,'sms','twilio_sms','ACbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          '+441234567891','Execution B','exec_b',true)`,
      [connectionA, f.businessA, connectionB, f.businessB],
    );

    await db.query(
      `insert into public.conversations(
        id,business_id,lead_id,channel_connection_id,channel,status,subject,
        external_thread_id,created_by
      ) values ($1,$2,$3,$4,'sms','open','Execution test','+447700900123',$5)`,
      [conversationA, f.businessA, f.leadA, connectionA, f.ownerA],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT execution_safety_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT execution_safety_case; RELEASE SAVEPOINT execution_safety_case");
  });

  it("defaults existing/new workspace and provider configuration to production", async () => {
    expect((await db.query<{ execution_mode: string }>(
      "select execution_mode from public.businesses where id=$1",
      [f.businessA],
    )).rows).toEqual([{ execution_mode: "production" }]);

    expect((await db.query<{ credential_environment: string }>(
      "select credential_environment from public.channel_connections where id=$1",
      [connectionA],
    )).rows).toEqual([{ credential_environment: "production" }]);
  });

  it("does not let an owner browser override execution mode or credential environment", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      "update public.businesses set execution_mode='demo' where id=$1",
      [f.businessA],
    )).rejects.toThrow(/permission denied/);

    await db.exec("ROLLBACK TO SAVEPOINT execution_safety_case; SAVEPOINT execution_safety_case");
    await asUser(db, f.ownerA);

    await expect(db.query(
      "update public.channel_connections set credential_environment='sandbox' where id=$1",
      [connectionA],
    )).rejects.toThrow(/permission denied/);
  });

  it("snapshots server-trusted execution context and correlation on every delivery", async () => {
    await db.query(
      "update public.businesses set execution_mode='demo' where id=$1",
      [f.businessA],
    );
    await db.query(
      "update public.channel_connections set credential_environment='sandbox' where id=$1",
      [connectionA],
    );

    const { messageId } = await createDelivery(db);

    expect((await db.query<{
      execution_mode: string;
      provider_environment: string;
      correlation_id: string;
      simulated: boolean;
    }>(
      `select execution_mode,provider_environment,correlation_id,simulated
       from public.message_deliveries where message_id=$1`,
      [messageId],
    )).rows).toEqual([{
      execution_mode: "demo",
      provider_environment: "sandbox",
      correlation_id: requestA,
      simulated: false,
    }]);
  });

  it("exposes execution context only through the narrow communication capability RPC", async () => {
    const { messageId } = await createDelivery(db);

    await db.exec("RESET ROLE");
    await asCommunicationApi(db);

    expect((await db.query<{
      business_id: string;
      execution_mode: string;
      prepared_execution_mode: string;
      channel: string;
      provider: string;
      provider_environment: string;
      prepared_provider_environment: string;
      correlation_id: string;
      simulated: boolean;
    }>(
      "select * from public.communication_execution_context($1)",
      [messageId],
    )).rows).toEqual([{
      business_id: f.businessA,
      execution_mode: "production",
      prepared_execution_mode: "production",
      channel: "sms",
      provider: "twilio_sms",
      provider_environment: "production",
      prepared_provider_environment: "production",
      correlation_id: requestA,
      simulated: false,
    }]);

    await db.exec("SAVEPOINT execution_direct_read");
    await expect(db.query(
      "select execution_mode from public.message_deliveries where message_id=$1",
      [messageId],
    )).rejects.toThrow(/permission denied/);
    await db.exec("ROLLBACK TO SAVEPOINT execution_direct_read; RELEASE SAVEPOINT execution_direct_read");
  });

  it("exposes a current-vs-prepared mismatch so dispatch can fail closed", async () => {
    const { messageId } = await createDelivery(db);

    await db.query(
      "update public.businesses set execution_mode='demo' where id=$1",
      [f.businessA],
    );

    await asCommunicationApi(db);
    expect((await db.query<{
      execution_mode: string;
      prepared_execution_mode: string;
    }>(
      "select execution_mode,prepared_execution_mode from public.communication_execution_context($1)",
      [messageId],
    )).rows).toEqual([{
      execution_mode: "demo",
      prepared_execution_mode: "production",
    }]);
  });

  it("denies browser execution-context RPC access", async () => {
    const { messageId } = await createDelivery(db);
    await db.exec("RESET ROLE");
    await asUser(db, f.ownerA);

    await expect(db.query(
      "select * from public.communication_execution_context($1)",
      [messageId],
    )).rejects.toThrow(/permission denied/);
  });

  it("keeps same-tenant constraints effective for delivery context", async () => {
    const messageId = "93000000-0000-4000-8000-000000000099";
    await db.query(
      `insert into public.messages(
        id,business_id,conversation_id,sender_type,sender_user_id,direction,body,request_id
      ) values ($1,$2,$3,'staff',$4,'outbound','Cross tenant context',$5)`,
      [messageId, f.businessA, conversationA, f.staffA, requestA],
    );

    await expect(db.query(
      `insert into public.message_deliveries(
        business_id,message_id,conversation_id,connection_id,provider,status
      ) values ($1,$2,$3,$4,'twilio_sms','sending')`,
      [f.businessA, messageId, conversationA, connectionB],
    )).rejects.toThrow();
  });

  it("retains the restricted communication role attributes", async () => {
    const role = (await db.query<{
      rolcanlogin: boolean;
      rolinherit: boolean;
      rolbypassrls: boolean;
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
    }>(
      `select rolcanlogin,rolinherit,rolbypassrls,rolsuper,rolcreaterole,rolcreatedb
       from pg_roles where rolname='codeedge_communication_api'`,
    )).rows[0];

    expect(role).toEqual({
      rolcanlogin: false,
      rolinherit: false,
      rolbypassrls: false,
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
  });
});
