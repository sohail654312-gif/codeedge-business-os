"use client";

import { useActionState } from "react";
import {
  saveWebsiteChatSettings,
  type WebsiteChatSettingsState,
} from "@/modules/website-chat/actions";
import type { WebsiteChatWidget } from "@/types/database";

const initialState: WebsiteChatSettingsState = {};

export function WebsiteChatSettingsPanel({
  widget,
  canEdit,
  appUrl,
}: {
  widget: WebsiteChatWidget | null;
  canEdit: boolean;
  appUrl: string | null;
}) {
  const [state, action, pending] = useActionState(saveWebsiteChatSettings, initialState);

  const defaults = {
    widget_name: widget?.widget_name ?? "Chat with us",
    launcher_label: widget?.launcher_label ?? "Chat with us",
    greeting_text: widget?.greeting_text ?? "How can we help?",
    welcome_message: widget?.welcome_message ?? "Welcome. Send us a message and our team will reply here.",
    offline_message: widget?.offline_message ?? "Chat is currently unavailable. Please try again later.",
    accent_color: widget?.accent_color ?? "#23BDF0",
  };

  const embed = widget && appUrl
    ? `<script async src="${appUrl}/widget.js" data-widget-id="${widget.public_id}"></script>`
    : null;

  return (
    <section className="panel topGap" id="website-chat">
      <div className="settingsSectionHead">
        <div>
          <div className="eyebrow">Contact Me</div>
          <h2>Website Chat</h2>
          <p className="muted">
            Native Codeedge chat that feeds the existing Shared Inbox.
          </p>
        </div>
        <span className="pill">{widget?.enabled ? "Enabled" : "Disabled"}</span>
      </div>

      {!canEdit ? (
        <dl className="detailList">
          <div><dt>Widget name</dt><dd>{defaults.widget_name}</dd></div>
          <div><dt>Launcher</dt><dd>{defaults.launcher_label}</dd></div>
          <div><dt>Lead capture</dt><dd>{widget?.lead_capture_enabled !== false ? "Enabled" : "Disabled"}</dd></div>
          <div><dt>Public widget</dt><dd>{widget?.public_id ?? "Not created yet"}</dd></div>
        </dl>
      ) : (
        <form action={action} className="businessInfoForm">
          <div className="settingsToggleRow">
            <label className="checkField">
              <input type="checkbox" name="enabled" defaultChecked={widget?.enabled ?? false} />
              Enable public Website Chat
            </label>
          </div>

          <div className="profileGrid">
            <div className="field">
              <label htmlFor="website_chat_widget_name">Widget name</label>
              <input id="website_chat_widget_name" name="widget_name" maxLength={80} required defaultValue={defaults.widget_name} />
            </div>
            <div className="field">
              <label htmlFor="website_chat_launcher">Launcher label</label>
              <input id="website_chat_launcher" name="launcher_label" maxLength={40} required defaultValue={defaults.launcher_label} />
            </div>
            <div className="field">
              <label htmlFor="website_chat_greeting">Greeting</label>
              <input id="website_chat_greeting" name="greeting_text" maxLength={200} required defaultValue={defaults.greeting_text} />
            </div>
            <div className="field">
              <label htmlFor="website_chat_accent">Accent colour</label>
              <input id="website_chat_accent" name="accent_color" type="text" pattern="^#[0-9A-Fa-f]{6}$" maxLength={7} required defaultValue={defaults.accent_color} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="website_chat_welcome">Welcome message</label>
            <textarea id="website_chat_welcome" name="welcome_message" rows={3} maxLength={500} required defaultValue={defaults.welcome_message} />
          </div>

          <div className="field">
            <label htmlFor="website_chat_offline">Unavailable message</label>
            <textarea id="website_chat_offline" name="offline_message" rows={3} maxLength={500} required defaultValue={defaults.offline_message} />
          </div>

          <div className="settingsToggleRow">
            <label className="checkField">
              <input type="checkbox" name="lead_capture_enabled" defaultChecked={widget?.lead_capture_enabled ?? true} />
              Allow visitors to submit contact details and create/link a CRM Lead
            </label>
          </div>

          {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
          {state.success ? <div className="formSuccess" role="status">{state.success}</div> : null}

          <button className="btn primary" type="submit" disabled={pending}>
            {pending ? "Saving Website Chat..." : "Save Website Chat"}
          </button>
        </form>
      )}

      {widget ? (
        <div className="websiteChatInstall">
          <h3>Website installation</h3>
          <p className="muted">
            The public widget ID is intentionally not a secret. Visitor authorization comes from a separate expiring session token.
          </p>
          {embed ? <pre className="embedSnippet"><code>{embed}</code></pre> : <p className="muted">Configure NEXT_PUBLIC_APP_URL to generate the embed snippet.</p>}
          {appUrl ? (
            <a className="btn" href={`${appUrl}/chat/${widget.public_id}`} target="_blank" rel="noreferrer">
              Open widget preview
            </a>
          ) : null}
        </div>
      ) : (
        <p className="muted settingsDeliveryNote">
          Save Website Chat once to create a unique public widget ID and installation snippet.
        </p>
      )}
    </section>
  );
}
