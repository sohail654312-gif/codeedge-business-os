import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { TenantContext } from "@/server/authorization/tenant";
import type { AppointmentSource, AppointmentStatus } from "./domain";
import { getAppointment, getBookingAvailability } from "./data";
import { localDateFromInstant } from "./timezone";

function rpcMessage(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (/no longer available|conflict/i.test(message)) {
    return "That appointment time is no longer available.";
  }
  if (/outside Opening Hours/i.test(message)) {
    return "That appointment time is outside Opening Hours.";
  }
  if (/Service unavailable/i.test(message)) {
    return "The selected Service is unavailable.";
  }
  if (/status transition/i.test(message)) {
    return "That appointment status change is not allowed.";
  }
  return fallback;
}

export async function createAppointmentAtSlot(input: {
  client: SupabaseClient<Database>;
  context: TenantContext;
  serviceId: string;
  leadId: string | null;
  customerId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  startsAt: string;
  source: AppointmentSource;
  notes: string;
}) {
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid appointment time.");

  const localDate = localDateFromInstant(start, input.context.business.timezone);
  const availability = await getBookingAvailability({
    client: input.client,
    businessId: input.context.business.id,
    businessTimeZone: input.context.business.timezone,
    date: localDate,
    serviceId: input.serviceId,
  });

  if (!availability.slots.includes(start.toISOString())) {
    throw new Error("That appointment time is no longer available.");
  }

  const end = new Date(
    start.getTime() + availability.service.duration_minutes * 60_000,
  );

  const { data, error } = await input.client.rpc("create_appointment", {
    p_business_id: input.context.business.id,
    p_lead_id: input.leadId,
    p_customer_id: input.customerId,
    p_service_id: input.serviceId,
    p_contact_name: input.contactName,
    p_contact_email: input.contactEmail,
    p_contact_phone: input.contactPhone,
    p_starts_at: start.toISOString(),
    p_ends_at: end.toISOString(),
    p_source: input.source,
    p_notes: input.notes,
  });

  if (error || !data) {
    throw new Error(rpcMessage(error, "Unable to create the appointment."));
  }
  return data;
}

export async function rescheduleAppointmentAtSlot(input: {
  client: SupabaseClient<Database>;
  context: TenantContext;
  appointmentId: string;
  startsAt: string;
}) {
  const appointment = await getAppointment(
    input.client,
    input.context.business.id,
    input.appointmentId,
  );
  if (!appointment) throw new Error("Appointment unavailable.");
  if (!appointment.service_id) {
    throw new Error("Appointment cannot be rescheduled without a Service.");
  }

  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid appointment time.");
  const localDate = localDateFromInstant(start, input.context.business.timezone);

  const availability = await getBookingAvailability({
    client: input.client,
    businessId: input.context.business.id,
    businessTimeZone: input.context.business.timezone,
    date: localDate,
    serviceId: appointment.service_id,
    excludeAppointmentId: appointment.id,
  });

  if (!availability.slots.includes(start.toISOString())) {
    throw new Error("That appointment time is no longer available.");
  }

  const end = new Date(
    start.getTime() + availability.service.duration_minutes * 60_000,
  );

  const { data, error } = await input.client.rpc("reschedule_appointment", {
    p_appointment_id: appointment.id,
    p_starts_at: start.toISOString(),
    p_ends_at: end.toISOString(),
  });

  if (error || !data) {
    throw new Error(rpcMessage(error, "Unable to reschedule the appointment."));
  }
  return data;
}

export async function changeAppointmentStatus(input: {
  client: SupabaseClient<Database>;
  context: TenantContext;
  appointmentId: string;
  status: AppointmentStatus;
}) {
  const appointment = await getAppointment(
    input.client,
    input.context.business.id,
    input.appointmentId,
  );
  if (!appointment) throw new Error("Appointment unavailable.");

  const { error } = await input.client.rpc("set_appointment_status", {
    p_appointment_id: appointment.id,
    p_status: input.status,
  });

  if (error) {
    throw new Error(rpcMessage(error, "Unable to update appointment status."));
  }
}
