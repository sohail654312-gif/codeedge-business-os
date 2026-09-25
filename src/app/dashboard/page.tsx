import { stats } from "@/data/demo";
import { getCustomerDirectoryData } from "@/modules/buy-from-me/customers/data";
import { requireDashboardTenant } from "@/server/auth/session";

const modules = [
  ["Find Me", "Website, SEO and reviews", "/dashboard/find-me"],
  ["Contact Me", "Calls, WhatsApp and AI Voice", "/dashboard/contact-me"],
  ["Buy From Me", "Leads, CRM and quotes", "/dashboard/buy-from-me"],
  ["Money", "Sales, purchases, accounting and reports", "/dashboard/money"],
  ["Manage Me", "Team, tasks and operations", "/dashboard/manage-me"],
  ["Help Me Grow", "Insights, marketing and AI", "/dashboard/help-me-grow"]
];

export default async function Dashboard() {
  const { client, context } = await requireDashboardTenant();
  const customerDirectory = await getCustomerDirectoryData(client, context.business.id);
  const activeCustomers = customerDirectory.rows.filter((customer) => customer.status === "Active").length;
  const customerPreview = customerDirectory.rows.slice(0, 3);

  return (
    <>
      <div className="pageHead">
        <div><div className="eyebrow">{context.business.name}</div><h1>Command Centre</h1>
        <p className="muted">Here is what needs your attention today.</p></div>
        <span className="pill">Demo workspace</span>
      </div>

      <div className="statGrid">
        {stats.map((s) => <div className="stat" key={s.label}>
          <div className="statLabel">{s.label}</div>
          <div className={"statValue " + s.tone}>{s.value}</div>
        </div>)}
      </div>

      <div className="dashboardGrid">
        <div className="panel">
          <h2>What needs attention</h2>
          <div className="attention">
            <div className="alert"><span>⚠</span><div><b>6 quotations need follow-up.</b><div className="muted">Potential value £8,450.</div></div></div>
            <div className="alert"><span>⚠</span><div><b>£1,720 is overdue.</b><div className="muted">3 invoices require attention.</div></div></div>
            <div className="alert"><span>✓</span><div><b>Google enquiries increased 18%.</b><div className="muted">Local visibility is improving.</div></div></div>
            <div className="alert"><span>☎</span><div><b>AI Voice booked 2 appointments.</b><div className="muted">18 calls handled today.</div></div></div>
          </div>
        </div>
        <div className="panel">
          <h2>CodeEdge AI</h2>
          <p className="muted">A future intelligence layer will combine growth, communication, sales, finance and operations data.</p>
          <div className="insight">“You have strong enquiry growth, but six open quotations are now the highest-priority revenue opportunity.”</div>
        </div>
      </div>

      <div className="panel topGap">
        <div className="customerSummaryHead">
          <div>
            <div className="row customerSummaryTitleRow">
              <h2>Customer snapshot</h2>
              <span className="pill">{customerDirectory.mode === "hybrid" ? "CodeEdge + ERPNext" : customerDirectory.mode === "erpnext" ? "ERPNext live" : "CodeEdge CRM"}</span>
            </div>
            <p className="muted customerSubtext">A quick view of customers directly on the Command Centre.</p>
          </div>
          <a className="btn" href="/dashboard/buy-from-me/customers">View customers</a>
        </div>

        <div className="customerSummaryGrid">
          <div className="stat">
            <div className="statLabel">Total customers</div>
            <div className="statValue">{customerDirectory.rows.length}</div>
          </div>
          <div className="stat">
            <div className="statLabel">Active customers</div>
            <div className="statValue">{activeCustomers}</div>
          </div>
          <div className="customerMiniList">
            {customerPreview.length > 0 ? customerPreview.map((customer) => (
              <div className="customerMiniRow" key={`${customer.name}-${customer.source}`}>
                <div>
                  <b>{customer.name}</b>
                  <div className="muted">{customer.company}</div>
                </div>
                <span className="pill">{customer.source}</span>
              </div>
            )) : (
              <div className="muted">No customer records are available yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="panel topGap">
        <h2>My CodeEdge</h2>
        <div className="moduleTiles">
          {modules.map(([title, desc, href]) => <a className="moduleTile" href={href} key={title}><b>{title}</b><span className="muted">{desc}</span></a>)}
        </div>
      </div>
    </>
  );
}
