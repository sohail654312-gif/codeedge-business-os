import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { TenantContext } from "@/server/authorization/tenant";
import {
  getAppointment,
  getBookingAvailability,
} from "@/modules/booking/data";
import {
  changeAppointmentStatus,
  createAppointmentAtSlot,
  rescheduleAppointmentAtSlot,
} from "@/modules/booking/service";

const uuidSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instantSchema = z.string().datetime({ offset: true });
const contactNameSchema = z.string().trim().min(1).max(120);
const emailSchema = z.string().trim().max(254);
const phoneSchema = z.string().trim().max(80);
const noteSchema = z.string().trim().max(1000);

export type ReceptionistToolContext = {
  client: SupabaseClient<Database>;
  tenant: TenantContext;
};

export async function loadReceptionistKnowledge(
  context: ReceptionistToolContext,
) {
  const businessId = context.tenant.business.id;
  const [
    profile,
    services,
    serviceAreas,
    openingHours,
    faqs,
  ] = await Promise.all([
    context.client
      .from("business_profiles")
      .select("trading_name,phone,email,website,address,description,category")
      .eq("business_id", businessId)
      .maybeSingle(),
    context.client
      .from("services")
      .select("id,name,description,starting_price_pence,quote_required,duration_minutes")
      .eq("business_id", businessId)
      .eq("active", true)
      .order("display_order", { ascending: true }),
    context.client
      .from("service_areas")
      .select("name,postcode,notes")
      .eq("business_id", businessId)
      .eq("active", true)
      .order("display_order", { ascending: true }),
    context.client
      .from("opening_hours")
      .select("weekday,is_closed,opens_at,closes_at")
      .eq("business_id", businessId)
      .order("weekday", { ascending: true }),
    context.client
      .from("business_faqs")
      .select("id,question,answer")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
  ]);

  if (
    profile.error
    || services.error
    || serviceAreas.error
    || openingHours.error
    || faqs.error
  ) {
    throw new Error("Unable to load AI Receptionist business knowledge.");
  }

  return {
    business: {
      id: businessId,
      name: context.tenant.business.name,
      timezone: context.tenant.business.timezone,
      profile: profile.data,
    },
    services: services.data ?? [],
    serviceAreas: serviceAreas.data ?? [],
    openingHours: openingHours.data ?? [],
    faqs: faqs.data ?? [],
  };
}

export const availabilityToolSchema = z.object({
  serviceId: uuidSchema,
  date: dateSchema,
}).strict();

export async function checkReceptionistAvailability(
  context: ReceptionistToolContext,
  raw: unknown,
) {
  const input = availabilityToolSchema.parse(raw);
  return getBookingAvailability({
    client: context.client,
    businessId: context.tenant.business.id,
    businessTimeZone: context.tenant.business.timezone,
    date: input.date,
    serviceId: input.serviceId,
  });
}

export const createAppointmentToolSchema = z.object({
  serviceId: uuidSchema,
  leadId: uuidSchema.nullable().optional(),
  customerId: uuidSchema.nullable().optional(),
  contactName: contactNameSchema,
  contactEmail: emailSchema,
  contactPhone: phoneSchema,
  startsAt: instantSchema,
  notes: noteSchema.optional().default(""),
}).strict();

export async function createReceptionistAppointment(
  context: ReceptionistToolContext,
  raw: unknown,
) {
  const input = createAppointmentToolSchema.parse(raw);

  return createAppointmentAtSlot({
    client: context.client,
    context: context.tenant,
    serviceId: input.serviceId,
    leadId: input.leadId ?? null,
    customerId: input.customerId ?? null,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    startsAt: input.startsAt,
    source: "voice_ai",
    notes: input.notes,
  });
}

export const appointmentIdToolSchema = z.object({
  appointmentId: uuidSchema,
}).strict();

export const rescheduleAppointmentToolSchema = z.object({
  appointmentId: uuidSchema,
  startsAt: instantSchema,
}).strict();

async function requireTenantAppointment(
  context: ReceptionistToolContext,
  appointmentId: string,
) {
  const appointment = await getAppointment(
    context.client,
    context.tenant.business.id,
    appointmentId,
  );
  if (!appointment) throw new Error("Appointment unavailable.");
  return appointment;
}

export async function getReceptionistAppointment(
  context: ReceptionistToolContext,
  raw: unknown,
) {
  const input = appointmentIdToolSchema.parse(raw);
  return requireTenantAppointment(context, input.appointmentId);
}

export async function rescheduleReceptionistAppointment(
  context: ReceptionistToolContext,
  raw: unknown,
) {
  const input = rescheduleAppointmentToolSchema.parse(raw);
  await requireTenantAppointment(context, input.appointmentId);

  return rescheduleAppointmentAtSlot({
    client: context.client,
    context: context.tenant,
    appointmentId: input.appointmentId,
    startsAt: input.startsAt,
  });
}

export async function cancelReceptionistAppointment(
  context: ReceptionistToolContext,
  raw: unknown,
) {
  const input = appointmentIdToolSchema.parse(raw);
  await requireTenantAppointment(context, input.appointmentId);

  await changeAppointmentStatus({
    client: context.client,
    context: context.tenant,
    appointmentId: input.appointmentId,
    status: "cancelled",
  });

  return { appointmentId: input.appointmentId, status: "cancelled" as const };
}
