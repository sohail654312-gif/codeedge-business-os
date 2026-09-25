import { z } from "zod";
import { appointmentStatuses } from "./domain";

export const appointmentIdSchema = z.string().uuid();
export const bookingDateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  "Use a date in YYYY-MM-DD format.",
);
export const canonicalSlotSchema = z.string().datetime({ offset: true });

const optionalUuid = z.union([z.literal(""), z.string().uuid()])
  .transform((value) => value || null);

export const appointmentCreateSchema = z.object({
  service_id: z.string().uuid("Select an active Service."),
  lead_id: optionalUuid,
  customer_id: optionalUuid,
  contact_name: z.string().trim().min(1, "Contact name is required.").max(120),
  contact_email: z.union([
    z.literal(""),
    z.string().trim().email("Use a valid email address.").max(254),
  ]),
  contact_phone: z.string().trim().max(40),
  starts_at: canonicalSlotSchema,
  notes: z.string().trim().max(3000),
}).refine(
  (value) => value.contact_email !== "" || value.contact_phone !== "",
  { message: "Provide an email address or phone number." },
);

export const appointmentRescheduleSchema = z.object({
  appointment_id: appointmentIdSchema,
  starts_at: canonicalSlotSchema,
});

export const appointmentStatusSchema = z.object({
  appointment_id: appointmentIdSchema,
  status: z.enum(appointmentStatuses),
});
