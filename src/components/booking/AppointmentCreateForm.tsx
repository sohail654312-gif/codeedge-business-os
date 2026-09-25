"use client";

import { useActionState } from "react";
import {
  createAppointmentAction,
  type BookingActionState,
} from "@/modules/booking/actions";
import type {
  BookingCustomer,
  BookingLead,
  BookingService,
} from "@/modules/booking/data";
import { formatAppointmentDateTime } from "@/modules/booking/timezone";

const initialState: BookingActionState = {};

export function AppointmentCreateForm({
  services,
  leads,
  customers,
  slots,
  selectedServiceId,
  selectedDate,
  timeZone,
}: {
  services: BookingService[];
  leads: BookingLead[];
  customers: BookingCustomer[];
  slots: string[];
  selectedServiceId: string;
  selectedDate: string;
  timeZone: string;
}) {
  const [state, action, pending] = useActionState(
    createAppointmentAction,
    initialState,
  );

  return (
    <div className="bookingCreateGrid">
      <section className="panel">
        <div className="settingsSectionHead">
          <div>
            <div className="eyebrow">Availability</div>
            <h2>Choose Service and date</h2>
            <p className="muted">
              Slots are calculated from Opening Hours and current appointments in {timeZone}.
            </p>
          </div>
        </div>
        <form method="get" className="bookingFilterForm">
          <div className="field">
            <label htmlFor="booking-service">Service</label>
            <select id="booking-service" name="service" defaultValue={selectedServiceId} required>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {service.duration_minutes} min
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="booking-date">Date</label>
            <input id="booking-date" name="date" type="date" value={selectedDate} readOnly />
          </div>
          <button className="btn" type="submit">Refresh slots</button>
        </form>
        <p className="muted formHelp">
          Change the date in the URL form below if needed; availability is rechecked again on submit.
        </p>
        <form method="get" className="bookingDateJump">
          <input type="hidden" name="service" value={selectedServiceId} />
          <div className="field">
            <label htmlFor="booking-date-jump">Check another date</label>
            <input id="booking-date-jump" name="date" type="date" defaultValue={selectedDate} required />
          </div>
          <button className="btn" type="submit">Check date</button>
        </form>
      </section>

      <section className="panel">
        <div className="settingsSectionHead">
          <div>
            <div className="eyebrow">Internal Codeedge Calendar</div>
            <h2>Create appointment</h2>
            <p className="muted">The appointment remains Codeedge-owned. No external calendar is required.</p>
          </div>
          <span className="pill">{slots.length} slots</span>
        </div>

        {services.length === 0 ? (
          <div className="noteEmpty">Create and activate a Service before booking appointments.</div>
        ) : slots.length === 0 ? (
          <div className="noteEmpty">No available slots for this Service and date.</div>
        ) : (
          <form action={action} className="businessInfoForm">
            <input type="hidden" name="service_id" value={selectedServiceId} />
            <div className="field">
              <label htmlFor="appointment-slot">Available time</label>
              <select id="appointment-slot" name="starts_at" required>
                {slots.map((slot) => (
                  <option value={slot} key={slot}>
                    {formatAppointmentDateTime(slot, timeZone)}
                  </option>
                ))}
              </select>
            </div>

            <div className="profileGrid">
              <div className="field">
                <label htmlFor="appointment-name">Contact name</label>
                <input id="appointment-name" name="contact_name" maxLength={120} required />
              </div>
              <div className="field">
                <label htmlFor="appointment-email">Email</label>
                <input id="appointment-email" name="contact_email" type="email" maxLength={254} />
              </div>
              <div className="field">
                <label htmlFor="appointment-phone">Phone</label>
                <input id="appointment-phone" name="contact_phone" type="tel" maxLength={40} />
              </div>
              <div className="field">
                <label htmlFor="appointment-lead">Link Lead (optional)</label>
                <select id="appointment-lead" name="lead_id" defaultValue="">
                  <option value="">No Lead</option>
                  {leads.map((lead) => (
                    <option value={lead.id} key={lead.id}>{lead.contact_name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="appointment-customer">Link Customer (optional)</label>
                <select id="appointment-customer" name="customer_id" defaultValue="">
                  <option value="">No Customer</option>
                  {customers.map((customer) => (
                    <option value={customer.id} key={customer.id}>{customer.contact_name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="appointment-notes">Internal notes</label>
              <textarea id="appointment-notes" name="notes" maxLength={3000} rows={4} />
            </div>
            {state.error ? <div className="formError">{state.error}</div> : null}
            <button className="btn primary" type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create appointment"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
