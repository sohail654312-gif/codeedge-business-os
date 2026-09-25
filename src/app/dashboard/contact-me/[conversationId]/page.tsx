import Link from "next/link";
import { notFound } from "next/navigation";
import { ConversationComposer } from "@/components/conversations/ConversationComposer";
import { ConversationStatusForm } from "@/components/conversations/ConversationStatusForm";
import {
  conversationChannelLabels,
  conversationStatusLabels,
  deliveryStatusLabels,
} from "@/modules/contact-me/conversations/domain";
import {
  formatConversationTime,
  getConversationDetail,
} from "@/modules/contact-me/conversations/data";
import { conversationIdSchema } from "@/modules/contact-me/conversations/validation";
import { requireDashboardTenant } from "@/server/auth/session";

function senderLabel(
  senderType: "customer" | "staff" | "ai" | "system",
  senderUserId: string | null,
  currentUserId: string,
  direction: "inbound" | "outbound" | "internal",
) {
  if (direction === "internal") return senderUserId === currentUserId ? "You · internal note" : "Team · internal note";
  if (senderType === "customer") return "Customer";
  if (senderType === "staff") return senderUserId === currentUserId ? "You" : "Team member";
  if (senderType === "ai") return "AI";
  return "System";
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  if (!conversationIdSchema.safeParse(conversationId).success) notFound();

  const { client, context } = await requireDashboardTenant();
  const detail = await getConversationDetail(client, context.business.id, conversationId);
  if (!detail) notFound();

  const { conversation, lead, customer, messages } = detail;
  const contactName = customer?.contact_name ?? lead?.contact_name ?? "Unlinked conversation";

  return (
    <>
      <div className="pageHead">
        <div>
          <Link className="backLink" href="/dashboard/contact-me">← Shared Inbox</Link>
          <div className="eyebrow topGap">{conversationChannelLabels[conversation.channel]}</div>
          <h1>{conversation.subject || contactName}</h1>
          <p className="muted">{contactName}</p>
        </div>
        <ConversationStatusForm
          conversationId={conversation.id}
          currentStatus={conversation.status}
        />
      </div>

      <div className="conversationDetailGrid">
        <section className="panel">
          <h2>Conversation</h2>
          <dl className="detailList">
            <div><dt>Channel</dt><dd>{conversationChannelLabels[conversation.channel]}</dd></div>
            <div><dt>Status</dt><dd>{conversationStatusLabels[conversation.status]}</dd></div>
            <div><dt>Last activity</dt><dd>{formatConversationTime(conversation.last_message_at, context.business.timezone)}</dd></div>
            <div>
              <dt>Delivery</dt>
              <dd>
                {conversation.channel === "website_chat"
                  ? "Live Website Chat"
                  : conversation.channel === "whatsapp"
                    ? "Live WhatsApp"
                    : conversation.channel === "email"
                      ? "Live Email"
                      : "Local storage only"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <h2>CRM identity</h2>
          <dl className="detailList">
            <div><dt>Name</dt><dd>{contactName}</dd></div>
            <div><dt>Lead</dt><dd>{lead ? <Link className="leadNameLink" href={`/dashboard/buy-from-me/leads/${lead.id}`}>Open Lead</Link> : "—"}</dd></div>
            <div><dt>Customer</dt><dd>{customer ? <Link className="leadNameLink" href="/dashboard/buy-from-me/customers">Linked Customer</Link> : "—"}</dd></div>
            <div><dt>Contact</dt><dd>{customer?.email || customer?.phone || lead?.email || lead?.phone || "—"}</dd></div>
          </dl>
        </section>
      </div>

      <section className="panel topGap">
        <div className="noteSectionHead">
          <div>
            <h2>Message timeline</h2>
            <p className="muted">Plain-text messages stored in the shared Conversation + Message core.</p>
          </div>
          <span className="pill">{messages.length} {messages.length === 1 ? "message" : "messages"}</span>
        </div>

        <div className="conversationTimeline">
          {messages.length ? messages.map((message) => (
            <article
              className={`conversationMessage conversationMessage${message.direction}`}
              key={message.id}
            >
              <div className="conversationMessageHead">
                <b>{senderLabel(message.sender_type, message.sender_user_id, context.userId, message.direction)}</b>
                <time className="muted">{formatConversationTime(message.created_at, context.business.timezone)}</time>
              </div>
              <p>{message.body}</p>
              {message.delivery_status ? (
                <p className="muted formHelp">
                  Delivery: {deliveryStatusLabels[message.delivery_status]}
                </p>
              ) : null}
            </article>
          )) : (
            <div className="noteEmpty">No messages yet. Add the first local reply or internal note below.</div>
          )}
        </div>
      </section>

      <section className="panel topGap">
        <h2>Add message</h2>
        <ConversationComposer conversationId={conversation.id} channel={conversation.channel} />
      </section>
    </>
  );
}
