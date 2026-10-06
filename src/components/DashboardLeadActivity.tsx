import "server-only";
import { requireDashboardTenant } from "@/server/auth/session";

function eventDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export async function DashboardLeadActivity({
  leadId,
  timeZone,
}: {
  leadId: string;
  timeZone: string;
}) {
  const { client, context } = await requireDashboardTenant();
  const result = await client
    .from("crm_activities")
    .select("id,event_type,description,created_at")
    .eq("business_id", context.business.id)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (result.error) {
    return <p className="ceDetailMuted">Recent activity is temporarily unavailable.</p>;
  }

  const activities = result.data ?? [];
  if (!activities.length) {
    return <p className="ceDetailMuted">No CRM activity recorded for this lead yet.</p>;
  }

  return (
    <div className="ceActivityList">
      {activities.map((activity) => (
        <div className="ceActivityRow" key={activity.id}>
          <span className="ceActivityIcon">•</span>
          <div>
            <b>{activity.description}</b>
            <span>{eventDate(activity.created_at, timeZone)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
