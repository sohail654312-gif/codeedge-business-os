import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireDashboardTenant } from "@/server/auth/session";
import { loadFinanceContext } from "@/server/finance/context";
import { financeEngineMetadata } from "@/server/finance/provider-metadata";
export default async function FinanceSettingsPage() {
  const { context } = await requireDashboardTenant();
  let finance: Awaited<ReturnType<typeof loadFinanceContext>> | null = null;
  try { finance = await loadFinanceContext({businessId:context.business.id,userId:context.userId,correlationId:randomUUID()}); }
  catch { /* Fail closed; do not expose configuration errors or credentials. */ }
  const metadata = finance ? financeEngineMetadata[finance.engine] : null;
  return <>
    <div className="pageHead"><div><div className="eyebrow">Workspace integration</div><h1>Finance settings</h1>
      <p className="muted">Finance engines are replaceable. Codeedge CRM owns Customer identity.</p></div></div>
    <section className="panel"><h2>{context.business.name}</h2>
      <p>Workspace mode: {context.business.execution_mode}</p>
      <p>Active engine: {metadata?.id ?? "Unavailable or not configured"}</p>
      <p>Credential environment: {finance?.credentialEnvironment ?? "No external credentials available"}</p>
      <p className="muted">Credentials stay server-side. Provider health is checked in Codeedge Money before use.</p>
      {metadata ? <><p>Supported reads: {metadata.capabilities.join(", ")}</p>
        <p>Supported writes: {metadata.writeCapabilities.join(", ")}</p></> : null}
      <p>Unsupported operations fail closed. ERPNext supplier, quotation and invoice listing does not enable their creation.</p>
      <Link className="btn" href="/dashboard/money">Open Codeedge Money</Link>
    </section>
  </>;
}
