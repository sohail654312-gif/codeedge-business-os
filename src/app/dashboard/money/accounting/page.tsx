import Link from "next/link";
import { randomUUID } from "node:crypto";
import { formatMoney } from "@/modules/money/format";
import { requireDashboardTenant } from "@/server/auth/session";
import { getFinanceAccountingViews } from "@/server/finance/service";

export default async function MoneyAccountingPage() {
  const { context } = await requireDashboardTenant();
  let data: Awaited<ReturnType<typeof getFinanceAccountingViews>> | null = null;
  try {
    data = await getFinanceAccountingViews({
      businessId:context.business.id,userId:context.userId,correlationId:randomUUID(),
    });
  } catch {
    data = null;
  }

  return (
    <>
      <Link className="backLink" href="/dashboard/money">← Money Overview</Link>
      <div className="pageHead">
        <div><div className="eyebrow">Money · Accounting</div><h1>Accounting</h1>
          <p className="muted">Read-only engine-neutral accounting views.</p></div>
      </div>

      <div className="panel">
        <h2>Chart of Accounts</h2>
        {data?.accounts ? data.accounts.map((row) => (
          <div className="customerMiniRow" key={row.code}>
            <div><b>{row.code} · {row.name}</b><div className="muted">{row.type}</div></div>
            <span>{row.currency ?? "—"}</span>
          </div>
        )) : <p className="muted">Chart of Accounts is unavailable from the active engine.</p>}
      </div>

      <div className="panel topGap">
        <h2>General Ledger</h2>
        {data?.ledger ? data.ledger.slice(-30).map((row,index) => (
          <div className="customerMiniRow" key={`${row.reference}-${row.accountCode}-${index}`}>
            <div><b>{row.accountCode} · {row.accountName}</b><div className="muted">{row.reference}</div></div>
            <span>D {formatMoney(row.debit,row.currency)} · C {formatMoney(row.credit,row.currency)}</span>
          </div>
        )) : <p className="muted">General Ledger is unavailable from the active engine.</p>}
      </div>

      <div className="panel topGap">
        <h2>Trial Balance</h2>
        {data?.trialBalance ? data.trialBalance.map((row) => (
          <div className="customerMiniRow" key={row.accountCode}>
            <div><b>{row.accountCode} · {row.accountName}</b></div>
            <span>D {formatMoney(row.debit,row.currency)} · C {formatMoney(row.credit,row.currency)}</span>
          </div>
        )) : <p className="muted">Trial Balance is unavailable from the active engine.</p>}
      </div>
    </>
  );
}
