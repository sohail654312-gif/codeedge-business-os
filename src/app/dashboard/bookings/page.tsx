import Link from "next/link";
import { listAppointments } from "@/modules/booking/data";
import {
  appointmentStatusLabels,
} from "@/modules/booking/domain";
import { formatAppointmentDateTime } from "@/modules/booking/timezone";
import { requireDashboardTenant } from "@/server/auth/session";

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; lead?: string }>;
}) {
  const query = await searchParams;
  const { client, context } = await requireDashboardTenant();
  const appointments = await listAppointments(client, context.business.id, {
    customerId: query.customer ?? null,
    leadId: query.lead ?? null,
  });
  const upcoming = appointments.filter(
    (appointment) =>
      new Date(appointment.ends_at) >= new Date()
      && appointment.status !== "cancelled",
  );
  const history = appointments.filter(
    (appointment) =>
      new Date(appointment.ends_at) < new Date()
      || appointment.status === "cancelled",
  ).reverse();

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Manage Me</div>
          <h1>Booking / Appointments</h1>
          <p className="muted">
            Codeedge-native scheduling in {context.business.timezone}. External calendars are optional future rails.
            {query.customer || query.lead ? " Showing linked appointment history." : ""}
          </p>
        </div>
        <Link className="btn primary" href="/dashboard/bookings/new">New appointment</Link>
      </div>

      <section className="panel">
        <div className="settingsSectionHead">
          <div>
            <h2>Upcoming appointments</h2>
            <p className="muted">Internal Codeedge calendar agenda.</p>
          </div>
          <span className="pill">{upcoming.length} upcoming</span>
        </div>
        <div className="appointmentList">
          {upcoming.length ? upcoming.map((appointment) => (
            <Link className="appointmentCard" href={`/dashboard/bookings/${appointment.id}`} key={appointment.id}>
              <div>
                <b>{appointment.contact_name}</b>
                <div className="muted">{appointment.service_name ?? "Appointment"}</div>
              </div>
              <div>
                <b>{formatAppointmentDateTime(appointment.starts_at, appointment.timezone)}</b>
                <div className="muted">{appointment.timezone}</div>
              </div>
              <span className={"appointmentStatus appointmentStatus" + appointment.status}>
                {appointmentStatusLabels[appointment.status]}
              </span>
            </Link>
          )) : <div className="noteEmpty">No upcoming appointments.</div>}
        </div>
      </section>

      <section className="panel topGap">
        <div className="settingsSectionHead">
          <div><h2>History</h2><p className="muted">Completed, past and cancelled appointments.</p></div>
          <span className="pill">{history.length}</span>
        </div>
        <div className="appointmentList">
          {history.slice(0, 50).map((appointment) => (
            <Link className="appointmentCard" href={`/dashboard/bookings/${appointment.id}`} key={appointment.id}>
              <div>
                <b>{appointment.contact_name}</b>
                <div className="muted">{appointment.service_name ?? "Appointment"}</div>
              </div>
              <div>{formatAppointmentDateTime(appointment.starts_at, appointment.timezone)}</div>
              <span className={"appointmentStatus appointmentStatus" + appointment.status}>
                {appointmentStatusLabels[appointment.status]}
              </span>
            </Link>
          ))}
          {!history.length ? <div className="noteEmpty">No appointment history yet.</div> : null}
        </div>
      </section>
    </>
  );
}
