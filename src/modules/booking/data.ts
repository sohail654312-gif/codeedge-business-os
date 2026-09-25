import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Appointment,
  Customer,
  Database,
  Lead,
  Service,
} from "@/types/database";
import { calculateAvailableSlots } from "./availability";
import {
  isoWeekdayForLocalDate,
  localDateBoundsUtc,
} from "./timezone";

export type BookingService = Pick<
  Service,
  "id" | "name" | "active" | "duration_minutes"
>;

export type BookingLead = Pick<
  Lead,
  "id" | "contact_name" | "email" | "phone"
>;

export type BookingCustomer = Pick<
  Customer,
  "id" | "contact_name" | "email" | "phone" | "source_lead_id"
>;

export type AppointmentWithService = Appointment & {
  service_name: string | null;
};

async function serviceNameMap(
  client: SupabaseClient<Database>,
  businessId: string,
  serviceIds: Array<string | null>,
) {
  const ids = [...new Set(serviceIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map<string, string>();

  const { data, error } = await client
    .from("services")
    .select("id,name")
    .eq("business_id", businessId)
    .in("id", ids);

  if (error) throw new Error("Unable to load appointment Services.");
  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

export async function listAppointments(
  client: SupabaseClient<Database>,
  businessId: string,
): Promise<AppointmentWithService[]> {
  const { data, error } = await client
    .from("appointments")
    .select("*")
    .eq("business_id", businessId)
    .order("starts_at", { ascending: true });

  if (error) throw new Error("Unable to load appointments.");
  const rows = data ?? [];
  const names = await serviceNameMap(client, businessId, rows.map((row) => row.service_id));
  return rows.map((row) => ({
    ...row,
    service_name: row.service_id ? names.get(row.service_id) ?? null : null,
  }));
}

export async function getAppointment(
  client: SupabaseClient<Database>,
  businessId: string,
  appointmentId: string,
): Promise<AppointmentWithService | null> {
  const { data, error } = await client
    .from("appointments")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", appointmentId)
    .maybeSingle();

  if (error) throw new Error("Unable to load appointment.");
  if (!data) return null;

  let serviceName: string | null = null;
  if (data.service_id) {
    const { data: service, error: serviceError } = await client
      .from("services")
      .select("name")
      .eq("business_id", businessId)
      .eq("id", data.service_id)
      .maybeSingle();
    if (serviceError) throw new Error("Unable to load appointment Service.");
    serviceName = service?.name ?? null;
  }

  return { ...data, service_name: serviceName };
}

export async function listBookingServices(
  client: SupabaseClient<Database>,
  businessId: string,
): Promise<BookingService[]> {
  const { data, error } = await client
    .from("services")
    .select("id,name,active,duration_minutes")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error("Unable to load Booking Services.");
  return data ?? [];
}

export async function listBookingLeads(
  client: SupabaseClient<Database>,
  businessId: string,
): Promise<BookingLead[]> {
  const { data, error } = await client
    .from("leads")
    .select("id,contact_name,email,phone")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error("Unable to load Booking Leads.");
  return data ?? [];
}

export async function listBookingCustomers(
  client: SupabaseClient<Database>,
  businessId: string,
): Promise<BookingCustomer[]> {
  const { data, error } = await client
    .from("customers")
    .select("id,contact_name,email,phone,source_lead_id")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error("Unable to load Booking Customers.");
  return data ?? [];
}

export async function getBookingAvailability(input: {
  client: SupabaseClient<Database>;
  businessId: string;
  businessTimeZone: string;
  date: string;
  serviceId: string;
  excludeAppointmentId?: string | null;
  now?: Date;
}) {
  const { client, businessId, businessTimeZone, date, serviceId } = input;
  const { data: service, error: serviceError } = await client
    .from("services")
    .select("id,name,active,duration_minutes")
    .eq("business_id", businessId)
    .eq("id", serviceId)
    .eq("active", true)
    .maybeSingle();

  if (serviceError || !service) {
    throw new Error("Service unavailable for Booking.");
  }

  const weekday = isoWeekdayForLocalDate(date);
  const { data: hours, error: hoursError } = await client
    .from("opening_hours")
    .select("weekday,is_closed,opens_at,closes_at")
    .eq("business_id", businessId)
    .eq("weekday", weekday)
    .maybeSingle();

  if (hoursError) throw new Error("Unable to load Opening Hours.");

  const bounds = localDateBoundsUtc(date, businessTimeZone);
  const { data: appointments, error: appointmentError } = await client
    .from("appointments")
    .select("id,starts_at,ends_at,status")
    .eq("business_id", businessId)
    .lt("starts_at", bounds.end.toISOString())
    .gt("ends_at", bounds.start.toISOString());

  if (appointmentError) throw new Error("Unable to load appointment conflicts.");

  return {
    service,
    slots: calculateAvailableSlots({
      date,
      timeZone: businessTimeZone,
      durationMinutes: service.duration_minutes,
      openingHours: hours ?? null,
      appointments: appointments ?? [],
      excludeAppointmentId: input.excludeAppointmentId ?? null,
      now: input.now,
    }),
  };
}
