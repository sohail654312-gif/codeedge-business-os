import Link from "next/link";
import { randomUUID } from "node:crypto";
import { DemoMoneySetupForm } from "@/components/money/DemoMoneySetupForm";
import { formatMoney } from "@/modules/money/format";
import {
  formatFinanceExecutionTime,
  listAmbiguousFinanceExecutions,
} from "@/modules/money/reconciliation";
import { requireDashboardTenant } from "@/server/auth/session";
import { loadFinanceContext } from "@/server/finance/context";
import {
  getFinanceStatus,
  getMoneyOverview,
} from "@/server/finance/service";

const sections = [
  ["Sales","Quotes, invoices and payments","/dashboard/money/sales"],
  ["Purchases","Suppliers, bills and expenses","/dashboard/money/purchases"],
  ["Accounting","Chart of Accounts, ledger and trial balance","/dashboard/money/accounting"],
  ["Reports","Profit & Loss, Balance Sheet and Cash Flow","/dashboard/money/reports"],
  ["AI Accountant","Grounded finance questions and human-approved actions","/dashboard/money/ai-accountant"],
];

export default async function MoneyPage() {
  const { client, context } = await requireDashboardTenant();
  const correlationId = randomUUID();

  let financeContext: Awaited<ReturnType<typeof loadFinanceContext>> | null = null;
  let overview: Awaited<ReturnType<typeof getMoneyOverview>> | null = null;
  let statusMessage = "Finance connection not configured.";
  let reconciliationQueue: Awaited<ReturnType<typeof listAmbiguousFinanceExecutions>> = [];
  let reconciliationAvailable = true;

  try {
    reconciliationQueue = await listAmbiguousFinanceExecutions(
      client,
      context.business.id,
    );
  } catch {
    reconciliationAvailable = false;
  }

  try {
    financeContext = await loadFinanceContext({
      businessId:context.business.id,
      userId:context.userId,
      correlationId,
    });
    const status = await getFinanceStatus({
      businessId:context.business.id,
      userId:context.userId,
      correlationId,
    });
    statusMessage = status.message;
    try {
      overview = await getMoneyOverview({
        businessId:context.business.id,
        userId:context.userId,
        correlationId,
      });
    } catch {
      overview = null;
    }
  } catch {
    financeContext = null;
  }

  const currency = financeContext?.defaultCurrency ?? "GBP";

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Codeedge Money</div>
          <h1>Money Overview</h1>
          <p className="muted">
            Codeedge-owned finance experience with replaceable Finance Engines.
          </p>
        </div>
        <span className="pill">{context.business.execution_mode} workspace</span>
      </div>

      <section className="panel">
        <h2>Finance status</h2>
        <p className="muted">{statusMessage}</p>
        <p className="muted">
          Currency: {financeContext?.defaultCurrency ?? "Not configured"} ·
          Engine capability data is shown only when available.
        </p>
      </section>

      {overview ? (
        <div className="statGrid topGap">
          <div className="stat">
            <div className="statLabel">Receivables</div>
            <div className="statValue">{formatMoney(overview.receivables,overview.currency)}</div>
          </div>
          <div className="stat">
            <div className="statLabel">Overdue</div>
            <div className="statValue">{formatMoney(overview.overdueReceivables,overview.currency)}</div>
          </div>
          <div className="stat">
            <div className="statLabel">Payables</div>
            <div className="statValue">{formatMoney(overview.payables,overview.currency)}</div>
          </div>
          <div className="stat">
            <div className="statLabel">Expenses</div>
            <div className="statValue">{formatMoney(overview.expenses,overview.currency)}</div>
          </div>
        </div>
      ) : (
        <section className="panel topGap">
          <h2>Overview capability</h2>
          <p className="muted">
            The active Finance Engine does not currently expose normalized dashboard metrics,
            or no Finance connection is configured yet.
          </p>
        </section>
      )}

      <section className="panel topGap">
        <div className="pageHead">
          <div>
            <div className="eyebrow">Operational safety</div>
            <h2>Finance reconciliation queue</h2>
          </div>
          <span className="pill">
            {reconciliationAvailable ? reconciliationQueue.length : "Unavailable"}
          </span>
        </div>
        {!reconciliationAvailable ? (
          <p className="muted">
            Reconciliation status could not be loaded. Do not retry an uncertain
            provider write until the Finance execution record can be reviewed.
          </p>
        ) : reconciliationQueue.length === 0 ? (
          <p className="muted">
            No ambiguous Finance writes require reconciliation.
          </p>
        ) : (
          <>
            <p className="muted">
              These writes have an uncertain provider outcome. Verify the provider
              record manually before any follow-up action. Codeedge does not
              automatically retry ambiguous writes.
            </p>
            <div className="topGap">
              {reconciliationQueue.map((item) => (
                <div className="panel" key={item.id}>
                  <b>{item.operation}</b>
                  <p className="muted">
                    Engine: {item.engine} · Document: {item.document_type || "—"} ·
                    Created: {formatFinanceExecutionTime(item.created_at)}
                  </p>
                  <p className="muted">
                    Codeedge ref: {item.codeedge_reference || "—"} · External ref:
                    {item.external_reference || "—"}
                  </p>
                  <p className="muted">
                    Request ID: {item.request_id} · Error: {item.error_code || "Unspecified"}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="moduleTiles topGap">
        {sections.map(([title,description,href]) => (
          <Link className="moduleTile" href={href} key={href}>
            <b>{title}</b><span className="muted">{description}</span>
          </Link>
        ))}
      </div>

      {context.business.execution_mode === "demo" ? (
        <div className="topGap">
          <DemoMoneySetupForm
            configured={financeContext?.engine === "demo_finance"}
            currency={currency}
            owner={context.role === "owner"}
          />
        </div>
      ) : null}
    </>
  );
}
