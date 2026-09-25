"use client";

import { useActionState } from "react";
import {
  saveEmailSettings,
  type EmailSettingsState,
} from "@/modules/email/actions";
import type { ChannelConnection, EmailChannelSettings } from "@/types/database";

const initialState: EmailSettingsState = {};

export function EmailSettingsPanel({
  connection,
  settings,
  canEdit,
  appUrl,
  credentialConfigured,
}: {
  connection: ChannelConnection | null;
  settings: EmailChannelSettings | null;
  canEdit: boolean;
  appUrl: string | null;
  credentialConfigured: boolean;
}) {
  const [state, action, pending] = useActionState(saveEmailSettings, initialState);
  const webhookUrl = appUrl ? `${appUrl}/api/channels/email/resend/webhook` : null;

  return (
    <section className="panel topGap" id="email">
      <div className="settingsSectionHead">
        <div>
          <div className="eyebrow">Contact Me</div>
          <h2>Email</h2>
          <p className="muted">
            Resend connected through the replaceable Codeedge Email provider boundary.
          </p>
        </div>
        <span className="pill">{connection?.enabled ? "Enabled" : "Disabled"}</span>
      </div>

      {!canEdit ? (
        <dl className="detailList">
          <div><dt>Provider</dt><dd>Resend</dd></div>
          <div><dt>Sender</dt><dd>{settings?.sender_email || "Not configured"}</dd></div>
          <div><dt>Inbound</dt><dd>{settings?.inbound_email || "Not configured"}</dd></div>
          <div><dt>Provider credential</dt><dd>{credentialConfigured ? "Configured" : "Not configured"}</dd></div>
          <div><dt>Status</dt><dd>{connection?.enabled ? "Enabled" : "Disabled"}</dd></div>
        </dl>
      ) : (
        <form action={action} className="businessInfoForm">
          <div className="settingsToggleRow">
            <label className="checkField">
              <input type="checkbox" name="enabled" defaultChecked={connection?.enabled ?? false} />
              Enable Email channel
            </label>
          </div>

          <div className="profileGrid">
            <div className="field">
              <label htmlFor="email_sender_name">Sender display name</label>
              <input
                id="email_sender_name"
                name="sender_name"
                maxLength={120}
                defaultValue={settings?.sender_name ?? ""}
                placeholder="Codeedge Support"
              />
            </div>

            <div className="field">
              <label htmlFor="email_sender_email">Sender email</label>
              <input
                id="email_sender_email"
                name="sender_email"
                type="email"
                maxLength={254}
                required
                defaultValue={settings?.sender_email ?? connection?.external_sender_id ?? ""}
                placeholder="support@example.com"
              />
            </div>

            <div className="field">
              <label htmlFor="email_reply_to">Reply-to email</label>
              <input
                id="email_reply_to"
                name="reply_to_email"
                type="email"
                maxLength={254}
                defaultValue={settings?.reply_to_email ?? ""}
                placeholder="Optional"
              />
            </div>

            <div className="field">
              <label htmlFor="email_inbound">Inbound receiving address</label>
              <input
                id="email_inbound"
                name="inbound_email"
                type="email"
                maxLength={254}
                required
                defaultValue={settings?.inbound_email ?? ""}
                placeholder="inbox@example.com"
              />
            </div>

            <div className="field">
              <label htmlFor="email_credential_key">Server credential key</label>
              <input
                id="email_credential_key"
                name="credential_key"
                maxLength={80}
                pattern="[A-Za-z0-9._-]{2,80}"
                required
                defaultValue={connection?.credential_key ?? ""}
                placeholder="client_primary"
              />
            </div>
          </div>

          <p className="muted formHelp">
            The credential key is only an alias. The actual Resend API key stays in the
            server-only EMAIL_RESEND_CREDENTIALS_JSON environment variable.
            Current credential status: {credentialConfigured ? "configured" : "not configured"}.
          </p>

          {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
          {state.success ? <div className="formSuccess" role="status">{state.success}</div> : null}

          <button className="btn primary" type="submit" disabled={pending}>
            {pending ? "Saving Email..." : "Save Email"}
          </button>
        </form>
      )}

      <div className="websiteChatInstall">
        <h3>Inbound webhook</h3>
        {webhookUrl ? (
          <pre className="embedSnippet"><code>{webhookUrl}</code></pre>
        ) : (
          <p className="muted">Configure NEXT_PUBLIC_APP_URL to display the webhook URL.</p>
        )}
        <p className="muted settingsDeliveryNote">
          Configure Resend to send Email events to this endpoint. Codeedge verifies Svix
          signatures before resolving a tenant or fetching message content.
        </p>
      </div>
    </section>
  );
}
