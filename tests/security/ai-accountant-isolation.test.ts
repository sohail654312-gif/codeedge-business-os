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

const connectionA="71000000-0000-4000-8000-000000000011";
const connectionB="71000000-0000-4000-8000-000000000012";
const sessionA="81000000-0000-4000-8000-000000000001";
const sessionB="81000000-0000-4000-8000-000000000002";
const proposalA="82000000-0000-4000-8000-000000000001";
const proposalB="82000000-0000-4000-8000-000000000002";
const correlationA="83000000-0000-4000-8000-000000000001";
const correlationB="83000000-0000-4000-8000-000000000002";
const hashA="a".repeat(64);
const hashB="b".repeat(64);

async function asAI(db: TestDatabase) {
  await db.exec("RESET ROLE; SET LOCAL ROLE codeedge_ai_api");
}

async function expectDbReject(
  db: TestDatabase,
  work: () => Promise<unknown>,
) {
  await db.exec("SAVEPOINT expected_ai_failure");
  try {
    await expect(work()).rejects.toThrow();
  } finally {
    await db.exec(
      "ROLLBACK TO SAVEPOINT expected_ai_failure; RELEASE SAVEPOINT expected_ai_failure",
    );
  }
}

async function createProposal(
  db: TestDatabase,
  input: {
    proposalId?: string;
    businessId?: string;
    userId?: string;
    sessionId?: string;
    payloadHash?: string;
    correlationId?: string;
  } = {},
) {
  const proposalId=input.proposalId ?? proposalA;
  const businessId=input.businessId ?? f.businessA;
  const userId=input.userId ?? f.ownerA;
  const targetSession=input.sessionId ?? sessionA;
  const payloadHash=input.payloadHash ?? hashA;
  const correlationId=input.correlationId ?? correlationA;

  await asAI(db);
  const row=(await db.query<{ ai_create_action_proposal:string }>(
    "select public.ai_create_action_proposal($1,$2,$3,$4,'finance.invoice.create',$5::jsonb,$6,now()+interval '15 minutes',$7,'demo_finance','demo')",
    [
      proposalId,businessId,userId,targetSession,
      JSON.stringify({
        crmCustomerId:"40000000-0000-4000-8000-000000000001",
        currency:"GBP",
        amount:"500.00",
        dueAt:null,
      }),
      payloadHash,correlationId,
    ],
  )).rows[0];

  expect(row?.ai_create_action_proposal).toBe(proposalId);
}

describe("AI Accountant tenant approval and replay safety", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db=await openDatabase();
    await seedDatabase(db);

    await db.query(
      "update public.businesses set execution_mode='demo' where id in ($1,$2)",
      [f.businessA,f.businessB],
    );
    await db.query(
      "insert into public.finance_connections(id,business_id,engine,enabled,default_currency) values ($1,$2,'demo_finance',true,'GBP'),($3,$4,'demo_finance',true,'PKR')",
      [connectionA,f.businessA,connectionB,f.businessB],
    );

    await asAI(db);
    await db.query(
      "select public.ai_start_session($1,$2,$3,'demo_ai','demo-model','accountant-v1')",
      [sessionA,f.businessA,f.ownerA],
    );
    await db.query(
      "select public.ai_start_session($1,$2,$3,'demo_ai','demo-model','accountant-v1')",
      [sessionB,f.businessB,f.ownerB],
    );
    await db.query(
      "select public.ai_append_message($1,$2,$3,'user',$4,'','')",
      [f.businessA,f.ownerA,sessionA,"Tenant A question"],
    );
    await db.query(
      "select public.ai_append_message($1,$2,$3,'user',$4,'','')",
      [f.businessB,f.ownerB,sessionB,"Tenant B question"],
    );
    await createProposal(db);
    await createProposal(db,{
      proposalId:proposalB,
      businessId:f.businessB,
      userId:f.ownerB,
      sessionId:sessionB,
      payloadHash:hashB,
      correlationId:correlationB,
    });
    await db.exec("RESET ROLE");
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT ai_case");
  });

  afterEach(async () => {
    await db.exec("RESET ROLE");
    await db.exec("ROLLBACK TO SAVEPOINT ai_case; RELEASE SAVEPOINT ai_case");
  });

  it("lets Tenant A read only Tenant A AI sessions messages and proposals", async () => {
    await asUser(db,f.ownerA);

    const sessions=(await db.query<{ id:string;business_id:string }>(
      "select id,business_id from public.ai_sessions order by id",
    )).rows;
    const messages=(await db.query<{ business_id:string;content:string }>(
      "select business_id,content from public.ai_messages order by created_at",
    )).rows;
    const proposals=(await db.query<{ id:string;business_id:string }>(
      "select id,business_id from public.ai_action_proposals order by id",
    )).rows;

    expect(sessions).toEqual([{ id:sessionA,business_id:f.businessA }]);
    expect(messages).toEqual([{
      business_id:f.businessA,
      content:"Tenant A question",
    }]);
    expect(proposals).toEqual([{ id:proposalA,business_id:f.businessA }]);
  });

  it("does not allow browser roles to create AI persistence records directly", async () => {
    await asUser(db,f.ownerA);
    await expectDbReject(db,() => db.query(
      "insert into public.ai_sessions(id,business_id,agent_type,created_by,status,provider,model,prompt_version) values ($1,$2,'accountant',$3,'active','demo_ai','x','accountant-v1')",
      ["81000000-0000-4000-8000-000000000099",f.businessA,f.ownerA],
    ));
  });

  it("rejects forged tenant identity and forged user identity", async () => {
    await asAI(db);
    await expectDbReject(db,() => db.query(
      "select public.ai_start_session($1,$2,$3,'demo_ai','x','accountant-v1')",
      ["81000000-0000-4000-8000-000000000098",f.businessB,f.ownerA],
    ));
    await expectDbReject(db,() => db.query(
      "select public.ai_start_session($1,$2,$3,'demo_ai','x','accountant-v1')",
      ["81000000-0000-4000-8000-000000000097",f.businessA,f.ownerB],
    ));
  });

  it("proposal creation itself causes zero Finance document writes", async () => {
    await db.exec("RESET ROLE");
    const before=Number((await db.query<{ count:string }>(
      "select count(*)::text as count from public.demo_finance_documents where business_id=$1",
      [f.businessA],
    )).rows[0]?.count ?? "0");

    await createProposal(db,{
      proposalId:"82000000-0000-4000-8000-000000000089",
      payloadHash:"d".repeat(64),
    });

    await db.exec("RESET ROLE");
    const after=Number((await db.query<{ count:string }>(
      "select count(*)::text as count from public.demo_finance_documents where business_id=$1",
      [f.businessA],
    )).rows[0]?.count ?? "0");

    expect(after).toBe(before);
  });

  it("allows staff to ask/propose but never to approve a consequential Finance write", async () => {
    const staffSession="81000000-0000-4000-8000-000000000090";
    const staffProposal="82000000-0000-4000-8000-000000000090";

    await asAI(db);
    await db.query(
      "select public.ai_start_session($1,$2,$3,'demo_ai','x','accountant-v1')",
      [staffSession,f.businessA,f.staffA],
    );
    await createProposal(db,{
      proposalId:staffProposal,
      userId:f.staffA,
      sessionId:staffSession,
      payloadHash:"c".repeat(64),
    });

    await asAI(db);
    await expectDbReject(db,() => db.query(
      "select * from public.ai_claim_action_proposal($1,$2,$3,$4)",
      [f.businessA,f.staffA,staffProposal,"c".repeat(64)],
    ));
  });

  it("rejects cross-tenant approval even from another tenant owner", async () => {
    await asAI(db);
    await expectDbReject(db,() => db.query(
      "select * from public.ai_claim_action_proposal($1,$2,$3,$4)",
      [f.businessB,f.ownerA,proposalB,hashB],
    ));
  });

  it("rejects a proposal hash different from the immutable stored payload hash", async () => {
    await asAI(db);
    await expectDbReject(db,() => db.query(
      "select * from public.ai_claim_action_proposal($1,$2,$3,$4)",
      [f.businessA,f.ownerA,proposalA,"f".repeat(64)],
    ));
  });

  it("expires an old proposal and refuses approval", async () => {
    await db.query(
      "update public.ai_action_proposals set expires_at=now()-interval '1 minute' where id=$1",
      [proposalA],
    );
    await asAI(db);
    await expectDbReject(db,() => db.query(
      "select * from public.ai_claim_action_proposal($1,$2,$3,$4)",
      [f.businessA,f.ownerA,proposalA,hashA],
    ));
  });

  it("cannot execute a rejected proposal", async () => {
    await asAI(db);
    await db.query(
      "select public.ai_reject_action_proposal($1,$2,$3)",
      [f.businessA,f.ownerA,proposalA],
    );
    await expectDbReject(db,() => db.query(
      "select * from public.ai_claim_action_proposal($1,$2,$3,$4)",
      [f.businessA,f.ownerA,proposalA,hashA],
    ));
  });

  it("atomically claims an approved proposal only once", async () => {
    await asAI(db);
    const first=(await db.query<{ proposal_id:string }>(
      "select * from public.ai_claim_action_proposal($1,$2,$3,$4)",
      [f.businessA,f.ownerA,proposalA,hashA],
    )).rows[0];

    expect(first?.proposal_id).toBe(proposalA);
    await expectDbReject(db,() => db.query(
      "select * from public.ai_claim_action_proposal($1,$2,$3,$4)",
      [f.businessA,f.ownerA,proposalA,hashA],
    ));
  });

  it("revalidates execution mode at approval time", async () => {
    await db.query(
      "update public.businesses set execution_mode='production' where id=$1",
      [f.businessA],
    );
    await asAI(db);
    await expectDbReject(db,() => db.query(
      "select * from public.ai_claim_action_proposal($1,$2,$3,$4)",
      [f.businessA,f.ownerA,proposalA,hashA],
    ));
  });

  it("revalidates the active Finance engine at approval time", async () => {
    await db.query(
      "update public.finance_connections set engine='erpnext',credential_key='finance-test',credential_environment='production' where id=$1 and business_id=$2",
      [connectionA,f.businessA],
    );

    await asAI(db);
    await expectDbReject(db,() => db.query(
      "select * from public.ai_claim_action_proposal($1,$2,$3,$4)",
      [f.businessA,f.ownerA,proposalA,hashA],
    ));
  });

  it("counts AI requests server-side per tenant/user window", async () => {
    await asAI(db);
    const first=(await db.query<{ ai_consume_request:number }>(
      "select public.ai_consume_request($1,$2)",
      [f.businessA,f.ownerA],
    )).rows[0]?.ai_consume_request;
    const second=(await db.query<{ ai_consume_request:number }>(
      "select public.ai_consume_request($1,$2)",
      [f.businessA,f.ownerA],
    )).rows[0]?.ai_consume_request;

    expect(Number(second)).toBe(Number(first)+1);
  });

  it("keeps the AI capability role non-login non-inheriting and non-bypass", async () => {
    await db.exec("RESET ROLE");
    const role=(await db.query<{
      rolcanlogin:boolean;
      rolinherit:boolean;
      rolbypassrls:boolean;
      rolsuper:boolean;
    }>(
      "select rolcanlogin,rolinherit,rolbypassrls,rolsuper from pg_roles where rolname='codeedge_ai_api'",
    )).rows[0];

    expect(role).toEqual({
      rolcanlogin:false,
      rolinherit:false,
      rolbypassrls:false,
      rolsuper:false,
    });
  });
});
