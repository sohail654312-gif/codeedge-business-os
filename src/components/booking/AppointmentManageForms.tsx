"use client";

import { useActionState } from "react";
import {
  rescheduleAppointmentAction,
  updateAppointmentStatusAction,
  type BookingActionState,
} from "@/modules/booking/actions";
import {
  appointmentStatusLabels,
  appointmentTransitions,
  type AppointmentStatus,
} from "@/modules/booking/domain";
import { formatAppointmentDateTime } from "@/modules/booking/timezone";

const initialState: BookingActionState = {};

export function AppointmentStatusForm({
  appointmentId,
  currentStatus,
}: {
  appointmentId: string;
  currentStatus: AppointmentStatus;
}) {
  const [state, action, pending] = useActionState(
    updateAppointmentStatusAction,
    initialState,
  );
  const next = appointmentTransitions[currentStatus];

  if (!next.length) {
    return <p className="muted">This appointment is in a terminal state.</p>;
  }

  return (
    <form action={action} className="bookingStatusForm">
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <div className="field">
        <label htmlFor="appointment-status">Next status</label>
        <select id="appointment-status" name="status" required>
          {next.map((status) => (
            <option value={status} key={status}>{appointmentStatusLabels[status]}</option>
          ))}
        </select>
      </div>
      {state.error ? <div className="formError">{state.error}</div> : null}
      {state.success ? <div className="formSuccess">{state.success}</div> : null}
      <button className="btn" disabled={pending} type="submit">
        {pending ? "Updating..." : "Update status"}
      </button>
    </form>
  );
}

export function AppointmentRescheduleForm({
  appointmentId,
  slots,
  timeZone,
}: {
  appointmentId: string;
  slots: string[];
  timeZone: string;
}) {
  const [state, action, pending] = useActionState(
    rescheduleAppointmentAction,
    initialState,
  );

  if (!slots.length) {
    return <div className="noteEmpty">No alternative slots are available on this date.</div>;
  }

  return (
    <form action={action} className="bookingStatusForm">
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <div className="field">
        <label htmlFor="reschedule-slot">New time</label>
        <select id="reschedule-slot" name="starts_at" required>
          {slots.map((slot) => (
            <option value={slot} key={slot}>
              {formatAppointmentDateTime(slot, timeZone)}
            </option>
          ))}
        </select>
      </div>
      {state.error ? <div className="formError">{state.error}</div> : null}
      {state.success ? <div className="formSuccess">{state.success}</div> : null}
      <button className="btn primary" disabled={pending} type="submit">
        {pending ? "Rescheduling..." : "Reschedule"}
      </button>
    </form>
  );
}
