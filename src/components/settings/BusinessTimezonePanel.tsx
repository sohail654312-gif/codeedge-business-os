"use client";

import { useActionState, useId } from "react";
import {
  saveBusinessTimezone,
  type SettingsState,
} from "@/modules/settings/actions";

const initialState: SettingsState = {};

export function BusinessTimezonePanel({
  timezone,
  canEdit,
}: {
  timezone: string;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(saveBusinessTimezone, initialState);
  const id = useId();

  return (
    <section className="panel topGap">
      <div className="settingsSectionHead">
        <div>
          <div className="eyebrow">Booking & scheduling</div>
          <h2>Business timezone</h2>
          <p className="muted">
            Booking availability and appointment times use this IANA timezone.
          </p>
        </div>
        <span className="pill">{canEdit ? "Owner editable" : "Read only"}</span>
      </div>

      {canEdit ? (
        <form action={action} className="businessInfoForm">
          <div className="field">
            <label htmlFor={id}>Timezone</label>
            <input
              id={id}
              name="timezone"
              required
              maxLength={100}
              defaultValue={timezone}
              placeholder="Europe/London"
              autoComplete="off"
            />
          </div>
          <p className="muted formHelp">
            Examples: Europe/London, Asia/Karachi, America/New_York.
          </p>
          {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
          {state.success ? <div className="formSuccess" role="status">{state.success}</div> : null}
          <button className="btn primary" type="submit" disabled={pending}>
            {pending ? "Saving timezone..." : "Save timezone"}
          </button>
        </form>
      ) : (
        <dl className="detailList">
          <div><dt>Timezone</dt><dd>{timezone}</dd></div>
        </dl>
      )}
    </section>
  );
}
