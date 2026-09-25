"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDashboardTenant } from "@/server/auth/session";
import {
  appointmentCreateSchema,
  appointmentRescheduleSchema,
  appointmentStatusSchema,
} from "./validation";
import {
  changeAppointmentStatus,
  createAppointmentAtSlot,
  rescheduleAppointmentAtSlot,
} from "./service";

export type BookingActionState = {
  error?: string;
  success?: string;
};

function revalidateBooking(appointmentId?: string) {
  revalidatePath("/dashboard/bookings");
  if (appointmentId) revalidatePath(`/dashboard/bookings/${appointmentId}`);
}

export async function createAppointmentAction(
  _state: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const parsed = appointmentCreateSchema.safeParse({
    service_id: formData.get("service_id"),
    lead_id: formData.get("lead_id") ?? "",
    customer_id: formData.get("customer_id") ?? "",
    contact_name: formData.get("contact_name"),
    contact_email: formData.get("contact_email"),
    contact_phone: formData.get("contact_phone"),
    starts_at: formData.get("starts_at"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the appointment details." };
  }

  const { client, context } = await requireDashboardTenant();

  let appointmentId: string;
  try {
    appointmentId = await createAppointmentAtSlot({
      client,
      context,
      serviceId: parsed.data.service_id,
      leadId: parsed.data.lead_id,
      customerId: parsed.data.customer_id,
      contactName: parsed.data.contact_name,
      contactEmail: parsed.data.contact_email,
      contactPhone: parsed.data.contact_phone,
      startsAt: parsed.data.starts_at,
      source: "staff",
      notes: parsed.data.notes,
    });
  } catch (error) {
    if (error instanceof Error && error.message) return { error: error.message };
    return { error: "Unable to create the appointment." };
  }

  revalidateBooking(appointmentId);
  redirect(`/dashboard/bookings/${appointmentId}`);
}

export async function rescheduleAppointmentAction(
  _state: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const parsed = appointmentRescheduleSchema.safeParse({
    appointment_id: formData.get("appointment_id"),
    starts_at: formData.get("starts_at"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Select a valid appointment time." };
  }

  const { client, context } = await requireDashboardTenant();
  try {
    await rescheduleAppointmentAtSlot({
      client,
      context,
      appointmentId: parsed.data.appointment_id,
      startsAt: parsed.data.starts_at,
    });
    revalidateBooking(parsed.data.appointment_id);
    return { success: "Appointment rescheduled." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to reschedule the appointment." };
  }
}

export async function updateAppointmentStatusAction(
  _state: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const parsed = appointmentStatusSchema.safeParse({
    appointment_id: formData.get("appointment_id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "Select a valid appointment status." };

  const { client, context } = await requireDashboardTenant();
  try {
    await changeAppointmentStatus({
      client,
      context,
      appointmentId: parsed.data.appointment_id,
      status: parsed.data.status,
    });
    revalidateBooking(parsed.data.appointment_id);
    return { success: "Appointment status updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update appointment status." };
  }
}
