import Link from "next/link";
import { randomUUID } from "node:crypto";
import { formatMoney } from "@/modules/money/format";
import { requireDashboardTenant } from "@/server/auth/session";
import { getMoneyPurchases } from "@/server/finance/service";

export default async function MoneyPurchasesPage() {
  const { context } = await requireDashboardTenant();
  let data: Awaited<ReturnType<typeof getMoneyPurchases>> | null = null;
  try {
    data = await getMoneyPurchases({
      businessId:context.business.id,userId:context.userId,correlationId:randomUUID(),
    });
  } catch {
    data = null;
  }

  return (
    <>
      <Link className="backLink" href="/dashboard/money">← Money Overview</Link>
      <div className="pageHead">
        <div><div className="eyebrow">Money · Purchases</div><h1>Purchases</h1>
          <p className="muted">Suppliers, bills and operating expenses.</p></div>
      </div>

      <div className="panel">
        <h2>Suppliers</h2>
        {data?.suppliers ? data.suppliers.map((item) => (
          <div className="customerMiniRow" key={item.id}>
            <div><b>{item.name}</b><div className="muted">{item.email || item.phone || "Supplier"}</div></div>
          </div>
        )) : <p className="muted">Suppliers are unavailable from the active engine.</p>}
      </div>

      <div className="panel topGap">
        <h2>Bills</h2>
        {data?.bills ? data.bills.map((item) => (
          <div className="customerMiniRow" key={item.id}>
            <div><b>{item.id}</b><div className="muted">{item.status} · outstanding {formatMoney(item.outstanding,item.currency)}</div></div>
            <span>{formatMoney(item.total,item.currency)}</span>
          </div>
        )) : <p className="muted">Bills are unavailable from the active engine.</p>}
      </div>

      <div className="panel topGap">
        <h2>Expenses</h2>
        {data?.expenses ? data.expenses.map((item) => (
          <div className="customerMiniRow" key={item.id}>
            <div><b>{item.category}</b><div className="muted">{new Date(item.incurredAt).toLocaleDateString()}</div></div>
            <span>{formatMoney(item.amount,item.currency)}</span>
          </div>
        )) : <p className="muted">Expenses are unavailable from the active engine.</p>}
      </div>
    </>
  );
}
