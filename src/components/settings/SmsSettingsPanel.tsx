"use client";

import { useActionState } from "react";
import { saveSmsSettings, type SmsSettingsState } from "@/modules/sms/actions";
import type { ChannelConnection } from "@/types/database";

const initialState: SmsSettingsState = {};

export function SmsSettingsPanel({
  connection,
  canEdit,
  appUrl,
  credentialConfigured,
}: {
  connection: ChannelConnection | null;
  canEdit: boolean;
  appUrl: string | null;
  credentialConfigured: boolean;
}) {
  const [state, action, pending] = useActionState(saveSmsSettings, initialState);
  const webhookUrl = appUrl ? `${appUrl}/api/channels/sms/twilio/webhook` : null;

  return (
    <section className="panel topGap" id="sms">
      <div className="settingsSectionHead">
        <div>
          <div className="eyebrow">Contact Me</div>
          <h2>SMS</h2>
          <p className="muted">
            Twilio Programmable Messaging connected through the replaceable Codeedge SMS provider interface.
          </p>
        </div>
        <span className="pill">{connection?.enabled ? "Enabled" : "Disabled"}</span>
      </div>

      {!canEdit ? (
        <dl className="detailList">
          <div><dt>Provider</dt><dd>Twilio SMS</dd></div>
          <div><dt>Sender</dt><dd>{connection?.display_address || connection?.external_sender_id || "Not configured"}</dd></div>
          <div><dt>Credential</dt><dd>{credentialConfigured ? "Configured server-side" : "Not configured"}</dd></div>
          <div><dt>Status</dt><dd>{connection?.enabled ? "Enabled" : "Disabled"}</dd></div>
        </dl>
      ) : (
        <form action={action} className="businessInfoForm">
          <div className="settingsToggleRow">
            <label className="checkField">
              <input type="checkbox" name="enabled" defaultChecked={connection?.enabled ?? false} />
              Enable SMS channel
            </label>
          </div>

          <div className="profileGrid">
            <div className="field">
              <label htmlFor="sms_account_sid">Twilio Account SID</label>
              <input
                id="sms_account_sid"
                name="external_account_id"
                pattern="AC[0-9A-Fa-f]{32}"
                maxLength={34}
                required
                defaultValue={connection?.external_account_id ?? ""}
                placeholder="AC..."
              />
            </div>

            <div className="field">
              <label htmlFor="sms_sender">SMS sender number</label>
              <input
                id="sms_sender"
                name="external_sender_id"
                inputMode="tel"
                pattern="\+[1-9][0-9]{7,14}"
                maxLength={16}
                required
                defaultValue={connection?.external_sender_id ?? ""}
                placeholder="+447700900123"
              />
            </div>

            <div className="field">
              <label htmlFor="sms_display_address">Display label / number</label>
              <input
                id="sms_display_address"
                name="display_address"
                maxLength={120}
                defaultValue={connection?.display_address ?? ""}
                placeholder="+44…"
              />
            </div>

            <div className="field">
              <label htmlFor="sms_credential_key">Server credential key</label>
              <input
                id="sms_credential_key"
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
            The credential key is an alias only. Store the real Twilio Auth Token in the
            server-only SMS_TWILIO_CREDENTIALS_JSON environment variable. Current status: {credentialConfigured ? "configured" : "not configured"}.
          </p>

          {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
          {state.success ? <div className="formSuccess" role="status">{state.success}</div> : null}

          <button className="btn primary" type="submit" disabled={pending}>
            {pending ? "Saving SMS..." : "Save SMS"}
          </button>
        </form>
      )}

      <div className="websiteChatInstall">
        <h3>Twilio webhook</h3>
        {webhookUrl ? (
          <pre className="embedSnippet"><code>{webhookUrl}</code></pre>
        ) : (
          <p className="muted">Configure NEXT_PUBLIC_APP_URL to display the webhook URL.</p>
        )}
        <p className="muted settingsDeliveryNote">
          Use this URL for the inbound message webhook and outbound status callback. Codeedge validates
          X-Twilio-Signature before any canonical message or delivery state is changed.
        </p>
      </div>
    </section>
  );
}
