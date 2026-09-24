import Link from "next/link";
import {
  conversationChannelLabels,
  conversationChannels,
  conversationStatusLabels,
  conversationStatuses,
} from "@/modules/contact-me/conversations/domain";
import {
  formatConversationTime,
  listInboxConversations,
} from "@/modules/contact-me/conversations/data";
import { inboxFilterSchema } from "@/modules/contact-me/conversations/validation";
import { requireDashboardTenant } from "@/server/auth/session";

type InboxSearchParams = Record<string, string | string[] | undefined>;

export default async function ContactMePage({
  searchParams,
}: {
  searchParams: Promise<InboxSearchParams>;
}) {
  const { client, context } = await requireDashboardTenant();
  const filters = inboxFilterSchema.parse(await searchParams);
  const conversations = await listInboxConversations(client, context.business.id, filters);

  const activeFilters = Boolean(filters.status || filters.channel);

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Contact Me</div>
          <h1>Shared Inbox</h1>
          <p className="muted">
            One tenant-secured communications layer for current and future channels.
          </p>
        </div>
        <span className="pill">Channel-independent core</span>
      </div>

      <section className="panel">
        <div className="inboxToolbar">
          <div>
            <h2>Conversations</h2>
            <p className="muted">
              External delivery is not connected yet. New local threads can be started from a Lead.
            </p>
          </div>
        </div>

        <form className="inboxFilters" method="get">
          <div className="field">
            <label htmlFor="inbox_status">Status</label>
            <select id="inbox_status" name="status" defaultValue={filters.status ?? ""}>
              <option value="">All statuses</option>
              {conversationStatuses.map((status) => (
                <option key={status} value={status}>{conversationStatusLabels[status]}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="inbox_channel">Channel</label>
            <select id="inbox_channel" name="channel" defaultValue={filters.channel ?? ""}>
              <option value="">All channels</option>
              {conversationChannels.map((channel) => (
                <option key={channel} value={channel}>{conversationChannelLabels[channel]}</option>
              ))}
            </select>
          </div>

          <div className="inboxFilterActions">
            <button className="btn primary" type="submit">Apply</button>
            {activeFilters ? <Link className="btn" href="/dashboard/contact-me">Reset</Link> : null}
          </div>
        </form>

        <div className="inboxList">
          {conversations.length ? conversations.map((conversation) => (
            <Link
              className="inboxConversation"
              href={`/dashboard/contact-me/${conversation.id}`}
              key={conversation.id}
            >
              <div className="inboxConversationTop">
                <div>
                  <b>{conversation.contact_name || conversation.subject || "Unlinked conversation"}</b>
                  {conversation.contact_name && conversation.subject
                    ? <div className="muted inboxSubject">{conversation.subject}</div>
                    : null}
                </div>
                <time className="muted">
                  {formatConversationTime(conversation.last_message_at, context.business.timezone)}
                </time>
              </div>

              <div className="inboxConversationMeta">
                <span className="conversationChannel">{conversationChannelLabels[conversation.channel]}</span>
                <span className={`conversationState conversationState${conversation.status}`}>
                  {conversationStatusLabels[conversation.status]}
                </span>
                {conversation.crm_kind ? <span className="muted">{conversation.crm_kind === "customer" ? "Customer" : "Lead"}</span> : null}
                {conversation.channel === "website_chat" && conversation.last_message_direction === "inbound"
                  ? <span className="visitorWaiting">Visitor waiting</span>
                  : null}
              </div>

              <p className="inboxPreview">
                {conversation.last_message_preview || "No messages yet — open this conversation to add the first local message."}
              </p>
            </Link>
          )) : (
            <div className="emptyState">
              <div className="emptyIcon">☎</div>
              <h3>{activeFilters ? "No matching conversations" : "Shared Inbox is ready"}</h3>
              <p>
                {activeFilters
                  ? "Try another status/channel combination or reset the filters."
                  : "No conversations exist yet. Open a Lead and start an internal conversation; future website chat, WhatsApp, email, SMS and voice adapters will feed this same inbox."}
              </p>
              {activeFilters ? <Link className="btn topGap" href="/dashboard/contact-me">Reset filters</Link> : null}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
