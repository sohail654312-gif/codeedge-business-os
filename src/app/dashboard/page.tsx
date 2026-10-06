import { Suspense } from "react";
import Link from "next/link";
import { formatLeadDate, formatLeadValue } from "@/modules/buy-from-me/leads/data";
import { leadSourceLabels, leadStatusLabels } from "@/modules/buy-from-me/leads/domain";
import { requireDashboardTenant } from "@/server/auth/session";
import { DashboardLeadActivity } from "@/components/DashboardLeadActivity";

const pipelineOrder = ["new", "contacted", "qualified", "won", "lost"] as const;

const pipelineTitles: Record<(typeof pipelineOrder)[number], string> = {
  new: "New Leads",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Closed Won",
  lost: "Lost",
};

const pipelineClass: Record<(typeof pipelineOrder)[number], string> = {
  new: "ceStageNew",
  contacted: "ceStageContacted",
  qualified: "ceStageQualified",
  won: "ceStageWon",
  lost: "ceStageLost",
};

export default async function Dashboard() {
  const { client, context } = await requireDashboardTenant();
  const now = new Date().toISOString();

  const countQueries = pipelineOrder.map((status) =>
    client
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("business_id", context.business.id)
      .eq("status", status)
  );

  const [
    customerCountResult,
    bookingCountResult,
    inboxCountResult,
    automationCountResult,
    recentLeadsResult,
    ...pipelineCountResults
  ] = await Promise.all([
    client.from("customers").select("id", { count: "exact", head: true })
      .eq("business_id", context.business.id),
    client.from("appointments").select("id", { count: "exact", head: true })
      .eq("business_id", context.business.id)
      .gte("starts_at", now)
      .in("status", ["pending", "confirmed"]),
    client.from("conversations").select("id", { count: "exact", head: true })
      .eq("business_id", context.business.id)
      .in("status", ["open", "pending"]),
    client.from("automation_runs").select("id", { count: "exact", head: true })
      .eq("business_id", context.business.id)
      .in("status", ["pending", "failed"]),
    client.from("leads")
      .select("id,contact_name,email,phone,source,status,estimated_value_pence,last_contact_at,enquiry_summary,created_at,updated_at", { count: "exact" })
      .eq("business_id", context.business.id)
      .order("updated_at", { ascending: false })
      .limit(20),
    ...countQueries,
  ]);

  const recentLeads = recentLeadsResult.error ? [] : recentLeadsResult.data ?? [];
  const selectedLead = recentLeads[0] ?? null;

  const totalLeads = recentLeadsResult.error ? 0 : recentLeadsResult.count ?? 0;
  const customers = customerCountResult.error ? 0 : customerCountResult.count ?? 0;
  const upcomingBookings = bookingCountResult.error ? 0 : bookingCountResult.count ?? 0;
  const inboxAttention = inboxCountResult.error ? 0 : inboxCountResult.count ?? 0;
  const automationAttention = automationCountResult.error ? 0 : automationCountResult.count ?? 0;

  const counts = Object.fromEntries(
    pipelineOrder.map((status, index) => [
      status,
      pipelineCountResults[index]?.error ? 0 : pipelineCountResults[index]?.count ?? 0,
    ]),
  ) as Record<(typeof pipelineOrder)[number], number>;

  const conversionRate = totalLeads > 0 ? Math.round((counts.won / totalLeads) * 100) : 0;
  const pipelineMax = Math.max(1, ...pipelineOrder.map((status) => counts[status]));
  const funnelCounts = [counts.new + counts.contacted + counts.qualified + counts.won, counts.contacted + counts.qualified + counts.won, counts.qualified + counts.won, counts.won];
  const dataUnavailable = [customerCountResult, bookingCountResult, inboxCountResult, automationCountResult, recentLeadsResult, ...pipelineCountResults].some((result) => result.error);

  const recentByStatus = Object.fromEntries(
    pipelineOrder.map((status) => [
      status,
      recentLeads.filter((lead) => lead.status === status).slice(0, 3),
    ]),
  ) as Record<(typeof pipelineOrder)[number], typeof recentLeads>;

  return (
    <div className="ceDashboard">
      <div className="ceDashboardBody">
        <section className="ceMainArea">
          {dataUnavailable && <p className="formError" role="alert">Some workspace data could not be loaded. Refresh to update the dashboard; affected counts are unavailable.</p>}
          <div className="ceDashboardHead">
            <div>
              <h1>Sales Pipeline</h1>
              <p>Move faster. Build stronger relationships. Close more deals.</p>
            </div>
            <div className="ceRangeTabs" aria-label="Dashboard scope">
              <span className="ceRangeActive">Live workspace</span>
              <span>{context.business.execution_mode}</span>
            </div>
          </div>

          <div className="ceKpiGrid">
            <div className="ceKpiCard">
              <span>Total Leads</span><b>{totalLeads}</b><small>Tenant-scoped CRM</small>
            </div>
            <div className="ceKpiCard">
              <span>Customers</span><b>{customers}</b><small>Canonical directory</small>
            </div>
            <div className="ceKpiCard">
              <span>Win Rate</span><b>{conversionRate}%</b><small>{counts.won} won leads</small>
            </div>
            <div className="ceKpiCard">
              <span>Needs Attention</span><b>{inboxAttention + automationAttention}</b><small>Inbox + automations</small>
            </div>
          </div>

          <div className="cePipeline">
            {pipelineOrder.map((status) => {
              const visible = recentByStatus[status];
              const visibleValue = visible.reduce((sum, lead) => sum + (lead.estimated_value_pence ?? 0), 0);
              return (
                <section className={"cePipelineCol " + pipelineClass[status]} key={status}>
                  <div className="cePipelineColHead">
                    <div><b>{pipelineTitles[status]}</b><span>{counts[status]}</span></div>
                    <small>{visible.length ? formatLeadValue(visibleValue) + " visible" : "No recent cards"}</small>
                  </div>

                  <div className="ceLeadCards">
                    {visible.length ? visible.map((lead) => (
                      <Link className="ceLeadCard" href={"/dashboard/buy-from-me/leads/" + lead.id} key={lead.id}>
                        <div className="ceLeadCardTop">
                          <div className="ceLeadInitials">{lead.contact_name.slice(0, 2).toUpperCase()}</div>
                          <div>
                            <b>{lead.contact_name}</b>
                            <span>{leadSourceLabels[lead.source]}</span>
                          </div>
                        </div>
                        <p>{lead.enquiry_summary || "No enquiry summary yet."}</p>
                        <div className="ceLeadMeta">
                          <strong>{formatLeadValue(lead.estimated_value_pence)}</strong>
                          <span>{formatLeadDate(lead.last_contact_at, context.business.timezone)}</span>
                        </div>
                        <span className={"ceStatusPill " + pipelineClass[status]}>{leadStatusLabels[lead.status]}</span>
                      </Link>
                    )) : (
                      <div className="cePipelineEmpty">No recent {pipelineTitles[status].toLowerCase()}.</div>
                    )}
                  </div>

                  <Link className="ceAddLead" href="/dashboard/buy-from-me/leads/new">+ Add lead</Link>
                </section>
              );
            })}
          </div>

          <div className="ceAnalyticsGrid">
            <section className="ceAnalyticsCard">
              <div className="ceCardTitle"><b>Pipeline Performance</b><span>Lead count</span></div>
              <div className="ceBarChart">
                {pipelineOrder.map((status) => (
                  <div className="ceBarItem" key={status}>
                    <div className="ceBarValue">{counts[status]}</div>
                    <div className="ceBarTrack">
                      <div
                        className={"ceBarFill " + pipelineClass[status]}
                        style={{ height: Math.round((counts[status] / pipelineMax) * 100) + "%" }}
                      />
                    </div>
                    <span>{pipelineTitles[status]}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="ceAnalyticsCard">
              <div className="ceCardTitle"><b>Conversion Funnel</b><span>Current stages</span></div>
              <div className="ceFunnel">
                {pipelineOrder.slice(0, 4).map((status, index) => {
                  const width = funnelCounts[0] > 0 ? Math.round((funnelCounts[index] / funnelCounts[0]) * 100) : 0;
                  return (
                    <div className="ceFunnelRow" key={status}>
                      <div className={"ceFunnelShape " + pipelineClass[status]} style={{ width: width + "%" }} />
                      <div><b>{pipelineTitles[status]}{index < 3 ? " or beyond" : ""}</b><span>{funnelCounts[index]}</span></div>
                    </div>
                  );
                })}
              </div>
              <p className="ceDetailMuted">Current stage totals exclude lost leads; this is not historical conversion tracking.</p>
            </section>

            <section className="ceAnalyticsCard">
              <div className="ceCardTitle"><b>Sales Activity</b><span>Current</span></div>
              <div className="ceMiniStats">
                <div><b>{counts.new}</b><span>New Leads</span></div>
                <div><b>{counts.won}</b><span>Deals Won</span></div>
                <div><b>{upcomingBookings}</b><span>Bookings</span></div>
                <div><b>{conversionRate}%</b><span>Win Rate</span></div>
              </div>
            </section>
          </div>
        </section>

        <aside className="ceDetailPanel">
          {selectedLead ? (
            <>
              <div className="ceDetailLeadHead">
                <div className="ceDetailAvatar">{selectedLead.contact_name.slice(0, 2).toUpperCase()}</div>
                <div><h2>{selectedLead.contact_name}</h2><p>{leadSourceLabels[selectedLead.source]} lead</p></div>
                <span>•••</span>
              </div>

              <nav className="ceDetailTabs" aria-label="Lead summary"><a href="#lead-overview">Overview</a><a href="#lead-activity">Activity</a><Link href={"/dashboard/buy-from-me/leads/" + selectedLead.id}>Details</Link></nav>

              <div className="ceQuickActions">
                {selectedLead.phone ? <a href={"tel:" + selectedLead.phone}>Call</a> : <span aria-disabled="true">No phone</span>}
                {selectedLead.email ? <a href={"mailto:" + selectedLead.email}>Email</a> : <span aria-disabled="true">No email</span>}
                <Link href="/dashboard/bookings/new">Meet</Link>
                <Link href={"/dashboard/buy-from-me/leads/" + selectedLead.id}>Open</Link>
              </div>

              <dl className="ceDetailList" id="lead-overview">
                <div><dt>Deal Value</dt><dd>{formatLeadValue(selectedLead.estimated_value_pence)}</dd></div>
                <div><dt>Stage</dt><dd><span className={"ceStatusPill " + pipelineClass[selectedLead.status]}>{leadStatusLabels[selectedLead.status]}</span></dd></div>
                <div><dt>Last Contact</dt><dd>{formatLeadDate(selectedLead.last_contact_at, context.business.timezone)}</dd></div>
                <div><dt>Source</dt><dd>{leadSourceLabels[selectedLead.source]}</dd></div>
                <div><dt>Email</dt><dd>{selectedLead.email || "—"}</dd></div>
                <div><dt>Phone</dt><dd>{selectedLead.phone || "—"}</dd></div>
              </dl>

              <section className="ceActivityPanel" id="lead-activity">
                <h3 className="ceActivityHeading">Activity</h3>
                <Suspense fallback={<p className="ceDetailMuted">Loading recent activity…</p>}>
                  <DashboardLeadActivity leadId={selectedLead.id} timeZone={context.business.timezone} />
                </Suspense>
                <Link className="ceNoteLink" href={"/dashboard/buy-from-me/leads/" + selectedLead.id}>Open lead notes →</Link>
              </section>
            </>
          ) : (
            <div className="ceNoSelection">
              <div className="ceDetailAvatar">CE</div>
              <h2>No leads yet</h2>
              <p>Create your first Lead to populate the selected-lead panel.</p>
              <Link className="ceNewButton" href="/dashboard/buy-from-me/leads/new">+ New lead</Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
