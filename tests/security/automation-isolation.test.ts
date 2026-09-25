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

const workflowA = "94000000-0000-4000-8000-000000000001";
const workflowB = "94000000-0000-4000-8000-000000000002";

async function asAutomationApi(db: TestDatabase) {
  await db.exec("RESET ROLE; SET LOCAL ROLE codeedge_automation_api");
}

describe("Automation tenant isolation and event safety", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);

    await db.query(
      `insert into public.automation_workflows(
        id,business_id,name,trigger_type,conditions,actions,created_by
      ) values
        ($1,$2,'Lead follow-up A','lead.status_changed','[]'::jsonb,
          $3::jsonb,$4),
        ($5,$6,'Lead follow-up B','lead.status_changed','[]'::jsonb,
          $7::jsonb,$8)`,
      [
        workflowA,
        f.businessA,
        JSON.stringify([{
          type: "crm.update_lead_status",
          leadIdPath: "lead.id",
          status: "qualified",
        }]),
        f.ownerA,
        workflowB,
        f.businessB,
        JSON.stringify([{
          type: "crm.update_lead_status",
          leadIdPath: "lead.id",
          status: "qualified",
        }]),
        f.ownerB,
      ],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT automation_case");
  });

  afterEach(async () => {
    await db.exec(
      "ROLLBACK TO SAVEPOINT automation_case; RELEASE SAVEPOINT automation_case",
    );
  });

  it("shows each authenticated tenant only its own workflows", async () => {
    await asUser(db, f.ownerA);

    expect((await db.query<{ id: string }>(
      "select id from public.automation_workflows order by id",
    )).rows).toEqual([{ id: workflowA }]);
  });

  it("does not let staff create Automation workflows", async () => {
    await asUser(db, f.staffA);

    await expect(db.query(
      `insert into public.automation_workflows(
        business_id,name,trigger_type,conditions,actions,created_by
      ) values ($1,'Forbidden','lead.created','[]'::jsonb,$2::jsonb,$3)`,
      [
        f.businessA,
        JSON.stringify([{
          type: "crm.update_lead_status",
          leadIdPath: "lead.id",
          status: "contacted",
        }]),
        f.staffA,
      ],
    )).rejects.toThrow();
  });

  it("creates trusted domain events and one matching run on Lead status change", async () => {
    await db.query(
      "update public.leads set status='contacted' where id=$1",
      [f.leadA],
    );

    const events = (await db.query<{
      id: string;
      business_id: string;
      event_type: string;
      subject_id: string;
    }>(
      `select id,business_id,event_type,subject_id
       from public.automation_domain_events
       where business_id=$1 and event_type='lead.status_changed'`,
      [f.businessA],
    )).rows;

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      business_id: f.businessA,
      event_type: "lead.status_changed",
      subject_id: f.leadA,
    });

    const runs = (await db.query<{
      workflow_id: string;
      event_id: string;
      status: string;
    }>(
      "select workflow_id,event_id,status from public.automation_runs where workflow_id=$1",
      [workflowA],
    )).rows;

    expect(runs).toHaveLength(1);
    expect(runs[0]?.event_id).toBe(events[0]?.id);
    expect(runs[0]?.status).toBe("pending");
  });

  it("keeps Automation event writes unavailable to browser roles", async () => {
    await asUser(db, f.ownerA);

    await expect(db.query(
      `insert into public.automation_domain_events(
        business_id,event_type,subject_type,subject_id,payload
      ) values ($1,'lead.created','lead',$2,'{}'::jsonb)`,
      [f.businessA, f.leadA],
    )).rejects.toThrow();
  });

  it("claims a run once and cannot duplicate the workflow/event pair", async () => {
    await db.query(
      "update public.leads set status='contacted' where id=$1",
      [f.leadA],
    );

    await asAutomationApi(db);
    const first = (await db.query<{ run_id: string }>(
      "select run_id from public.automation_claim_runs(10)",
    )).rows;
    const second = (await db.query<{ run_id: string }>(
      "select run_id from public.automation_claim_runs(10)",
    )).rows;

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it("propagates correlation and causation for Automation-triggered domain changes", async () => {
    await db.query(
      "update public.leads set status='contacted' where id=$1",
      [f.leadA],
    );

    const source = (await db.query<{
      id: string;
      correlation_id: string;
    }>(
      `select id,correlation_id
       from public.automation_domain_events
       where business_id=$1 and event_type='lead.status_changed'
       order by created_at desc limit 1`,
      [f.businessA],
    )).rows[0];

    await asAutomationApi(db);
    const claimed = (await db.query<{ run_id: string }>(
      "select run_id from public.automation_claim_runs(1)",
    )).rows[0];

    expect(claimed?.run_id).toBeTruthy();

    await db.query(
      "select public.automation_update_lead_status($1,$2,'qualified')",
      [claimed?.run_id, f.leadA],
    );

    await db.exec("RESET ROLE");
    const caused = (await db.query<{
      correlation_id: string;
      causation_id: string | null;
    }>(
      `select correlation_id,causation_id
       from public.automation_domain_events
       where business_id=$1
         and event_type='lead.status_changed'
         and payload #>> '{lead,status}' = 'qualified'
       limit 1`,
      [f.businessA],
    )).rows[0];

    expect(caused?.correlation_id).toBe(source?.correlation_id);
    expect(caused?.causation_id).toBe(source?.id);
  });

  it("keeps the Automation capability role non-login and non-bypass", async () => {
    const role = (await db.query<{
      rolcanlogin: boolean;
      rolinherit: boolean;
      rolbypassrls: boolean;
      rolsuper: boolean;
    }>(
      `select rolcanlogin,rolinherit,rolbypassrls,rolsuper
       from pg_roles where rolname='codeedge_automation_api'`,
    )).rows[0];

    expect(role).toEqual({
      rolcanlogin: false,
      rolinherit: false,
      rolbypassrls: false,
      rolsuper: false,
    });
  });
});
