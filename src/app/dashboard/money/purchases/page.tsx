import Link from "next/link";
import { randomUUID } from "node:crypto";
import { MoneyPurchaseWriteForms } from "@/components/money/MoneyWriteForms";
import { formatMoney } from "@/modules/money/format";
import { requireDashboardTenant } from "@/server/auth/session";
import { loadFinanceContext } from "@/server/finance/context";
import { getMoneyPurchases } from "@/server/finance/service";

export default async function MoneyPurchasesPage() {
  const { context } = await requireDashboardTenant();
  let data: Awaited<ReturnType<typeof getMoneyPurchases>> | null = null;
  let financeContext: Awaited<ReturnType<typeof loadFinanceContext>> | null = null;
  try {
    const correlationId = randomUUID();
    financeContext = await loadFinanceContext({
      businessId: context.business.id,
      userId: context.userId,
      correlationId,
    });
    data = await getMoneyPurchases({
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
        <div><div className="eyebrow">Money · Purchases</div><h1>Purchases</h1>
          <p className="muted">Suppliers, bills and operating expenses.</p></div>
      </div>

      <MoneyPurchaseWriteForms
        suppliers={(data?.suppliers ?? []).map((item) => ({ id: item.id, name: item.name }))}
        currency={currency}
        writeEnabled={writeEnabled}
        writeMessage={writeMessage}
      />

      <div className="panel topGap">
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
