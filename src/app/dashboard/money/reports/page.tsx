import Link from "next/link";
import { randomUUID } from "node:crypto";
import { formatMoney } from "@/modules/money/format";
import { requireDashboardTenant } from "@/server/auth/session";
import { getFinanceReports } from "@/server/finance/service";

function ReportBlock({
  title,
  report,
}: {
  title: string;
  report: Awaited<ReturnType<typeof getFinanceReports>>["profitAndLoss"];
}) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      {report ? (
        <>
          {report.lines.map((line) => (
            <div className="customerMiniRow" key={line.key}>
              <b>{line.label}</b><span>{formatMoney(line.amount,line.currency)}</span>
            </div>
          ))}
          <div className="customerMiniRow">
            <b>Total</b><strong>{formatMoney(report.total,report.currency)}</strong>
          </div>
        </>
      ) : <p className="muted">This report is unavailable from the active engine.</p>}
    </div>
  );
}

export default async function MoneyReportsPage() {
  const { context } = await requireDashboardTenant();
  let reports: Awaited<ReturnType<typeof getFinanceReports>> | null = null;
  try {
    reports = await getFinanceReports({
      businessId:context.business.id,userId:context.userId,correlationId:randomUUID(),
    });
  } catch {
    reports = null;
  }

  return (
    <>
      <Link className="backLink" href="/dashboard/money">← Money Overview</Link>
      <div className="pageHead">
        <div><div className="eyebrow">Money · Reports</div><h1>Financial Reports</h1>
          <p className="muted">Normalized results supplied by the active Finance Engine.</p></div>
      </div>
      <div className="dashboardGrid">
        <ReportBlock title="Profit & Loss" report={reports?.profitAndLoss ?? null} />
        <ReportBlock title="Balance Sheet" report={reports?.balanceSheet ?? null} />
      </div>
      <div className="topGap">
        <ReportBlock title="Cash Flow" report={reports?.cashFlow ?? null} />
      </div>
    </>
  );
}
