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
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

describe("Audit 4 Automation reliability circuit breakers", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT automation_reliability_case");
  });

  afterEach(async () => {
    await db.exec(
      "ROLLBACK TO SAVEPOINT automation_reliability_case; RELEASE SAVEPOINT automation_reliability_case",
    );
  });

  it("allows the 32nd correlation event and rejects the 33rd", async () => {
    const correlationId = "95000000-0000-4000-8000-000000000001";

    await db.query(
      `insert into private.automation_correlation_budgets(
        business_id,correlation_id,event_count,external_effect_count
      ) values ($1,$2,31,0)`,
      [f.businessA, correlationId],
    );

    await db.query(
      "select set_config('codeedge.automation_correlation_id',$1,true)",
      [correlationId],
    );

    await expect(db.query(
      `select private.automation_enqueue(
        $1,'lead.status_changed','lead',$2,'{}'::jsonb
      )`,
      [f.businessA, f.leadA],
    )).resolves.toBeTruthy();

    await expect(db.query(
      `select private.automation_enqueue(
        $1,'lead.status_changed','lead',$2,'{}'::jsonb
      )`,
      [f.businessA, f.leadA],
    )).rejects.toThrow("automation_correlation_event_budget_exceeded");
  });

  it("rejects a causal chain at depth eight", async () => {
    const correlationId = "95000000-0000-4000-8000-000000000002";
    let parent: string | null = null;

    for (let i = 1; i <= 8; i += 1) {
      const id = `96000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      await db.query(
        `insert into public.automation_domain_events(
          id,business_id,event_type,subject_type,subject_id,
          correlation_id,causation_id,payload
        ) values ($1,$2,'lead.status_changed','lead',$3,$4,$5,'{}'::jsonb)`,
        [id, f.businessA, f.leadA, correlationId, parent],
      );
      parent = id;
    }

    await db.query(
      "select set_config('codeedge.automation_correlation_id',$1,true)",
      [correlationId],
    );
    await db.query(
      "select set_config('codeedge.automation_causation_id',$1,true)",
      [parent],
    );

    await expect(db.query(
      `select private.automation_enqueue(
        $1,'lead.status_changed','lead',$2,'{}'::jsonb
      )`,
      [f.businessA, f.leadA],
    )).rejects.toThrow("automation_correlation_depth_exceeded");
  });

  it("allows the 16th external effect and rejects the 17th", async () => {
    const workflowId = "97000000-0000-4000-8000-000000000001";
    const eventId = "98000000-0000-4000-8000-000000000001";
    const runId = "99000000-0000-4000-8000-000000000001";
    const correlationId = "95000000-0000-4000-8000-000000000003";

    await db.query(
      `insert into public.automation_workflows(
        id,business_id,name,trigger_type,conditions,actions,created_by
      ) values ($1,$2,'Reliability budget test','lead.status_changed',
        '[]'::jsonb,'[]'::jsonb,$3)`,
      [workflowId, f.businessA, f.ownerA],
    );

    await db.query(
      `insert into public.automation_domain_events(
        id,business_id,event_type,subject_type,subject_id,
        correlation_id,payload
      ) values ($1,$2,'lead.status_changed','lead',$3,$4,'{}'::jsonb)`,
      [eventId, f.businessA, f.leadA, correlationId],
    );

    await db.query(
      `insert into public.automation_runs(
        id,business_id,workflow_id,workflow_version,event_id,
        status,execution_mode,correlation_id,attempts,started_at
      ) values ($1,$2,$3,1,$4,'running','sandbox',$5,1,now())`,
      [runId, f.businessA, workflowId, eventId, correlationId],
    );

    await db.query(
      `insert into private.automation_correlation_budgets(
        business_id,correlation_id,event_count,external_effect_count
      ) values ($1,$2,1,15)`,
      [f.businessA, correlationId],
    );

    await expect(db.query<{ external_effect_count: number }>(
      "select public.automation_claim_external_effect_budget($1) as external_effect_count",
      [runId],
    )).resolves.toMatchObject({
      rows: [{ external_effect_count: 16 }],
    });

    await expect(db.query(
      "select public.automation_claim_external_effect_budget($1)",
      [runId],
    )).rejects.toThrow("automation_external_effect_budget_exceeded");
  });
});
