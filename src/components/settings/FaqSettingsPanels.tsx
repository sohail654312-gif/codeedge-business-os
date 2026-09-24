"use client";

import { useActionState, useId } from "react";
import {
  createFaq,
  deleteFaq,
  updateFaq,
  type FaqState,
} from "@/modules/faqs/actions";
import {
  saveBusinessSettings,
  type SettingsState,
} from "@/modules/settings/actions";
import { defaultBusinessSettings } from "@/modules/settings/validation";
import type { BusinessFaq, BusinessSettings } from "@/types/database";

const initialFaqState: FaqState = {};
const initialSettingsState: SettingsState = {};

function Notice({ state }: { state: FaqState | SettingsState }) {
  return (
    <>
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
      {state.success ? <div className="formSuccess" role="status">{state.success}</div> : null}
    </>
  );
}

function FaqForm({ faq }: { faq?: BusinessFaq }) {
  const action = faq ? updateFaq : createFaq;
  const [state, formAction, pending] = useActionState(action, initialFaqState);
  const prefix = useId();

  return (
    <form action={formAction} className="businessInfoForm faqEditor">
      {faq ? <input type="hidden" name="faq_id" value={faq.id} /> : null}

      <div className="field">
        <label htmlFor={prefix + "-question"}>Question</label>
        <input
          id={prefix + "-question"}
          name="question"
          required
          maxLength={300}
          defaultValue={faq?.question ?? ""}
        />
      </div>

      <div className="field">
        <label htmlFor={prefix + "-answer"}>Answer</label>
        <textarea
          id={prefix + "-answer"}
          name="answer"
          required
          maxLength={5000}
          rows={5}
          defaultValue={faq?.answer ?? ""}
        />
      </div>

      <div className="profileGrid">
        <div className="field">
          <label htmlFor={prefix + "-order"}>Display order</label>
          <input
            id={prefix + "-order"}
            name="display_order"
            type="number"
            min="0"
            max="10000"
            step="1"
            required
            defaultValue={faq?.display_order ?? 0}
          />
        </div>

        <div className="serviceChecks">
          <label className="checkField">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={faq?.is_active ?? true}
            />
            Active
          </label>
        </div>
      </div>

      <p className="muted formHelp">
        FAQ content is stored as plain text only. Active status does not make it publicly accessible.
      </p>

      <Notice state={state} />
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving FAQ..." : faq ? "Save FAQ" : "Create FAQ"}
      </button>
    </form>
  );
}

function DeleteFaqForm({ faqId }: { faqId: string }) {
  const [state, action, pending] = useActionState(deleteFaq, initialFaqState);

  return (
    <form
      action={action}
      className="serviceDeleteForm"
      onSubmit={(event) => {
        if (!window.confirm("Delete this FAQ?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="faq_id" value={faqId} />
      <Notice state={state} />
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Deleting..." : "Delete FAQ"}
      </button>
    </form>
  );
}

export function FaqPanel({
  faqs,
  canEdit,
}: {
  faqs: BusinessFaq[];
  canEdit: boolean;
}) {
  return (
    <section className="panel topGap">
      <div className="settingsSectionHead">
        <div>
          <div className="eyebrow">Business Information</div>
          <h2>Frequently Asked Questions</h2>
          <p className="muted">
            Store reusable answers privately inside this workspace for later customer-facing workflows.
          </p>
        </div>
        <span className="pill">{faqs.length} {faqs.length === 1 ? "FAQ" : "FAQs"}</span>
      </div>

      <div className="faqList">
        {faqs.length === 0 ? (
          <div className="coverageEmpty">
            <div className="emptyIcon">?</div>
            <h3>No FAQs yet</h3>
            <p>Add the first frequently asked question for this business.</p>
          </div>
        ) : null}

        {faqs.map((faq) => (
          <article className="businessServiceCard" key={faq.id}>
            <div className="serviceCardHead">
              <div>
                <h3>{faq.question}</h3>
                <div className="serviceMeta">
                  <span>{faq.is_active ? "Active" : "Inactive"}</span>
                  <span>Order {faq.display_order}</span>
                </div>
              </div>
            </div>

            <p className="plainTextValue">{faq.answer}</p>

            {canEdit ? (
              <div className="serviceActions">
                <details>
                  <summary>Edit FAQ</summary>
                  <FaqForm faq={faq} />
                </details>
                <DeleteFaqForm faqId={faq.id} />
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {canEdit ? (
        <details className="businessServiceCard addServiceCard">
          <summary>Add FAQ</summary>
          <FaqForm />
        </details>
      ) : (
        <p className="muted">Only the business owner can change FAQs.</p>
      )}
    </section>
  );
}

export function BusinessSettingsPanel({
  settings,
  canEdit,
}: {
  settings: BusinessSettings | null;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(saveBusinessSettings, initialSettingsState);
  const prefix = useId();

  const locale = settings?.locale ?? defaultBusinessSettings.locale;
  const email = settings?.lead_notification_email ?? defaultBusinessSettings.lead_notification_email;
  const notify = settings?.notify_new_leads ?? defaultBusinessSettings.notify_new_leads;

  if (!canEdit) {
    return (
      <section className="panel topGap">
        <div className="settingsSectionHead">
          <div>
            <div className="eyebrow">Business Information</div>
            <h2>Business Settings</h2>
            <p className="muted">Tenant-private application preferences.</p>
          </div>
          <span className="pill">Read only</span>
        </div>

        <dl className="detailList">
          <div><dt>Locale</dt><dd>{locale}</dd></div>
          <div><dt>Lead notification email</dt><dd>{email || "Not provided"}</dd></div>
          <div><dt>New lead notifications</dt><dd>{notify ? "Enabled" : "Disabled"}</dd></div>
        </dl>

        <p className="muted settingsDeliveryNote">
          Email delivery is not connected yet; these values are preferences only.
        </p>
      </section>
    );
  }

  return (
    <section className="panel topGap">
      <div className="settingsSectionHead">
        <div>
          <div className="eyebrow">Business Information</div>
          <h2>Business Settings</h2>
          <p className="muted">Minimal private preferences for this workspace.</p>
        </div>
        <span className="pill">Owner editable</span>
      </div>

      <form action={action} className="businessInfoForm">
        <div className="profileGrid">
          <div className="field">
            <label htmlFor={prefix + "-locale"}>Locale</label>
            <input
              id={prefix + "-locale"}
              name="locale"
              required
              minLength={2}
              maxLength={35}
              placeholder="en-GB"
              defaultValue={locale}
            />
          </div>

          <div className="field">
            <label htmlFor={prefix + "-lead-email"}>Lead notification email</label>
            <input
              id={prefix + "-lead-email"}
              name="lead_notification_email"
              type="email"
              maxLength={254}
              placeholder="leads@example.com"
              defaultValue={email}
            />
          </div>
        </div>

        <div className="settingsToggleRow">
          <label className="checkField">
            <input
              type="checkbox"
              name="notify_new_leads"
              defaultChecked={notify}
            />
            Notify about new leads when delivery is connected
          </label>
        </div>

        <p className="muted formHelp">
          No email is sent by this feature. Notification delivery will be implemented in a later phase.
        </p>

        <Notice state={state} />
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Saving Settings..." : "Save Business Settings"}
        </button>
      </form>
    </section>
  );
}
