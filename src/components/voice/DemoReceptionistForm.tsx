"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  runDemoReceptionist,
  type DemoReceptionistState,
} from "@/modules/voice/demo-actions";

const initialState: DemoReceptionistState = {};

export function DemoReceptionistForm({
  serviceId,
  serviceName,
  slots,
  timeZone,
}: {
  serviceId: string;
  serviceName: string;
  slots: string[];
  timeZone: string;
}) {
  const [state, action, pending] = useActionState(
    runDemoReceptionist,
    initialState,
  );

  return (
    <form action={action} className="panel">
      <h2>Simulated caller</h2>
      <p className="muted">
        No real telephone call is placed. This exercises Codeedge CRM,
        Booking, transcript, Shared Inbox and call summary.
      </p>
      <input type="hidden" name="service_id" value={serviceId} />
      <div className="field">
        <label htmlFor="demo-contact-name">Caller name</label>
        <input
          id="demo-contact-name"
          name="contact_name"
          defaultValue="Demo Caller"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="demo-contact-phone">Caller phone</label>
        <input
          id="demo-contact-phone"
          name="contact_phone"
          defaultValue="+447700900999"
        />
      </div>
      <div className="field">
        <label htmlFor="demo-slot">{serviceName} appointment</label>
        <select id="demo-slot" name="starts_at" required defaultValue="">
          <option value="" disabled>Select an available slot</option>
          {slots.map((slot) => (
            <option value={slot} key={slot}>
              {new Intl.DateTimeFormat("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone,
              }).format(new Date(slot))}
            </option>
          ))}
        </select>
      </div>
      {state.error ? <p className="errorText">{state.error}</p> : null}
      {state.success ? (
        <div className="topGap">
          <p>{state.success}</p>
          {state.conversationId ? (
            <Link className="btn" href={`/dashboard/contact-me/${state.conversationId}`}>
              Open Shared Inbox conversation
            </Link>
          ) : null}
          {state.appointmentId ? (
            <Link className="btn" href={`/dashboard/bookings/${state.appointmentId}`}>
              Open appointment
            </Link>
          ) : null}
        </div>
      ) : null}
      <button className="btn primary topGap" type="submit" disabled={pending || !slots.length}>
        {pending ? "Running…" : "Run Demo AI Receptionist"}
      </button>
    </form>
  );
}
