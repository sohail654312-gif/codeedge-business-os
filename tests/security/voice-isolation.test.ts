import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";
import { parseVapiServerMessage } from "@/server/voice/vapi";

const conversationA = "66000000-0000-4000-8000-000000000001";
const conversationB = "66000000-0000-4000-8000-000000000002";
const connectionA = "76000000-0000-4000-8000-000000000001";
const connectionB = "76000000-0000-4000-8000-000000000002";
const voiceCallA = "86000000-0000-4000-8000-000000000001";

async function asVoiceApi(db: TestDatabase) {
  await db.exec("RESET ROLE; SET LOCAL ROLE codeedge_voice_api");
}

describe("Voice tenant isolation and execution safety", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);

    await db.query(
      `insert into public.channel_connections(
        id,business_id,channel,provider,external_account_id,external_sender_id,
        display_address,credential_key,credential_environment,enabled
      ) values
        ($1,$2,'voice','vapi','assistant-a','phone-number-a',
          '+441234567890','voice_a','production',true),
        ($3,$4,'voice','vapi','assistant-b','phone-number-b',
          '+441234567891','voice_b','production',true)`,
      [connectionA, f.businessA, connectionB, f.businessB],
    );

    await db.query(
      `insert into public.conversations(
        id,business_id,lead_id,channel_connection_id,channel,status,subject,
        external_thread_id,created_by
      ) values
        ($1,$2,$3,$4,'voice','open','Voice A','call-a',$5),
        ($6,$7,$8,$9,'voice','open','Voice B','call-b',$10)`,
      [
        conversationA,
        f.businessA,
        f.leadA,
        connectionA,
        f.ownerA,
        conversationB,
        f.businessB,
        f.leadB,
        connectionB,
        f.ownerB,
      ],
    );

    await db.query(
      `insert into public.voice_calls(
        id,business_id,conversation_id,lead_id,channel_connection_id,provider,
        provider_call_id,direction,from_number,to_number,status,execution_mode,
        provider_environment,correlation_id
      ) values (
        $1,$2,$3,$4,$5,'vapi','provider-call-a','inbound',
        '+447700900123','+441234567890','in_progress','production','production',
        '88000000-0000-4000-8000-000000000001'
      )`,
      [voiceCallA, f.businessA, conversationA, f.leadA, connectionA],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT voice_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT voice_case; RELEASE SAVEPOINT voice_case");
  });

  it("lets Tenant A read only Tenant A Voice calls", async () => {
    await asUser(db, f.ownerA);

    expect((await db.query<{ id: string }>(
      "select id from public.voice_calls order by id",
    )).rows).toEqual([{ id: voiceCallA }]);
  });

  it("does not allow browser users to forge Voice calls", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      `insert into public.voice_calls(
        business_id,conversation_id,lead_id,channel_connection_id,provider,
        direction,from_number,to_number,status,execution_mode,provider_environment
      ) values ($1,$2,$3,$4,'vapi','outbound','x','y','queued','production','production')`,
      [f.businessA, conversationA, f.leadA, connectionA],
    )).rejects.toThrow(/permission denied/);
  });

  it("rejects cross-tenant CRM links at the database boundary", async () => {
    await expect(db.query(
      `insert into public.voice_calls(
        business_id,conversation_id,lead_id,channel_connection_id,provider,
        direction,from_number,to_number,status,execution_mode,provider_environment
      ) values ($1,$2,$3,$4,'vapi','outbound','x','y','queued','production','production')`,
      [f.businessA, conversationA, f.leadB, connectionA],
    )).rejects.toThrow();
  });

  it("keeps provider events private from browser roles", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      "select * from public.voice_provider_events",
    )).rejects.toThrow(/permission denied/);
  });

  it("resolves provider connections only through the restricted Voice capability", async () => {
    await asVoiceApi(db);

    expect((await db.query<{
      business_id: string;
      connection_id: string;
    }>(
      "select business_id,connection_id from public.voice_resolve_connection($1,$2)",
      ["vapi", "phone-number-a"],
    )).rows).toEqual([{
      business_id: f.businessA,
      connection_id: connectionA,
    }]);

    await db.exec("RESET ROLE; SET LOCAL ROLE authenticated");
    await expect(db.query(
      "select * from public.voice_resolve_connection($1,$2)",
      ["vapi", "phone-number-a"],
    )).rejects.toThrow(/permission denied/);
  });

  it("deduplicates webhook retries and canonical transcript Messages", async () => {
    await asVoiceApi(db);

    const payload = {
      message: {
        type: "end-of-call-report",
        call: {
          id: "provider-call-a",
          type: "inboundPhoneCall",
          phoneNumberId: "phone-number-a",
          customer: { number: "+447700900123" },
          phoneNumber: { number: "+441234567890" },
        },
        artifact: {
          messages: [
            { role: "user", message: "I need an appointment" },
          ],
        },
      },
    };

    const original = parseVapiServerMessage(payload);
    const retry = parseVapiServerMessage(payload);
    expect(retry.providerEventId).toBe(original.providerEventId);

    const first = (await db.query<{ inserted: boolean }>(
      `select inserted from public.voice_receive_event(
        $1,$2,$3,'inbound',$4,$5,'completed',$6
      )`,
      [
        connectionA,
        original.providerEventId,
        original.providerCallId,
        original.fromNumber,
        original.toNumber,
        original.occurredAt,
      ],
    )).rows[0];

    const second = (await db.query<{ inserted: boolean }>(
      `select inserted from public.voice_receive_event(
        $1,$2,$3,'inbound',$4,$5,'completed',$6
      )`,
      [
        connectionA,
        retry.providerEventId,
        retry.providerCallId,
        retry.fromNumber,
        retry.toNumber,
        retry.occurredAt,
      ],
    )).rows[0];

    expect(first?.inserted).toBe(true);
    expect(second?.inserted).toBe(false);

    const messageId = (await db.query<{ voice_append_transcript: string }>(
      "select public.voice_append_transcript($1,$2,'caller',$3)",
      [voiceCallA, `${original.providerEventId}:0`, "I need an appointment"],
    )).rows[0]?.voice_append_transcript;

    const duplicateId = (await db.query<{ voice_append_transcript: string }>(
      "select public.voice_append_transcript($1,$2,'caller',$3)",
      [voiceCallA, `${retry.providerEventId}:0`, "I need an appointment"],
    )).rows[0]?.voice_append_transcript;

    expect(duplicateId).toBe(messageId);
  });

  it("blocks live outbound preparation in a Demo workspace", async () => {
    await db.query(
      "update public.businesses set execution_mode='demo' where id=$1",
      [f.businessA],
    );

    await asVoiceApi(db);
    await expect(db.query(
      "select * from public.voice_prepare_outbound($1,$2,$3,$4,$5)",
      [
        f.businessA,
        f.ownerA,
        "88000000-0000-4000-8000-000000000099",
        f.leadA,
        null,
      ],
    )).rejects.toThrow(/blocked for Demo/i);
  });

  it("allows Demo Voice only for a server-verified Demo tenant", async () => {
    await db.query(
      "update public.businesses set execution_mode='demo' where id=$1",
      [f.businessA],
    );

    await asUser(db, f.ownerA);
    const created = (await db.query<{
      voice_call_id: string;
      lead_id: string;
      created: boolean;
    }>(
      "select * from public.voice_start_demo_call($1,$2,$3,$4,$5)",
      [
        f.businessA,
        f.ownerA,
        "88000000-0000-4000-8000-000000000088",
        "Demo Caller",
        "+447700900999",
      ],
    )).rows[0];

    expect(created?.created).toBe(true);

    await db.exec("RESET ROLE");
    expect((await db.query<{
      provider: string;
      execution_mode: string;
      channel_connection_id: string | null;
    }>(
      "select provider,execution_mode,channel_connection_id from public.voice_calls where id=$1",
      [created?.voice_call_id],
    )).rows).toEqual([{
      provider: "demo_voice",
      execution_mode: "demo",
      channel_connection_id: null,
    }]);
  });

  it("keeps the Voice capability role non-login and non-bypass", async () => {
    const role = (await db.query<{
      rolcanlogin: boolean;
      rolinherit: boolean;
      rolbypassrls: boolean;
      rolsuper: boolean;
    }>(
      `select rolcanlogin,rolinherit,rolbypassrls,rolsuper
       from pg_roles where rolname='codeedge_voice_api'`,
    )).rows[0];

    expect(role).toEqual({
      rolcanlogin: false,
      rolinherit: false,
      rolbypassrls: false,
      rolsuper: false,
    });
  });
});
