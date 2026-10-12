"use client";

import { useActionState } from "react";
import {
  saveWhatsAppAutoReplySettings,
  type WhatsAppSettingsState,
} from "@/modules/whatsapp/actions";
import type { WhatsAppAutoReplySettings } from "@/types/database";

const initialState: WhatsAppSettingsState = {};

export function WhatsAppAutoReplySettingsPanel({
  settings, canEdit,
}: {
  settings: WhatsAppAutoReplySettings | null;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveWhatsAppAutoReplySettings, initialState,
  );

  return (
    <section className="panel topGap" id="whatsapp-auto-replies">
      <div className="settingsSectionHead">
        <div>
          <div className="eyebrow">Contact Me</div>
          <h2>WhatsApp reply suggestions</h2>
          <p className="muted">
            Draft-only mode: review suggestions inside the Shared Inbox.
            No message is sent automatically, even when this switch is enabled.
          </p>
        </div>
        <span className="pill">{settings?.enabled ? "Drafts on" : "Off"}</span>
      </div>
      {!canEdit ? (
        <p className="muted">
          {settings?.enabled ? "Suggestions enabled" : "Suggestions disabled"}
          {" · Monthly draft cap: "}{settings?.monthly_draft_limit ?? 800}
        </p>
      ) : (
        <form action={action} className="businessInfoForm">
          <div className="settingsToggleRow">
            <label className="checkField">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={settings?.enabled ?? false}
              />
              Prepare suggested WhatsApp replies for staff review
            </label>
          </div>
          <div className="field">
            <label htmlFor="whatsapp_auto_draft_limit">Maximum drafts per month</label>
            <input
              id="whatsapp_auto_draft_limit"
              type="number"
              name="monthly_draft_limit"
              min={1}
              max={800}
              step={1}
              required
              defaultValue={settings?.monthly_draft_limit ?? 800}
            />
          </div>
          <p className="muted formHelp">
            This cap tracks stored draft suggestions, not Meta-billed messages.
            STOP and human handoffs persist and stop further suggestions
            for the contact. No AI provider or Meta API is called here.
          </p>
          {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
          {state.success ? <div className="formSuccess" role="status">{state.success}</div> : null}
          <button type="submit" className="btn primary" disabled={pending}>
            {pending ? "Saving..." : "Save suggestion settings"}
          </button>
        </form>
      )}
    </section>
  );
}
