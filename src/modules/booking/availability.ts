import type { AppointmentStatus } from "./domain";
import {
  isoWeekdayForLocalDate,
  zonedWallTimeToUtc,
} from "./timezone";

export type AvailabilityOpeningHours = {
  weekday: number;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
};

export type AvailabilityAppointment = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
};

export type AvailabilityInput = {
  date: string;
  timeZone: string;
  durationMinutes: number;
  openingHours: AvailabilityOpeningHours | null;
  appointments: AvailabilityAppointment[];
  excludeAppointmentId?: string | null;
  now?: Date;
};

function minutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function timeString(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function intervalsOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
) {
  return startA < endB && endA > startB;
}

export function calculateAvailableSlots(input: AvailabilityInput) {
  if (!Number.isInteger(input.durationMinutes)
      || input.durationMinutes < 5
      || input.durationMinutes > 480) {
    throw new Error("Invalid Service duration.");
  }

  const hours = input.openingHours;
  if (
    !hours
    || hours.is_closed
    || !hours.opens_at
    || !hours.closes_at
    || hours.weekday !== isoWeekdayForLocalDate(input.date)
  ) {
    return [];
  }

  const open = minutes(hours.opens_at);
  const close = minutes(hours.closes_at);
  if (open >= close) return [];

  const now = input.now ?? new Date();
  const blockers = input.appointments.filter(
    (appointment) =>
      appointment.id !== input.excludeAppointmentId
      && appointment.status !== "cancelled",
  );

  const result: string[] = [];
  for (
    let cursor = open;
    cursor + input.durationMinutes <= close;
    cursor += input.durationMinutes
  ) {
    let start: Date;
    try {
      start = zonedWallTimeToUtc(
        input.date,
        timeString(cursor),
        input.timeZone,
      );
    } catch {
      // DST gaps are not bookable wall-clock times.
      continue;
    }

    const end = new Date(start.getTime() + input.durationMinutes * 60_000);
    if (start <= now) continue;

    const conflict = blockers.some((appointment) =>
      intervalsOverlap(
        start,
        end,
        new Date(appointment.starts_at),
        new Date(appointment.ends_at),
      ),
    );
    if (!conflict) result.push(start.toISOString());
  }

  return result;
}
