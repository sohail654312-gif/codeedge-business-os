import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireDashboardTenant } from "@/server/auth/session";
import { loadFinanceContext } from "@/server/finance/context";
import { getFinanceEngine } from "@/server/finance/registry";
import { financeEngineMetadata } from "@/server/finance/provider-metadata";

const label = (value: string) => value.replaceAll("_", " ");

export default async function ERPNextSettingsPage() {
  const { context } = await requireDashboardTenant();
  const metadata = financeEngineMetadata.erpnext;

  let activeContext: Awaited<ReturnType<typeof loadFinanceContext>> | null = null;
  let credentialsReady = false;

  try {
    activeContext = await loadFinanceContext({
      businessId: context.business.id,
      userId: context.userId,
      correlationId: randomUUID(),
    });

    if (activeContext.engine === "erpnext") {
      getFinanceEngine({
        businessId: context.business.id,
        engine: activeContext.engine,
        credentialKey: activeContext.credentialKey,
      });
      credentialsReady = true;
    }
  } catch {
    activeContext = null;
    credentialsReady = false;
  }

  const active = activeContext?.engine === "erpnext";
  const configured = active && credentialsReady;

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Integration</div>
          <h1>ERPNext</h1>
          <p className="muted">
            Tenant-bound Codeedge Finance Engine adapter status for this workspace only.
          </p>
        </div>
        <span className="pill">{configured ? "Configured" : active ? "Credential unavailable" : "Not active"}</span>
      </div>

      <div className="twoCol">
        <div className="panel">
          <h2>Connection</h2>
          <p className="muted">Workspace: {context.business.name}</p>
          <p className="muted">Execution mode: {context.business.execution_mode}</p>
          <p className="muted">
            Provider environment: {activeContext?.engine === "erpnext"
              ? activeContext.credentialEnvironment ?? "Not set"
              : "Not active"}
          </p>
          <p className="muted">
            Credentials are resolved from the current tenant&apos;s Finance connection and remain server-side.
          </p>
        </div>

        <div className="panel">
          <h2>Implemented ERPNext capability</h2>
          <p className="muted">
            Read: {metadata.capabilities.filter((item) => item !== "health").map(label).join(", ")}.
          </p>
          <p className="muted">
            Write: {metadata.writeCapabilities.map(label).join(", ")} only.
          </p>
          <p className="muted">
            Payments, supplier writes, quotation writes and invoice writes are not advertised until their adapter methods exist.
          </p>
        </div>
      </div>

      <div className="panel topGap">
        <h2>Integration principle</h2>
        <p className="muted">
          Codeedge remains the client-facing product. ERPNext is a replaceable Finance Engine adapter;
          unsupported operations fail closed rather than bypassing Codeedge domain services.
        </p>
        <div className="row">
          <Link className="btn" href="/dashboard/money">Open Money</Link>
          <Link className="btn" href="/dashboard/settings">Back to settings</Link>
        </div>
      </div>
    </>
  );
}
