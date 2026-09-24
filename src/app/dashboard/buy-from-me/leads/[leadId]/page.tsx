import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteLeadNoteForm } from "@/components/leads/DeleteLeadNoteForm";
import { LeadNoteForm } from "@/components/leads/LeadNoteForm";
import { LeadStatusForm } from "@/components/leads/LeadStatusForm";
import { QuoteRequestCreateForm } from "@/components/leads/QuoteRequestCreateForm";
import { QuoteRequestStatusForm } from "@/components/leads/QuoteRequestStatusForm";
import { formatLeadDate, formatLeadValue, formatNoteDate, getLead, listLeadNotes, listQuoteRequests } from "@/modules/buy-from-me/leads/data";
import { leadSourceLabels, leadStatusLabels, quoteRequestStatusLabels } from "@/modules/buy-from-me/leads/domain";
import { requireDashboardTenant } from "@/server/auth/session";

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const { client, context } = await requireDashboardTenant();
  const [lead, notes, quoteRequests] = await Promise.all([
    getLead(client, context.business.id, leadId),
    listLeadNotes(client, context.business.id, leadId),
    listQuoteRequests(client, context.business.id, leadId),
  ]);

  if (!lead) notFound();

  return (
    <>
      <div className="pageHead">
        <div>
          <Link className="backLink" href="/dashboard/buy-from-me/leads">← All leads</Link>
          <div className="eyebrow topGap">Lead details</div>
          <h1>{lead.contact_name}</h1>
          <p className="muted">This record is loaded from the tenant-protected CRM database.</p>
        </div>
        <div className="row">
          <span className={"leadStatus leadStatus" + leadStatusLabels[lead.status].replace(/\s+/g, "")}>
            {leadStatusLabels[lead.status]}
          </span>
          <Link className="btn primary" href={`/dashboard/buy-from-me/leads/${lead.id}/edit`}>
            Edit lead
          </Link>
        </div>
      </div>

      <div className="leadDetailGrid">
        <section className="panel">
          <h2>Contact</h2>
          <dl className="detailList">
            <div><dt>Name</dt><dd>{lead.contact_name}</dd></div>
            <div><dt>Phone</dt><dd>{lead.phone || "—"}</dd></div>
            <div><dt>Email</dt><dd>{lead.email || "—"}</dd></div>
            <div><dt>Source</dt><dd>{leadSourceLabels[lead.source]}</dd></div>
          </dl>
        </section>

        <section className="panel">
          <h2>Opportunity</h2>
          <dl className="detailList">
            <div><dt>Service</dt><dd>{lead.service_name ?? "—"}</dd></div>
            <div><dt>Status</dt><dd>{leadStatusLabels[lead.status]}</dd></div>
            <div><dt>Estimated value</dt><dd>{formatLeadValue(lead.estimated_value_pence)}</dd></div>
            <div><dt>Last contact</dt><dd>{formatLeadDate(lead.last_contact_at)}</dd></div>
          </dl>
        </section>
      </div>

      <section className="panel topGap leadStatusPanel">
        <div>
          <h2>Lead status</h2>
          <p className="muted">
            Move this Lead through the sales lifecycle without changing its contact details.
          </p>
        </div>
        <LeadStatusForm leadId={lead.id} currentStatus={lead.status} />
      </section>

      <section className="panel topGap">
        <h2>Enquiry summary</h2>
        <p className="leadSummaryText">{lead.enquiry_summary}</p>
      </section>

      <div className="twoCol topGap">
        <section className="panel" id="internal-notes">
          <div className="noteSectionHead">
            <div>
              <h2>Internal notes</h2>
              <p className="muted">Private team context for this Lead.</p>
            </div>
            <span className="pill">{notes.length} {notes.length === 1 ? "note" : "notes"}</span>
          </div>

          <LeadNoteForm leadId={lead.id} />

          <div className="noteList">
            {notes.length ? notes.map((note) => (
              <article className="noteCard" key={note.id}>
                <div className="noteMeta">
                  <span>{note.created_by === context.userId ? "You" : "Team member"}</span>
                  <span>{formatNoteDate(note.created_at)}</span>
                </div>
                <p>{note.body}</p>
                {context.role === "owner" ? (
                  <DeleteLeadNoteForm leadId={lead.id} noteId={note.id} />
                ) : null}
              </article>
            )) : (
              <div className="noteEmpty">No internal notes yet.</div>
            )}
          </div>
        </section>
        <section className="panel" id="quote-requests">
          <div className="noteSectionHead">
            <div>
              <h2>Quote requests</h2>
              <p className="muted">Commercial requests tracked separately from the Lead lifecycle.</p>
            </div>
            <span className="pill">{quoteRequests.length} {quoteRequests.length === 1 ? "request" : "requests"}</span>
          </div>

          <QuoteRequestCreateForm leadId={lead.id} />

          <div className="quoteRequestList">
            {quoteRequests.length ? quoteRequests.map((quote) => (
              <article className="quoteRequestCard" key={quote.id}>
                <div className="quoteRequestHead">
                  <div>
                    <span className={"quoteStatus quoteStatus" + quote.status.replace(/\s+/g, "")}>
                      {quoteRequestStatusLabels[quote.status]}
                    </span>
                    <div className="muted quoteDate">{formatNoteDate(quote.created_at)}</div>
                  </div>
                  <QuoteRequestStatusForm
                    leadId={lead.id}
                    quoteRequestId={quote.id}
                    currentStatus={quote.status}
                  />
                </div>
                <p>{quote.details}</p>
              </article>
            )) : (
              <div className="noteEmpty">No Quote Requests yet.</div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
