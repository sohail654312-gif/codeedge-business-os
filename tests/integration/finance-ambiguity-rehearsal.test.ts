import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asUser, fixtures as f, openDatabase, seedDatabase, type TestDatabase } from "../helpers/database";
import { ensureFinanceCustomer } from "@/server/finance/service";
import { getFinanceEngine } from "@/server/finance/registry";

// Replace only the connection transport with a disposable migrated database.
// The service, engine, HTTP client, SQL functions, policies and network are real.
const transport = vi.hoisted(() => ({ db: null as TestDatabase | null }));
vi.mock("@/server/finance/capability", () => ({
  withFinanceCapability: async (work: (db: TestDatabase) => Promise<unknown>) => {
    const db = transport.db!;
    await db.exec("RESET ROLE; SET LOCAL ROLE codeedge_finance_api");
    try { return await work(db); } finally { await db.exec("RESET ROLE"); }
  },
}));

describe("Finance sandbox network ambiguity rehearsal", () => {
  let server: Server;
  let customerId: string;
  let providerWrites = 0;
  let revealAccepted = false;
  const accepted: Array<{ name: string; customer_name: string }> = [];
  const requestId = "72000000-0000-4000-8000-00000000a008";
  const correlationId = "73000000-0000-4000-8000-00000000a008";
  const originalCredentials = process.env.FINANCE_ERPNEXT_CREDENTIALS_JSON;

  beforeAll(async () => {
    transport.db = await openDatabase();
    await seedDatabase(transport.db);
    await asUser(transport.db, f.ownerA);
    customerId = (await transport.db.query<{ customer_id: string }>(
      "select customer_id from public.convert_lead_to_customer($1)", [f.leadA],
    )).rows[0].customer_id;
    await transport.db.exec("RESET ROLE");
    await transport.db.query("update public.businesses set execution_mode='sandbox' where id=$1", [f.businessA]);
    await transport.db.query(
      `insert into public.finance_connections(business_id,engine,enabled,credential_key,credential_environment,default_currency)
       values ($1,'erpnext',true,'ambiguity_sandbox','sandbox','GBP')`, [f.businessA],
    );
    server = createServer(async (request, response) => {
      if (request.headers.authorization !== "token sandbox-key:sandbox-secret") {
        response.writeHead(401).end(); return;
      }
      if (request.method === "POST" && request.url === "/api/resource/Customer") {
        let body = "";
        for await (const chunk of request) body += chunk;
        const row = JSON.parse(body) as { name: string; customer_name: string };
        accepted.push(row); providerWrites++;
        // The test adapter accepted the write, then dropped the response.
        request.socket.destroy(); return;
      }
      if (request.method === "GET" && request.url?.startsWith("/api/resource/Customer?")) {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ data: revealAccepted ? accepted : [] })); return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("sandbox bind failed");
    process.env.FINANCE_ERPNEXT_CREDENTIALS_JSON = JSON.stringify({ ambiguity_sandbox: {
      businessId: f.businessA, baseUrl: `http://127.0.0.1:${address.port}`,
      apiKey: "sandbox-key", apiSecret: "sandbox-secret", customerGroup: "Test", territory: "Test",
    } });
  });

  afterAll(async () => {
    if (originalCredentials === undefined) delete process.env.FINANCE_ERPNEXT_CREDENTIALS_JSON;
    else process.env.FINANCE_ERPNEXT_CREDENTIALS_JSON = originalCredentials;
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await transport.db?.close();
  });

  it("persists uncertainty, suppresses a duplicate write and exposes tenant-scoped reconciliation", async () => {
    const input = { businessId: f.businessA, userId: f.ownerA, correlationId, crmCustomerId: customerId, requestId };
    await expect(ensureFinanceCustomer(input)).rejects.toThrow("erpnext_outcome_ambiguous");
    expect(providerWrites).toBe(1);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].name).toBe(`CE-CUST-${customerId}`);

    await expect(ensureFinanceCustomer(input)).rejects.toThrow("finance_execution_in_flight");
    expect(providerWrites).toBe(1);
    const db = transport.db!;
    await asUser(db, f.ownerA);
    const queue = (await db.query(
      "select status,error_code,request_id,codeedge_reference from public.finance_execution_records where business_id=$1 and status='ambiguous'", [f.businessA],
    )).rows;
    expect(queue).toEqual([{ status: "ambiguous", error_code: "erpnext_outcome_ambiguous", request_id: requestId, codeedge_reference: customerId }]);
    await db.exec("RESET ROLE");
    await asUser(db, f.ownerB);
    expect((await db.query("select id from public.finance_execution_records where business_id=$1", [f.businessA])).rows).toEqual([]);
    await db.exec("RESET ROLE");

    // Operator read-back confirms acceptance without attempting another write.
    revealAccepted = true;
    const engine = getFinanceEngine({ businessId: f.businessA, engine: "erpnext", credentialKey: "ambiguity_sandbox" });
    const customer = await engine.resolveCustomer!({
      businessId: f.businessA, userId: f.ownerA, engine: "erpnext", executionMode: "sandbox",
      connectionId: null, credentialEnvironment: "sandbox", correlationId, defaultCurrency: "GBP",
    }, customerId);
    expect(customer?.externalRef).toBe(accepted[0].name);
    expect(providerWrites).toBe(1);
    expect((await db.query("select status from public.finance_execution_records where request_id=$1", [requestId])).rows[0].status).toBe("ambiguous");
  });
});
