import { randomUUID } from "node:crypto";
import { getCustomerDirectoryData } from "@/modules/buy-from-me/customers/data";
import { formatMoney } from "@/modules/money/format";
import { requireDashboardTenant } from "@/server/auth/session";
import { getMoneyOverview } from "@/server/finance/service";

const modules = [
  ["Find Me", "Website, SEO and reviews", "/dashboard/find-me"],
  ["Contact Me", "Calls, WhatsApp and AI Voice", "/dashboard/contact-me"],
  ["Buy From Me", "Leads, CRM and quotes", "/dashboard/buy-from-me"],
  ["Bookings", "Appointments and availability", "/dashboard/bookings"],
  ["Automations", "Triggers, actions and run history", "/dashboard/automations"],
  ["Money", "Sales, purchases, accounting and reports", "/dashboard/money"],
];

export default async function Dashboard() {
  const { client, context } = await requireDashboardTenant();
  const now = new Date().toISOString();

  const [customerDirectory, leadResult, bookingResult, conversationResult, automationResult] = await Promise.all([
    getCustomerDirectoryData(client, context.business.id),
    client.from("leads").select("id", { count: "exact", head: true })
      .eq("business_id", context.business.id).eq("status", "new"),
    client.from("appointments").select("id", { count: "exact", head: true })
      .eq("business_id", context.business.id).gte("starts_at", now)
      .in("status", ["pending", "confirmed"]),
    client.from("conversations").select("id", { count: "exact", head: true })
      .eq("business_id", context.business.id).in("status", ["open", "pending"]),
    client.from("automation_runs").select("id", { count: "exact", head: true })
      .eq("business_id", context.business.id).in("status", ["pending", "failed"]),
  ]);

  let money: Awaited<ReturnType<typeof getMoneyOverview>> | null = null;
  try {
    money = await getMoneyOverview({
      businessId: context.business.id,
      userId: context.userId,
      correlationId: randomUUID(),
    });
  } catch {
    money = null;
  }

  const newLeads = leadResult.error ? null : leadResult.count ?? 0;
  const upcomingBookings = bookingResult.error ? null : bookingResult.count ?? 0;
  const inboxAttention = conversationResult.error ? null : conversationResult.count ?? 0;
  const automationAttention = automationResult.error ? null : automationResult.count ?? 0;
  const activeCustomers = customerDirectory.rows.filter((customer) => customer.status === "Active").length;
  const customerPreview = customerDirectory.rows.slice(0, 3);

  const stats = [
    ["New leads", newLeads],
    ["Upcoming bookings", upcomingBookings],
    ["Inbox open/pending", inboxAttention],
    ["Automation queued/failed", automationAttention],
  ] as const;

  const attention = [
    automationAttention && automationAttention > 0
      ? { icon: "⚡", title: automationAttention + " Automation run" + (automationAttention === 1 ? "" : "s") + " are queued or failed.", detail: "Inspect current run status in Automations." }
      : null,
    inboxAttention && inboxAttention > 0
      ? { icon: "☎", title: inboxAttention + " conversation" + (inboxAttention === 1 ? "" : "s") + " are open or pending.", detail: "Review the Shared Inbox for follow-up." }
      : null,
    newLeads && newLeads > 0
      ? { icon: "↗", title: newLeads + " new lead" + (newLeads === 1 ? "" : "s") + " are in CRM.", detail: "Qualify or follow up from Buy From Me." }
      : null,
    money && money.overdueReceivables !== "0" && money.overdueReceivables !== "0.00"
      ? { icon: "£", title: formatMoney(money.overdueReceivables, money.currency) + " is overdue.", detail: "Review Codeedge Money for invoice details." }
      : null,
  ].filter((item): item is { icon: string; title: string; detail: string } => Boolean(item));

  return (
    <>
      <div className="pageHead">
        <div><div className="eyebrow">{context.business.name}</div><h1>Command Centre</h1>
        <p className="muted">Live operational values from this Codeedge workspace.</p></div>
        <span className="pill">{context.business.execution_mode} workspace</span>
      </div>

      <div className="statGrid">
        {stats.map(([label, value]) => (
          <div className="stat" key={label}>
            <div className="statLabel">{label}</div>
            <div className="statValue">{value === null ? "—" : value}</div>
          </div>
        ))}
      </div>

      <div className="dashboardGrid">
        <div className="panel">
          <h2>What needs attention</h2>
          <div className="attention">
            {attention.length > 0 ? attention.map((item) => (
              <div className="alert" key={item.title}>
                <span>{item.icon}</span>
                <div><b>{item.title}</b><div className="muted">{item.detail}</div></div>
              </div>
            )) : (
              <div className="alert"><span>✓</span><div><b>No urgent items from current Codeedge data.</b><div className="muted">This summary does not invent growth or revenue metrics.</div></div></div>
            )}
          </div>
        </div>
        <div className="panel">
          <h2>Operational view</h2>
          <p className="muted">Command Centre values are derived from CRM, Bookings, Shared Inbox, Automation and Money rather than placeholder statistics.</p>
          <div className="insight">
            {money
              ? "Money receivables: " + formatMoney(money.receivables, money.currency) + ". Active customers: " + activeCustomers + "."
              : "Active customers: " + activeCustomers + ". Money metrics will appear when the active Finance Engine exposes the dashboard capability."}
          </div>
        </div>
      </div>

      <div className="panel topGap">
        <div className="customerSummaryHead">
          <div>
            <div className="row customerSummaryTitleRow">
              <h2>Customer snapshot</h2>
              <span className="pill">{customerDirectory.mode === "hybrid" ? "Codeedge + ERPNext" : customerDirectory.mode === "erpnext" ? "ERPNext live" : "Codeedge CRM"}</span>
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
              <div className="customerMiniRow" key={customer.name + "-" + customer.source}>
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
        <h2>My Codeedge</h2>
        <div className="moduleTiles">
          {modules.map(([title, desc, href]) => <a className="moduleTile" href={href} key={title}><b>{title}</b><span className="muted">{desc}</span></a>)}
        </div>
      </div>
    </>
  );
}
