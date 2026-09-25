import Link from "next/link";
import { randomUUID } from "node:crypto";
import { formatMoney } from "@/modules/money/format";
import { requireDashboardTenant } from "@/server/auth/session";
import { getMoneySales } from "@/server/finance/service";

export default async function MoneySalesPage() {
  const { context } = await requireDashboardTenant();
  let data: Awaited<ReturnType<typeof getMoneySales>> | null = null;
  try {
    data = await getMoneySales({
      businessId:context.business.id,userId:context.userId,correlationId:randomUUID(),
    });
  } catch {
    data = null;
  }

  return (
    <>
      <Link className="backLink" href="/dashboard/money">← Money Overview</Link>
      <div className="pageHead">
        <div><div className="eyebrow">Money · Sales</div><h1>Sales</h1>
          <p className="muted">Commercial quotations, invoices and accounting payments.</p></div>
      </div>

      <div className="panel">
        <h2>Quotes</h2>
        {data?.quotes ? data.quotes.map((item) => (
          <div className="customerMiniRow" key={item.id}>
            <div><b>{item.id}</b><div className="muted">{item.status}</div></div>
            <span>{formatMoney(item.total,item.currency)}</span>
          </div>
        )) : <p className="muted">Quotes are unavailable from the active engine.</p>}
      </div>

      <div className="panel topGap">
        <h2>Invoices</h2>
        {data?.invoices ? data.invoices.map((item) => (
          <div className="customerMiniRow" key={item.id}>
            <div><b>{item.id}</b><div className="muted">{item.status} · outstanding {formatMoney(item.outstanding,item.currency)}</div></div>
            <span>{formatMoney(item.total,item.currency)}</span>
          </div>
        )) : <p className="muted">Invoices are unavailable from the active engine.</p>}
      </div>

      <div className="panel topGap">
        <h2>Payments</h2>
        {data?.payments ? data.payments.map((item) => (
          <div className="customerMiniRow" key={item.id}>
            <div><b>{item.id}</b><div className="muted">{item.status}</div></div>
            <span>{formatMoney(item.amount,item.currency)}</span>
          </div>
        )) : <p className="muted">Payment records are unavailable from the active engine.</p>}
      </div>
    </>
  );
}
