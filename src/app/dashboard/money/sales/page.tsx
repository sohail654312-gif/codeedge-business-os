import Link from "next/link";
import { randomUUID } from "node:crypto";
import { MoneySalesWriteForms } from "@/components/money/MoneyWriteForms";
import { formatMoney } from "@/modules/money/format";
import { requireDashboardTenant } from "@/server/auth/session";
import { loadFinanceContext } from "@/server/finance/context";
import { getMoneySales } from "@/server/finance/service";

export default async function MoneySalesPage() {
  const { client, context } = await requireDashboardTenant();
  const customerResult = await client
    .from("customers")
    .select("id,contact_name")
    .eq("business_id", context.business.id)
    .order("created_at", { ascending: false });

  let data: Awaited<ReturnType<typeof getMoneySales>> | null = null;
  let financeContext: Awaited<ReturnType<typeof loadFinanceContext>> | null = null;
  try {
    const correlationId = randomUUID();
    financeContext = await loadFinanceContext({
      businessId: context.business.id,
      userId: context.userId,
      correlationId,
    });
    data = await getMoneySales({
      businessId: context.business.id,
      userId: context.userId,
      correlationId,
    });
  } catch {
    data = null;
    financeContext = null;
  }

  const writeEnabled = financeContext?.engine === "demo_finance";
  const writeMessage = !financeContext
    ? "Configure Codeedge Money from Money Overview before creating records."
    : "The active Finance Engine does not expose these V1 writes. Codeedge will not fabricate or bypass an unsupported provider capability.";
  const currency = financeContext?.defaultCurrency ?? "GBP";

  return (
    <>
      <Link className="backLink" href="/dashboard/money">← Money Overview</Link>
      <div className="pageHead">
        <div><div className="eyebrow">Money · Sales</div><h1>Sales</h1>
          <p className="muted">Commercial quotations, invoices and accounting payments.</p></div>
      </div>

      <MoneySalesWriteForms
        customers={(customerResult.data ?? []).map((item) => ({ id: item.id, name: item.contact_name }))}
        quotes={(data?.quotes ?? []).map((item) => ({ id: item.id, label: item.id + " · " + formatMoney(item.total, item.currency) }))}
        invoices={(data?.invoices ?? []).filter((item) => item.outstanding !== "0.00" && item.outstanding !== "0").map((item) => ({ id: item.id, label: item.id + " · outstanding " + formatMoney(item.outstanding, item.currency) }))}
        currency={currency}
        writeEnabled={writeEnabled}
        writeMessage={writeMessage}
      />

      <div className="panel topGap">
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
