import { stats } from "@/data/demo";

const modules = [
  ["Find Me", "Website, SEO and reviews", "/dashboard/find-me"],
  ["Contact Me", "Calls, WhatsApp and AI Voice", "/dashboard/contact-me"],
  ["Buy From Me", "Leads, CRM and quotes", "/dashboard/buy-from-me"],
  ["Pay Me", "Invoices, payments and finance", "/dashboard/pay-me"],
  ["Manage Me", "Team, tasks and operations", "/dashboard/manage-me"],
  ["Help Me Grow", "Insights, marketing and AI", "/dashboard/help-me-grow"]
];

export default function Dashboard() {
  return (
    <>
      <div className="pageHead">
        <div><div className="eyebrow">ABC Plumbing & Heating Ltd</div><h1>Good morning, James.</h1>
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
        <h2>My CodeEdge</h2>
        <div className="moduleTiles">
          {modules.map(([title, desc, href]) => <a className="moduleTile" href={href} key={title}><b>{title}</b><span className="muted">{desc}</span></a>)}
        </div>
      </div>
    </>
  );
}
