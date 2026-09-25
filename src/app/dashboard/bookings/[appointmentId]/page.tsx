import { notFound } from "next/navigation";
import {
  AppointmentRescheduleForm,
  AppointmentStatusForm,
} from "@/components/booking/AppointmentManageForms";
import {
  getAppointment,
  getBookingAvailability,
} from "@/modules/booking/data";
import { appointmentStatusLabels } from "@/modules/booking/domain";
import {
  formatAppointmentDateTime,
  localDateFromInstant,
} from "@/modules/booking/timezone";
import { bookingDateSchema } from "@/modules/booking/validation";
import { requireDashboardTenant } from "@/server/auth/session";

export default async function AppointmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ appointmentId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { appointmentId } = await params;
  const query = await searchParams;
  const { client, context } = await requireDashboardTenant();
  const appointment = await getAppointment(client, context.business.id, appointmentId);
  if (!appointment) notFound();

  const defaultDate = localDateFromInstant(
    new Date(appointment.starts_at),
    context.business.timezone,
  );
  const date = bookingDateSchema.safeParse(query.date).success
    ? query.date!
    : defaultDate;

  let slots: string[] = [];
  if (
    appointment.service_id
    && ["pending", "confirmed"].includes(appointment.status)
  ) {
    try {
      slots = (await getBookingAvailability({
        client,
        businessId: context.business.id,
        businessTimeZone: context.business.timezone,
        date,
        serviceId: appointment.service_id,
        excludeAppointmentId: appointment.id,
      })).slots;
    } catch {
      slots = [];
    }
  }

  return (
    <>
      <a className="backLink" href="/dashboard/bookings">← Back to appointments</a>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Appointment</div>
          <h1>{appointment.contact_name}</h1>
          <p className="muted">{appointment.service_name ?? "Internal Codeedge appointment"}</p>
        </div>
        <span className={"appointmentStatus appointmentStatus" + appointment.status}>
          {appointmentStatusLabels[appointment.status]}
        </span>
      </div>

      <div className="leadDetailGrid">
        <section className="panel">
          <h2>Appointment details</h2>
          <dl className="detailList">
            <div><dt>Starts</dt><dd>{formatAppointmentDateTime(appointment.starts_at, appointment.timezone)}</dd></div>
            <div><dt>Ends</dt><dd>{formatAppointmentDateTime(appointment.ends_at, appointment.timezone)}</dd></div>
            <div><dt>Timezone</dt><dd>{appointment.timezone}</dd></div>
            <div><dt>Service</dt><dd>{appointment.service_name ?? "—"}</dd></div>
            <div><dt>Email</dt><dd>{appointment.contact_email || "—"}</dd></div>
            <div><dt>Phone</dt><dd>{appointment.contact_phone || "—"}</dd></div>
            <div><dt>Source</dt><dd>{appointment.source}</dd></div>
            <div><dt>Workspace mode</dt><dd>{context.business.execution_mode}</dd></div>
          </dl>
          {appointment.notes ? <p className="leadSummaryText topGap">{appointment.notes}</p> : null}
        </section>

        <section className="panel">
          <h2>Status</h2>
          <AppointmentStatusForm
            appointmentId={appointment.id}
            currentStatus={appointment.status}
          />
          {appointment.lead_id ? (
            <a className="btn topGap" href={`/dashboard/buy-from-me/leads/${appointment.lead_id}`}>
              View linked Lead
            </a>
          ) : null}
        </section>
      </div>

      {["pending", "confirmed"].includes(appointment.status) && appointment.service_id ? (
        <section className="panel topGap">
          <div className="settingsSectionHead">
            <div>
              <h2>Reschedule</h2>
              <p className="muted">The slot is revalidated again in the database before the appointment moves.</p>
            </div>
          </div>
          <form method="get" className="bookingDateJump">
            <div className="field">
              <label htmlFor="reschedule-date">Date</label>
              <input id="reschedule-date" type="date" name="date" defaultValue={date} required />
            </div>
            <button className="btn" type="submit">Check date</button>
          </form>
          <AppointmentRescheduleForm
            appointmentId={appointment.id}
            slots={slots}
            timeZone={context.business.timezone}
          />
        </section>
      ) : null}
    </>
  );
}
