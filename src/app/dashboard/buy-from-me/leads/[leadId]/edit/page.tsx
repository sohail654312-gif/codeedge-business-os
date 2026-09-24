import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadEditForm } from "@/components/leads/LeadEditForm";
import { getLead, listActiveServices } from "@/modules/buy-from-me/leads/data";
import { requireDashboardTenant } from "@/server/auth/session";

export default async function EditLeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const { client, context } = await requireDashboardTenant();
  const [lead, services] = await Promise.all([
    getLead(client, context.business.id, leadId),
    listActiveServices(client, context.business.id),
  ]);

  if (!lead) notFound();

  return (
    <>
      <div className="pageHead">
        <div>
          <Link className="backLink" href={`/dashboard/buy-from-me/leads/${lead.id}`}>← Lead details</Link>
          <div className="eyebrow topGap">Buy From Me</div>
          <h1>Edit Lead</h1>
          <p className="muted">
            Update contact and opportunity information for {lead.contact_name}. Tenant ownership cannot be changed here.
          </p>
        </div>
      </div>

      <section className="panel leadFormPanel">
        <LeadEditForm
          lead={{
            id: lead.id,
            contact_name: lead.contact_name,
            phone: lead.phone,
            email: lead.email,
            source: lead.source,
            service_id: lead.service_id,
            enquiry_summary: lead.enquiry_summary,
            estimated_value_pence: lead.estimated_value_pence,
          }}
          services={services}
        />
      </section>
    </>
  );
}
