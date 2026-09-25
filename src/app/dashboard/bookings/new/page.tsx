import Link from "next/link";
import { AppointmentCreateForm } from "@/components/booking/AppointmentCreateForm";
import {
  getBookingAvailability,
  listBookingCustomers,
  listBookingLeads,
  listBookingServices,
} from "@/modules/booking/data";
import {
  localDateFromInstant,
} from "@/modules/booking/timezone";
import { bookingDateSchema } from "@/modules/booking/validation";
import { requireDashboardTenant } from "@/server/auth/session";

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; date?: string }>;
}) {
  const { client, context } = await requireDashboardTenant();
  const params = await searchParams;
  const [services, leads, customers] = await Promise.all([
    listBookingServices(client, context.business.id),
    listBookingLeads(client, context.business.id),
    listBookingCustomers(client, context.business.id),
  ]);

  const selectedService = services.some((service) => service.id === params.service)
    ? params.service!
    : services[0]?.id ?? "";
  const defaultDate = localDateFromInstant(new Date(), context.business.timezone);
  const date = bookingDateSchema.safeParse(params.date).success
    ? params.date!
    : defaultDate;

  let slots: string[] = [];
  if (selectedService) {
    try {
      slots = (await getBookingAvailability({
        client,
        businessId: context.business.id,
        businessTimeZone: context.business.timezone,
        date,
        serviceId: selectedService,
      })).slots;
    } catch {
      slots = [];
    }
  }

  return (
    <>
      <Link className="backLink" href="/dashboard/bookings">← Back to appointments</Link>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Booking</div>
          <h1>New appointment</h1>
          <p className="muted">Availability is calculated and revalidated server-side.</p>
        </div>
        <span className="pill">{context.business.execution_mode} workspace</span>
      </div>
      <AppointmentCreateForm
        services={services}
        leads={leads}
        customers={customers}
        slots={slots}
        selectedServiceId={selectedService}
        selectedDate={date}
        timeZone={context.business.timezone}
      />
    </>
  );
}
