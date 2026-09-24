import { leads } from "@/data/demo";

const moduleData = {
  "find-me": {
    title: "Find Me",
    subtitle: "Website · Local SEO · Reviews",
    metrics: [["Website", "Online"], ["Visitors", "1,248"], ["Google enquiries", "41"], ["Reviews", "128"]],
    notes: ["Mobile-friendly website is online.", "Emergency plumber visibility improved.", "4 customers are ready for review requests."]
  },
  "contact-me": {
    title: "Contact Me",
    subtitle: "Calls · WhatsApp · AI Voice",
    metrics: [["Calls today", "27"], ["AI handled", "18"], ["Missed calls", "3"], ["Appointments booked", "4"]],
    notes: ["AI Voice Agent: ACTIVE", "2 calls transferred to a human.", "Recent AI call: boiler repair enquiry → qualified → appointment booked."]
  },
  "buy-from-me": {
    title: "Buy From Me",
    subtitle: "Leads · CRM · Quotes",
    metrics: [["New leads", "14"], ["Follow-ups", "6"], ["Quotes open", "8"], ["Pipeline value", "£12,860"]],
    notes: []
  },
  "pay-me": {
    title: "Pay Me",
    subtitle: "Invoices · Payments · Finance",
    metrics: [["Revenue", "£18,420"], ["Outstanding", "£5,280"], ["Overdue", "£1,720"], ["Paid this month", "£13,140"]],
    notes: ["INV-1001 · Sarah Jenkins · £850 · Paid", "INV-1002 · XYZ Ltd · £1,200 · Overdue", "Finance engine is currently a demo adapter surface."]
  },
  "manage-me": {
    title: "Manage Me",
    subtitle: "Team · Tasks · Operations",
    metrics: [["Team members", "4"], ["Tasks today", "7"], ["Due today", "3"], ["Documents", "24"]],
    notes: ["Follow up quotation — Sarah", "Call supplier — James", "Send invoice — David", "Review campaign — Manager"]
  },
  "help-me-grow": {
    title: "Help Me Grow",
    subtitle: "Insights · Marketing · AI",
    metrics: [["Revenue trend", "+12%"], ["Website enquiries", "+18%"], ["Lead conversion", "+6%"], ["Overdue invoices", "-9%"]],
    notes: ["Revenue is growing faster than last month.", "Six quotations worth £8,450 need follow-up.", "Missed-call recovery is the next automation opportunity."]
  }
} as const;

export type ModuleKey = keyof typeof moduleData;

export function ModuleView({ kind }: { kind: ModuleKey }) {
  const data = moduleData[kind];
  return (
    <>
      <div className="pageHead"><div><div className="eyebrow">CodeEdge Business OS</div><h1>{data.title}</h1><p className="muted">{data.subtitle}</p></div><span className="pill">Demo</span></div>
      <div className="statGrid compact">
        {data.metrics.map(([label, value]) => <div className="stat" key={label}><div className="statLabel">{label}</div><div className="statValue">{value}</div></div>)}
      </div>

      {kind === "buy-from-me" ? (
        <div className="panel topGap">
          <h2>CRM pipeline</h2>
          <div className="kanban">
            {["New", "Contacted", "Qualified", "Quote sent"].map((stage) => <div className="kanbanCol" key={stage}><b>{stage}</b>{leads.filter((l) => l.status === stage).map((lead) => <div className="lead" key={lead.name}><b>{lead.name}</b><div className="muted">{lead.service}</div><div className="rowBetween"><span>{lead.source}</span><span>{lead.value}</span></div></div>)}</div>)}
          </div>
        </div>
      ) : (
        <div className="panel topGap">
          <h2>Current activity</h2>
          <div className="attention">
            {data.notes.map((n) => <div className="alert" key={n}><span>→</span><div>{n}</div></div>)}
          </div>
        </div>
      )}
    </>
  );
}
