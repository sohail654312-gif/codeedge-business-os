"use client";

import { useActionState, useId } from "react";
import {
  createService,
  deleteService,
  saveBusinessProfile,
  updateService,
  type BusinessInformationState,
} from "@/modules/business-information/actions";
import type { BusinessProfile, Service } from "@/types/database";

const initialState: BusinessInformationState = {};

function Notice({ state }: { state: BusinessInformationState }) {
  return (
    <>
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
      {state.success ? <div className="formSuccess" role="status">{state.success}</div> : null}
    </>
  );
}

export function BusinessProfilePanel({
  profile,
  canEdit,
}: {
  profile: BusinessProfile | null;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(saveBusinessProfile, initialState);
  const prefix = useId();

  if (!canEdit) {
    return (
      <section className="panel topGap">
        <div className="settingsSectionHead">
          <div>
            <div className="eyebrow">Business Information</div>
            <h2>Business Profile</h2>
          </div>
          <span className="pill">Read only</span>
        </div>
        {profile ? (
          <dl className="detailList">
            <div><dt>Trading name</dt><dd>{profile.trading_name || "Not provided"}</dd></div>
            <div><dt>Category</dt><dd>{profile.category || "Not provided"}</dd></div>
            <div><dt>Phone</dt><dd>{profile.phone || "Not provided"}</dd></div>
            <div><dt>Email</dt><dd>{profile.email || "Not provided"}</dd></div>
            <div><dt>Website</dt><dd>{profile.website || "Not provided"}</dd></div>
            <div><dt>Address</dt><dd>{profile.address || "Not provided"}</dd></div>
            <div><dt>Description</dt><dd className="plainTextValue">{profile.description || "Not provided"}</dd></div>
          </dl>
        ) : <p className="muted">The owner has not completed the Business Profile yet.</p>}
      </section>
    );
  }

  return (
    <section className="panel topGap">
      <div className="settingsSectionHead">
        <div>
          <div className="eyebrow">Business Information</div>
          <h2>Business Profile</h2>
          <p className="muted">Core details that CodeEdge can reuse across customer-facing workflows.</p>
        </div>
        <span className="pill">Owner editable</span>
      </div>

      <form action={action} className="businessInfoForm">
        <div className="profileGrid">
          <div className="field">
            <label htmlFor={prefix + "-trading-name"}>Trading name</label>
            <input id={prefix + "-trading-name"} name="trading_name" maxLength={120} defaultValue={profile?.trading_name ?? ""} />
          </div>
          <div className="field">
            <label htmlFor={prefix + "-category"}>Primary category</label>
            <input id={prefix + "-category"} name="category" maxLength={120} defaultValue={profile?.category ?? ""} />
          </div>
          <div className="field">
            <label htmlFor={prefix + "-phone"}>Business phone</label>
            <input id={prefix + "-phone"} name="phone" type="tel" maxLength={40} autoComplete="tel" defaultValue={profile?.phone ?? ""} />
          </div>
          <div className="field">
            <label htmlFor={prefix + "-email"}>Business email</label>
            <input id={prefix + "-email"} name="email" type="email" maxLength={254} autoComplete="email" defaultValue={profile?.email ?? ""} />
          </div>
          <div className="field">
            <label htmlFor={prefix + "-website"}>Website (HTTPS)</label>
            <input id={prefix + "-website"} name="website" type="url" maxLength={2048} placeholder="https://example.com" defaultValue={profile?.website ?? ""} />
          </div>
          <div className="field">
            <label htmlFor={prefix + "-logo-alt"}>Logo description</label>
            <input id={prefix + "-logo-alt"} name="logo_alt" maxLength={120} defaultValue={profile?.logo_alt ?? ""} />
          </div>
        </div>

        <div className="field">
          <label htmlFor={prefix + "-address"}>Business address</label>
          <textarea id={prefix + "-address"} name="address" maxLength={500} rows={3} defaultValue={profile?.address ?? ""} />
        </div>
        <div className="field">
          <label htmlFor={prefix + "-description"}>Business description</label>
          <textarea id={prefix + "-description"} name="description" maxLength={3000} rows={5} defaultValue={profile?.description ?? ""} />
        </div>

        <p className="muted formHelp">Logo upload is intentionally outside this phase; only a safe plain-text description is stored.</p>
        <Notice state={state} />
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Saving Profile..." : "Save Business Profile"}
        </button>
      </form>
    </section>
  );
}

function ServiceForm({ service }: { service?: Service }) {
  const action = service ? updateService : createService;
  const [state, formAction, pending] = useActionState(action, initialState);
  const prefix = useId();

  return (
    <form action={formAction} className="businessInfoForm serviceEditor">
      {service ? <input type="hidden" name="service_id" value={service.id} /> : null}
      <div className="profileGrid">
        <div className="field">
          <label htmlFor={prefix + "-name"}>Service name</label>
          <input id={prefix + "-name"} name="name" minLength={2} maxLength={120} required defaultValue={service?.name ?? ""} />
        </div>
        <div className="field">
          <label htmlFor={prefix + "-price"}>Starting price (£)</label>
          <input
            id={prefix + "-price"}
            name="starting_price_gbp"
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            inputMode="decimal"
            defaultValue={service?.starting_price_pence == null ? "" : (service.starting_price_pence / 100).toFixed(2)}
          />
        </div>
        <div className="field">
          <label htmlFor={prefix + "-duration"}>Duration (minutes)</label>
          <input
            id={prefix + "-duration"}
            name="duration_minutes"
            type="number"
            min="5"
            max="480"
            step="5"
            required
            defaultValue={service?.duration_minutes ?? 30}
          />
        </div>
        <div className="field">
          <label htmlFor={prefix + "-order"}>Display order</label>
          <input id={prefix + "-order"} name="display_order" type="number" min="0" max="10000" step="1" required defaultValue={service?.display_order ?? 0} />
        </div>
        <div className="serviceChecks">
          <label className="checkField"><input type="checkbox" name="active" defaultChecked={service?.active ?? true} /> Active</label>
          <label className="checkField"><input type="checkbox" name="quote_required" defaultChecked={service?.quote_required ?? true} /> Quote required</label>
        </div>
      </div>
      <div className="field">
        <label htmlFor={prefix + "-description"}>Description</label>
        <textarea id={prefix + "-description"} name="description" maxLength={3000} rows={4} defaultValue={service?.description ?? ""} />
      </div>
      <Notice state={state} />
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving Service..." : service ? "Save Service" : "Create Service"}
      </button>
    </form>
  );
}

function DeleteServiceForm({ serviceId }: { serviceId: string }) {
  const [state, action, pending] = useActionState(deleteService, initialState);
  return (
    <form
      action={action}
      className="serviceDeleteForm"
      onSubmit={(event) => {
        if (!window.confirm("Delete this Service? Existing Leads will remain, but their Service link will be cleared.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="service_id" value={serviceId} />
      <Notice state={state} />
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Deleting..." : "Delete Service"}
      </button>
    </form>
  );
}

function formatPrice(value: number | null) {
  return value === null ? "No starting price" : `From £${(value / 100).toFixed(2)}`;
}

export function ServicesPanel({
  services,
  canEdit,
}: {
  services: Service[];
  canEdit: boolean;
}) {
  return (
    <section className="panel topGap">
      <div className="settingsSectionHead">
        <div>
          <div className="eyebrow">Business Information</div>
          <h2>Services</h2>
          <p className="muted">These Services are shared with the CRM so Leads can keep a tenant-safe Service relationship.</p>
        </div>
        <span className="pill">{services.length} {services.length === 1 ? "service" : "services"}</span>
      </div>

      <div className="serviceList">
        {services.length === 0 ? <div className="noteEmpty">No Services have been created yet.</div> : null}
        {services.map((service) => (
          <article className="businessServiceCard" key={service.id}>
            <div className="serviceCardHead">
              <div>
                <h3>{service.name}</h3>
                <div className="serviceMeta">
                  <span>{service.active ? "Active" : "Inactive"}</span>
                  <span>{service.quote_required ? "Quote required" : "Quote optional"}</span>
                  <span>{formatPrice(service.starting_price_pence)}</span>
                  <span>{service.duration_minutes} min</span>
                  <span>Order {service.display_order}</span>
                </div>
              </div>
            </div>
            <p className="plainTextValue">{service.description || "No description provided."}</p>
            {canEdit ? (
              <div className="serviceActions">
                <details>
                  <summary>Edit Service</summary>
                  <ServiceForm service={service} />
                </details>
                <DeleteServiceForm serviceId={service.id} />
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {canEdit ? (
        <details className="businessServiceCard addServiceCard">
          <summary>Add Service</summary>
          <ServiceForm />
        </details>
      ) : <p className="muted">Only the business owner can change Services.</p>}
    </section>
  );
}
