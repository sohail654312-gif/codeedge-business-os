const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function formatter(timeZone: string) {
  if (!isValidTimeZone(timeZone)) throw new Error("Invalid business timezone.");
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  if (Number.isNaN(instant.getTime())) throw new Error("Invalid instant.");
  const values: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  let hour = Number(values.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour,
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function offsetMs(instant: Date, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    - instant.getTime();
}

export function localDateFromInstant(instant: Date, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function localTimeFromInstant(instant: Date, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function addLocalDays(date: string, days: number) {
  if (!datePattern.test(date)) throw new Error("Invalid local date.");
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export function isoWeekdayForLocalDate(date: string) {
  if (!datePattern.test(date)) throw new Error("Invalid local date.");
  const [year, month, day] = date.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function zonedWallTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
) {
  if (!datePattern.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Invalid local appointment time.");
  }
  if (!isValidTimeZone(timeZone)) throw new Error("Invalid business timezone.");

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = new Date(wallAsUtc);

  // Iterate offsets because converting a wall time can cross a DST boundary.
  for (let i = 0; i < 3; i += 1) {
    const next = new Date(wallAsUtc - offsetMs(candidate, timeZone));
    if (next.getTime() === candidate.getTime()) break;
    candidate = next;
  }

  // Spring-forward gaps do not represent a real instant. Fail instead of
  // silently moving the appointment to another wall-clock time.
  if (
    localDateFromInstant(candidate, timeZone) !== date
    || localTimeFromInstant(candidate, timeZone) !== time
  ) {
    throw new Error("That local time does not exist in the business timezone.");
  }

  return candidate;
}

export function localDateBoundsUtc(date: string, timeZone: string) {
  const start = zonedWallTimeToUtc(date, "00:00", timeZone);
  const end = zonedWallTimeToUtc(addLocalDays(date, 1), "00:00", timeZone);
  return { start, end };
}

export function formatAppointmentDateTime(
  value: string | Date,
  timeZone: string,
) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(typeof value === "string" ? new Date(value) : value);
}
