export const appointmentStatuses = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type AppointmentStatus = (typeof appointmentStatuses)[number];

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const appointmentSources = [
  "staff",
  "website",
  "whatsapp",
  "email",
  "sms",
  "voice",
  "automation",
  "ai",
] as const;

export type AppointmentSource = (typeof appointmentSources)[number];

export const appointmentTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransitionAppointment(
  from: AppointmentStatus,
  to: AppointmentStatus,
) {
  return appointmentTransitions[from].includes(to);
}
