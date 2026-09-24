"use client";

import { useActionState, useId, useState } from "react";
import {
  createServiceArea,
  deleteServiceArea,
  saveOpeningHours,
  updateServiceArea,
  type ServiceCoverageState,
} from "@/modules/service-coverage/actions";
import { weekdays } from "@/modules/service-coverage/validation";
import type { OpeningHours, ServiceArea } from "@/types/database";

const initialState: ServiceCoverageState = {};

function Notice({ state }: { state: ServiceCoverageState }) {
  return (
    <>
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
      {state.success ? <div className="formSuccess" role="status">{state.success}</div> : null}
    </>
  );
}

function ServiceAreaForm({ area }: { area?: ServiceArea }) {
  const action = area ? updateServiceArea : createServiceArea;
  const [state, formAction, pending] = useActionState(action, initialState);
  const prefix = useId();

  return (
    <form action={formAction} className="businessInfoForm coverageEditor">
      {area ? <input type="hidden" name="service_area_id" value={area.id} /> : null}

      <div className="profileGrid">
        <div className="field">
          <label htmlFor={prefix + "-name"}>Area, town or city</label>
          <input
            id={prefix + "-name"}
            name="name"
            required
            minLength={2}
            maxLength={120}
            defaultValue={area?.name ?? ""}
          />
        </div>

        <div className="field">
          <label htmlFor={prefix + "-postcode"}>UK postcode or outward code</label>
          <input
            id={prefix + "-postcode"}
            name="postcode"
            maxLength={8}
            placeholder="SW1A or SW1A 1AA"
            defaultValue={area?.postcode ?? ""}
          />
        </div>

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
            defaultValue={area?.display_order ?? 0}
          />
        </div>

        <div className="serviceChecks">
          <label className="checkField">
            <input type="checkbox" name="active" defaultChecked={area?.active ?? true} />
            Active
          </label>
        </div>
      </div>

      <div className="field">
        <label htmlFor={prefix + "-notes"}>Coverage notes</label>
        <textarea
          id={prefix + "-notes"}
          name="notes"
          rows={3}
          maxLength={1000}
          defaultValue={area?.notes ?? ""}
        />
      </div>

      <p className="muted formHelp">
        Postcodes are optional UK coverage hints. They are validated for syntax only and are not treated as verified addresses.
      </p>
      <Notice state={state} />
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving Area..." : area ? "Save Service Area" : "Create Service Area"}
      </button>
    </form>
  );
}

function DeleteServiceAreaForm({ areaId }: { areaId: string }) {
  const [state, action, pending] = useActionState(deleteServiceArea, initialState);

  return (
    <form
      action={action}
      className="serviceDeleteForm"
      onSubmit={(event) => {
        if (!window.confirm("Delete this Service Area?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="service_area_id" value={areaId} />
      <Notice state={state} />
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Deleting..." : "Delete Service Area"}
      </button>
    </form>
  );
}

export function ServiceAreasPanel({
  areas,
  canEdit,
}: {
  areas: ServiceArea[];
  canEdit: boolean;
}) {
  return (
    <section className="panel topGap">
      <div className="settingsSectionHead">
        <div>
          <div className="eyebrow">Business Information</div>
          <h2>Service Areas</h2>
          <p className="muted">Define the towns, cities and UK postcode districts this workspace serves.</p>
        </div>
        <span className="pill">{areas.length} {areas.length === 1 ? "area" : "areas"}</span>
      </div>

      <div className="coverageList">
        {areas.length === 0 ? (
          <div className="coverageEmpty">
            <div className="emptyIcon">⌖</div>
            <h3>No Service Areas yet</h3>
            <p>Add the first area to describe where this business provides its services.</p>
          </div>
        ) : null}

        {areas.map((area) => (
          <article className="businessServiceCard" key={area.id}>
            <div className="serviceCardHead">
              <div>
                <h3>{area.name}</h3>
                <div className="serviceMeta">
                  <span>{area.active ? "Active" : "Inactive"}</span>
                  {area.postcode ? <span>{area.postcode}</span> : null}
                  <span>Order {area.display_order}</span>
                </div>
              </div>
            </div>

            <p className="plainTextValue">{area.notes || "No coverage notes provided."}</p>

            {canEdit ? (
              <div className="serviceActions">
                <details>
                  <summary>Edit Service Area</summary>
                  <ServiceAreaForm area={area} />
                </details>
                <DeleteServiceAreaForm areaId={area.id} />
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {canEdit ? (
        <details className="businessServiceCard addServiceCard">
          <summary>Add Service Area</summary>
          <ServiceAreaForm />
        </details>
      ) : <p className="muted">Only the business owner can change Service Areas.</p>}
    </section>
  );
}

function OpeningHoursForm({
  weekday,
  day,
  hours,
}: {
  weekday: number;
  day: string;
  hours?: OpeningHours;
}) {
  const [state, action, pending] = useActionState(saveOpeningHours, initialState);
  const [closed, setClosed] = useState(hours?.is_closed ?? true);
  const prefix = useId();

  return (
    <form action={action} className="openingHoursForm" aria-label={day + " opening hours"}>
      <input type="hidden" name="weekday" value={weekday} />

      <label className="checkField openingClosedCheck">
        <input
          type="checkbox"
          name="is_closed"
          checked={closed}
          onChange={(event) => setClosed(event.target.checked)}
        />
        Closed
      </label>

      <div className="field">
        <label htmlFor={prefix + "-opens"}>Opens</label>
        <input
          id={prefix + "-opens"}
          name="opens_at"
          type="time"
          step="60"
          required={!closed}
          disabled={closed}
          defaultValue={hours?.opens_at?.slice(0, 5) ?? "09:00"}
        />
      </div>

      <div className="field">
        <label htmlFor={prefix + "-closes"}>Closes</label>
        <input
          id={prefix + "-closes"}
          name="closes_at"
          type="time"
          step="60"
          required={!closed}
          disabled={closed}
          defaultValue={hours?.closes_at?.slice(0, 5) ?? "17:00"}
        />
      </div>

      <Notice state={state} />
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}

function hoursLabel(hours?: OpeningHours) {
  if (!hours) return "Not configured";
  if (hours.is_closed) return "Closed";
  return (hours.opens_at?.slice(0, 5) ?? "") + "–" + (hours.closes_at?.slice(0, 5) ?? "");
}

export function OpeningHoursPanel({
  hours,
  timezone,
  canEdit,
}: {
  hours: OpeningHours[];
  timezone: string;
  canEdit: boolean;
}) {
  return (
    <section className="panel topGap">
      <div className="settingsSectionHead">
        <div>
          <div className="eyebrow">Business Information</div>
          <h2>Opening Hours</h2>
          <p className="muted">
            Times are interpreted in {timezone}. One same-day interval per day is supported; overnight and holiday schedules are intentionally excluded for now.
          </p>
        </div>
        <span className="pill">Monday–Sunday</span>
      </div>

      <div className="openingHoursList">
        {weekdays.map((day, index) => {
          const weekday = index + 1;
          const entry = hours.find((value) => value.weekday === weekday);

          return (
            <article className="openingHoursRow" key={day}>
              <div className="openingHoursSummary">
                <b>{day}</b>
                <span className={entry?.is_closed ? "hoursClosed" : "muted"}>{hoursLabel(entry)}</span>
              </div>

              {canEdit ? (
                <details>
                  <summary>Edit {day}</summary>
                  <OpeningHoursForm
                    key={entry?.updated_at ?? "new-" + weekday}
                    weekday={weekday}
                    day={day}
                    hours={entry}
                  />
                </details>
              ) : null}
            </article>
          );
        })}
      </div>

      {!canEdit ? <p className="muted">Only the business owner can change Opening Hours.</p> : null}
    </section>
  );
}
