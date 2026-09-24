"use client";

import { useActionState } from "react";
import {
  saveWhatsAppSettings,
  type WhatsAppSettingsState,
} from "@/modules/whatsapp/actions";
import type { ChannelConnection } from "@/types/database";

const initialState: WhatsAppSettingsState = {};

export function WhatsAppSettingsPanel({
  connection,
  canEdit,
  appUrl,
}: {
  connection: ChannelConnection | null;
  canEdit: boolean;
  appUrl: string | null;
}) {
  const [state, action, pending] = useActionState(saveWhatsAppSettings, initialState);
  const webhookUrl = appUrl ? `${appUrl}/api/channels/whatsapp/meta/webhook` : null;

  return (
    <section className="panel topGap" id="whatsapp">
      <div className="settingsSectionHead">
        <div>
          <div className="eyebrow">Contact Me</div>
          <h2>WhatsApp</h2>
          <p className="muted">
            Meta WhatsApp Cloud API connected to the existing Codeedge Shared Inbox.
          </p>
        </div>
        <span className="pill">{connection?.enabled ? "Enabled" : "Disabled"}</span>
      </div>

      {!canEdit ? (
        <dl className="detailList">
          <div><dt>Provider</dt><dd>Meta WhatsApp Cloud API</dd></div>
          <div><dt>Phone number ID</dt><dd>{connection?.external_sender_id ?? "Not configured"}</dd></div>
          <div><dt>Display number</dt><dd>{connection?.display_address || "—"}</dd></div>
          <div><dt>Status</dt><dd>{connection?.enabled ? "Enabled" : "Disabled"}</dd></div>
        </dl>
      ) : (
        <form action={action} className="businessInfoForm">
          <div className="settingsToggleRow">
            <label className="checkField">
              <input type="checkbox" name="enabled" defaultChecked={connection?.enabled ?? false} />
              Enable WhatsApp channel
            </label>
          </div>

          <div className="profileGrid">
            <div className="field">
              <label htmlFor="whatsapp_sender_id">Phone number ID</label>
              <input
                id="whatsapp_sender_id"
                name="external_sender_id"
                inputMode="numeric"
                pattern="[0-9]{5,32}"
                maxLength={32}
                required
                defaultValue={connection?.external_sender_id ?? ""}
                placeholder="Meta phone number ID"
              />
            </div>

            <div className="field">
              <label htmlFor="whatsapp_account_id">WhatsApp Business Account ID</label>
              <input
                id="whatsapp_account_id"
                name="external_account_id"
                maxLength={255}
                defaultValue={connection?.external_account_id ?? ""}
                placeholder="Optional WABA ID"
              />
            </div>

            <div className="field">
              <label htmlFor="whatsapp_display_address">Display number</label>
              <input
                id="whatsapp_display_address"
                name="display_address"
                maxLength={120}
                defaultValue={connection?.display_address ?? ""}
                placeholder="+44…"
              />
            </div>

            <div className="field">
              <label htmlFor="whatsapp_credential_key">Server credential key</label>
              <input
                id="whatsapp_credential_key"
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
            The credential key is only an alias. Store the real Meta access token in the
            server-only WHATSAPP_META_CREDENTIALS_JSON environment variable, never in this form.
          </p>

          {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
          {state.success ? <div className="formSuccess" role="status">{state.success}</div> : null}

          <button className="btn primary" type="submit" disabled={pending}>
            {pending ? "Saving WhatsApp..." : "Save WhatsApp"}
          </button>
        </form>
      )}

      <div className="websiteChatInstall">
        <h3>Meta webhook</h3>
        {webhookUrl ? (
          <pre className="embedSnippet"><code>{webhookUrl}</code></pre>
        ) : (
          <p className="muted">Configure NEXT_PUBLIC_APP_URL to display the webhook URL.</p>
        )}
        <p className="muted settingsDeliveryNote">
          Configure Meta with the same server-only verify token used by Codeedge. Signed webhook
          events are verified before they can reach the canonical Conversation + Message core.
        </p>
      </div>
    </section>
  );
}
