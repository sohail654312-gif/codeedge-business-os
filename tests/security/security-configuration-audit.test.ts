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

describe("security configuration audit events", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT security_audit_case");
  });

  afterEach(async () => {
    await db.exec(
      "ROLLBACK TO SAVEPOINT security_audit_case; RELEASE SAVEPOINT security_audit_case",
    );
  });

  it("records the authenticated actor and safe before/after channel metadata", async () => {
    await asUser(db, f.ownerA);

    await db.query(
      `insert into public.channel_connections(
        business_id,channel,provider,external_account_id,external_sender_id,
        display_address,credential_key,enabled
      ) values ($1,'sms','twilio_sms',$2,$3,'Audit SMS',$4,true)`,
      [
        f.businessA,
        "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "+441234567890",
        "tenant_a_sms",
      ],
    );

    const connectionId = (await db.query<{ id: string }>(
      `select id from public.channel_connections
       where business_id=$1 and channel='sms' and provider='twilio_sms'`,
      [f.businessA],
    )).rows[0]?.id;
    expect(connectionId).toBeTruthy();

    await db.query(
      "update public.channel_connections set enabled=false where id=$1 and business_id=$2",
      [connectionId, f.businessA],
    );

    const rows = (await db.query<{
      actor_user_id: string | null;
      event_type: string;
      resource_type: string;
      before_metadata: Record<string, unknown>;
      after_metadata: Record<string, unknown>;
    }>(
      `select actor_user_id,event_type,resource_type,before_metadata,after_metadata
       from public.security_audit_events
       where business_id=$1 and resource_id=$2
       order by created_at,id`,
      [f.businessA, connectionId],
    )).rows;

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      actor_user_id: f.ownerA,
      event_type: "security.configuration.insert",
      resource_type: "channel_connection",
    });
    expect(rows[0]?.after_metadata).toMatchObject({
      provider: "twilio_sms",
      credentialKey: "tenant_a_sms",
      enabled: true,
    });
    expect(rows[1]?.before_metadata).toMatchObject({ enabled: true });
    expect(rows[1]?.after_metadata).toMatchObject({ enabled: false });
    expect(JSON.stringify(rows)).not.toMatch(/api[_-]?secret|private[_-]?key|password/i);
  });

  it("keeps audit history tenant-isolated and owner-immutable", async () => {
    await asUser(db, f.ownerA);

    const visible = await db.query<{ business_id: string }>(
      "select business_id from public.security_audit_events order by created_at",
    );
    expect(visible.rows.every((row) => row.business_id === f.businessA)).toBe(true);

    const first = (await db.query<{ id: string }>(
      "select id from public.security_audit_events where business_id=$1 limit 1",
      [f.businessA],
    )).rows[0];

    if (first) {
      await expect(db.query(
        "update public.security_audit_events set event_type='tampered' where id=$1",
        [first.id],
      )).rejects.toThrow(/permission denied|append-only/i);

      await expect(db.query(
        "delete from public.security_audit_events where id=$1",
        [first.id],
      )).rejects.toThrow(/permission denied|append-only/i);
    }
  });

  it("audits Voice receptionist configuration without storing instructions or secrets", async () => {
    await asUser(db, f.ownerA);

    await db.query(
      `insert into public.voice_receptionist_settings(
        business_id,enabled,greeting,provider,voice,preferred_language,
        allowed_tools,handoff_behavior,additional_instructions
      ) values ($1,true,'Hello','vapi','alloy','en',
        array['business_knowledge'],'shared_inbox','Never store this instruction in audit metadata')`,
      [f.businessA],
    );

    const event = (await db.query<{
      actor_user_id: string | null;
      resource_type: string;
      after_metadata: Record<string, unknown>;
    }>(
      `select actor_user_id,resource_type,after_metadata
       from public.security_audit_events
       where business_id=$1 and resource_type='voice_receptionist_settings'
       order by created_at desc limit 1`,
      [f.businessA],
    )).rows[0];

    expect(event).toMatchObject({
      actor_user_id: f.ownerA,
      resource_type: "voice_receptionist_settings",
    });
    expect(event?.after_metadata).toMatchObject({
      enabled: true,
      provider: "vapi",
      preferredLanguage: "en",
    });
    expect(JSON.stringify(event)).not.toContain("Never store this instruction");
  });
});
