import Link from "next/link";
import { BusinessProfilePanel, ServicesPanel } from "@/components/settings/BusinessProfileServices";
import { OpeningHoursPanel, ServiceAreasPanel } from "@/components/settings/ServiceCoveragePanels";
import { requireDashboardTenant } from "@/server/auth/session";

export default async function Settings() {
  const { client, context } = await requireDashboardTenant();

  const [profileResult, serviceResult, areaResult, hoursResult] = await Promise.all([
    client
      .from("business_profiles")
      .select("*")
      .eq("business_id", context.business.id)
      .maybeSingle(),
    client
      .from("services")
      .select("*")
      .eq("business_id", context.business.id)
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),
    client
      .from("service_areas")
      .select("*")
      .eq("business_id", context.business.id)
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),
    client
      .from("opening_hours")
      .select("*")
      .eq("business_id", context.business.id)
      .order("weekday", { ascending: true }),
  ]);

  if (profileResult.error || serviceResult.error || areaResult.error || hoursResult.error) {
    throw new Error("Unable to load Business Information.");
  }

  const canEdit = context.role === "owner";

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1>Settings</h1>
          <p className="muted">{context.business.name}</p>
        </div>
        <span className="pill">{canEdit ? "Owner" : "Staff"}</span>
      </div>

      <div className="twoCol">
        <section className="panel">
          <h2>Workspace</h2>
          <dl className="detailList">
            <div><dt>Business</dt><dd>{context.business.name}</dd></div>
            <div><dt>Your access</dt><dd>{canEdit ? "Owner" : "Staff"}</dd></div>
            <div><dt>Time zone</dt><dd>{context.business.timezone}</dd></div>
          </dl>
        </section>

        <section className="panel">
          <h2>Integration status</h2>
          <p><b>ERPNext</b> — replaceable back-office adapter</p>
          <p className="muted">Messaging adapter: Not connected</p>
          <p className="muted">Voice adapter: Reserved for a later phase</p>
          <Link className="btn" href="/dashboard/settings/erpnext">Open ERPNext setup</Link>
        </section>
      </div>

      <BusinessProfilePanel
        key={profileResult.data?.updated_at ?? "new-profile"}
        profile={profileResult.data}
        canEdit={canEdit}
      />

      <ServicesPanel
        services={serviceResult.data ?? []}
        canEdit={canEdit}
      />

      <ServiceAreasPanel
        areas={areaResult.data ?? []}
        canEdit={canEdit}
      />

      <OpeningHoursPanel
        hours={hoursResult.data ?? []}
        timezone={context.business.timezone}
        canEdit={canEdit}
      />
    </>
  );
}
