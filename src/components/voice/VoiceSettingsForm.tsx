"use client";

import { useActionState } from "react";
import {
  saveVoiceReceptionistSettings,
  type VoiceSettingsState,
} from "@/modules/voice/settings-actions";
import { receptionistToolNames } from "@/server/voice/receptionist";

const initialState: VoiceSettingsState = {};

export function VoiceSettingsForm({
  settings,
  role,
}: {
  settings: {
    enabled: boolean;
    greeting: string;
    provider: string;
    voice: string;
    preferred_language: string;
    allowed_tools: string[];
    handoff_behavior: "shared_inbox" | "message_only";
    additional_instructions: string;
  };
  role: "owner" | "staff";
}) {
  const [state, action, pending] = useActionState(
    saveVoiceReceptionistSettings,
    initialState,
  );
  const disabled = role !== "owner" || pending;

  return (
    <form action={action} className="panel">
      <h2>Receptionist settings</h2>
      <p className="muted">
        Canonical Codeedge configuration. Provider dashboards are adapters, not the business brain.
      </p>
      <label className="checkboxRow">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={settings.enabled}
          disabled={disabled}
        />
        Enable AI Receptionist
      </label>
      <div className="field">
        <label htmlFor="voice-greeting">Greeting</label>
        <input
          id="voice-greeting"
          name="greeting"
          defaultValue={settings.greeting}
          maxLength={500}
          required
          disabled={disabled}
        />
      </div>
      <div className="field">
        <label htmlFor="voice-provider">Provider adapter</label>
        <select
          id="voice-provider"
          name="provider"
          defaultValue={settings.provider}
          disabled={disabled}
        >
          <option value="demo_voice">Demo Voice</option>
          <option value="vapi">Vapi</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="voice-name">Provider voice name/ID</label>
        <input
          id="voice-name"
          name="voice"
          defaultValue={settings.voice}
          maxLength={120}
          disabled={disabled}
        />
      </div>
      <div className="field">
        <label htmlFor="voice-language">Preferred language</label>
        <input
          id="voice-language"
          name="preferred_language"
          defaultValue={settings.preferred_language}
          maxLength={30}
          disabled={disabled}
        />
      </div>
      <fieldset className="field">
        <legend>Allowed actions</legend>
        {receptionistToolNames.map((tool) => (
          <label className="checkboxRow" key={tool}>
            <input
              type="checkbox"
              name="allowed_tools"
              value={tool}
              defaultChecked={settings.allowed_tools.includes(tool)}
              disabled={disabled}
            />
            {tool.replaceAll("_", " ")}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="handoff-behavior">Handoff behavior</label>
        <select
          id="handoff-behavior"
          name="handoff_behavior"
          defaultValue={settings.handoff_behavior}
          disabled={disabled}
        >
          <option value="shared_inbox">Shared Inbox attention required</option>
          <option value="message_only">Store handoff message only</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="voice-extra">Additional safe instructions</label>
        <textarea
          id="voice-extra"
          name="additional_instructions"
          defaultValue={settings.additional_instructions}
          maxLength={2000}
          disabled={disabled}
        />
      </div>
      {state.error ? <p className="errorText">{state.error}</p> : null}
      {state.success ? <p>{state.success}</p> : null}
      {role === "owner" ? (
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Voice settings"}
        </button>
      ) : <p className="muted">Only an owner can change these settings.</p>}
    </form>
  );
}
