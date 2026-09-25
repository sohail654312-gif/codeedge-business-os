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

const connectionA = "71000000-0000-4000-8000-000000000001";
const connectionB = "71000000-0000-4000-8000-000000000002";
const requestA = "72000000-0000-4000-8000-000000000001";
const correlationA = "73000000-0000-4000-8000-000000000001";

async function asFinanceApi(db: TestDatabase) {
  await db.exec("RESET ROLE; SET LOCAL ROLE codeedge_finance_api");
}

async function expectDbReject(
  db: TestDatabase,
  work: () => Promise<unknown>,
) {
  await db.exec("SAVEPOINT expected_finance_failure");
  try {
    await expect(work()).rejects.toThrow();
  } finally {
    await db.exec(
      "ROLLBACK TO SAVEPOINT expected_finance_failure; RELEASE SAVEPOINT expected_finance_failure",
    );
  }
}

describe("Codeedge Money tenant and execution safety", () => {
  let db: TestDatabase;
  let customerA = "";
  let customerB = "";

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);

    await asUser(db,f.ownerA);
    customerA = (await db.query<{ customer_id: string }>(
      "select customer_id from public.convert_lead_to_customer($1)",
      [f.leadA],
    )).rows[0]!.customer_id;

    await db.exec("RESET ROLE");
    await asUser(db,f.ownerB);
    customerB = (await db.query<{ customer_id: string }>(
      "select customer_id from public.convert_lead_to_customer($1)",
      [f.leadB],
    )).rows[0]!.customer_id;

    await db.exec("RESET ROLE");
    await db.query(
      `insert into public.finance_connections(
        id,business_id,engine,enabled,default_currency
      ) values
        ($1,$2,'demo_finance',true,'GBP'),
        ($3,$4,'demo_finance',true,'PKR')`,
      [connectionA,f.businessA,connectionB,f.businessB],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT finance_case");
  });

  afterEach(async () => {
    await db.exec("RESET ROLE");
    await db.exec(
      "ROLLBACK TO SAVEPOINT finance_case; RELEASE SAVEPOINT finance_case",
    );
  });

  it("lets Tenant A read only Tenant A Finance connection", async () => {
    await asUser(db,f.ownerA);
    const rows = (await db.query<{ id:string;business_id:string }>(
      "select id,business_id from public.finance_connections order by id",
    )).rows;

    expect(rows).toEqual([{ id:connectionA,business_id:f.businessA }]);
  });

  it("does not let staff create or switch Finance engines", async () => {
    await asUser(db,f.staffA);
    await expectDbReject(db, () => db.query(
      `insert into public.finance_connections(
        business_id,engine,enabled,default_currency
      ) values ($1,'demo_finance',false,'USD')`,
      [f.businessA],
    ));
  });

  it("keeps Demo engine internal documents inaccessible to browser roles", async () => {
    await asFinanceApi(db);
    await db.query(
      `select public.finance_demo_upsert_document(
        $1,'customer',$2,$3,null,'Customer A','','','active','GBP',
        0::numeric,0::numeric,'',null,null,null
      )`,
      [f.businessA,requestA,customerA],
    );

    await asUser(db,f.ownerA);
    await expectDbReject(db, () => db.query(
      "select * from public.demo_finance_documents where business_id=$1",
      [f.businessA],
    ));
  });

  it("rejects a forged cross-tenant CRM Customer mapping", async () => {
    await asFinanceApi(db);
    await expectDbReject(db, () => db.query(
      "select public.finance_upsert_customer_mapping($1,$2,$3,'demo_finance',$4)",
      [f.businessA,connectionA,customerB,"demo:forged"],
    ));
  });

  it("prepares the same financial request only once", async () => {
    await asFinanceApi(db);

    const first = (await db.query<{
      execution_id:string;
      created:boolean;
      status:string;
    }>(
      "select * from public.finance_prepare_execution($1,$2,$3,$4,$5,$6,$7)",
      [
        f.businessA,f.ownerA,"finance.quote.create","quote",customerA,
        correlationA,requestA,
      ],
    )).rows[0];

    const retry = (await db.query<{
      execution_id:string;
      created:boolean;
      status:string;
    }>(
      "select * from public.finance_prepare_execution($1,$2,$3,$4,$5,$6,$7)",
      [
        f.businessA,f.ownerA,"finance.quote.create","quote",customerA,
        correlationA,requestA,
      ],
    )).rows[0];

    expect(first?.created).toBe(true);
    expect(retry?.created).toBe(false);
    expect(retry?.execution_id).toBe(first?.execution_id);
    expect(retry?.status).toBe("prepared");
  });

  it("emits a stable Finance Automation event after a simulated successful write", async () => {
    await asFinanceApi(db);
    const execution = (await db.query<{ execution_id:string }>(
      "select execution_id from public.finance_prepare_execution($1,$2,$3,$4,$5,$6,$7)",
      [
        f.businessA,f.ownerA,"finance.quote.create","quote",customerA,
        correlationA,requestA,
      ],
    )).rows[0];

    await db.query(
      "select public.finance_complete_execution($1,'simulated',$2,null)",
      [execution?.execution_id,"demo:quote-1"],
    );

    await db.exec("RESET ROLE");
    const event = (await db.query<{
      business_id:string;
      event_type:string;
      correlation_id:string;
      payload:Record<string,unknown>;
    }>(
      `select business_id,event_type,correlation_id,payload
       from public.automation_domain_events
       where business_id=$1 and event_type='finance.quote.created'
       limit 1`,
      [f.businessA],
    )).rows[0];

    expect(event).toMatchObject({
      business_id:f.businessA,
      event_type:"finance.quote.created",
      correlation_id:correlationA,
    });
  });

  it("blocks Demo Finance when the workspace is not in Demo mode", async () => {
    await db.query(
      "update public.businesses set execution_mode='production' where id=$1",
      [f.businessA],
    );
    await asFinanceApi(db);

    await expectDbReject(db, () => db.query(
      "select public.finance_demo_assert_business($1)",
      [f.businessA],
    ));
  });

  it("keeps the Finance capability role non-login, non-inheriting and non-bypass", async () => {
    const role = (await db.query<{
      rolcanlogin:boolean;
      rolinherit:boolean;
      rolbypassrls:boolean;
      rolsuper:boolean;
    }>(
      `select rolcanlogin,rolinherit,rolbypassrls,rolsuper
       from pg_roles where rolname='codeedge_finance_api'`,
    )).rows[0];

    expect(role).toEqual({
      rolcanlogin:false,
      rolinherit:false,
      rolbypassrls:false,
      rolsuper:false,
    });
  });
});
