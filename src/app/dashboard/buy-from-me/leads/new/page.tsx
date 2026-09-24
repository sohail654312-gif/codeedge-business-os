import Link from "next/link";
import { LeadCreateForm } from "@/components/leads/LeadCreateForm";
import { listActiveServices } from "@/modules/buy-from-me/leads/data";
import { requireDashboardTenant } from "@/server/auth/session";

export default async function NewLeadPage() {
  const { client, context } = await requireDashboardTenant();
  const services = await listActiveServices(client, context.business.id);

  return (
    <>
      <div className="pageHead">
        <div>
          <Link className="backLink" href="/dashboard/buy-from-me/leads">← All leads</Link>
          <div className="eyebrow topGap">Buy From Me</div>
          <h1>Add Lead</h1>
          <p className="muted">
            Create a real CRM Lead inside {context.business.name}. Tenant and creator ownership are assigned on the server.
          </p>
        </div>
      </div>

      <section className="panel leadFormPanel">
        <LeadCreateForm services={services} />
      </section>
    </>
  );
}
