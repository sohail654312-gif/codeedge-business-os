import { describe, expect, it } from "vitest";
import {
  calculateAvailableSlots,
  intervalsOverlap,
} from "@/modules/booking/availability";

const monday = {
  weekday: 1,
  is_closed: false,
  opens_at: "09:00:00",
  closes_at: "11:00:00",
};

describe("Booking availability", () => {
  it("generates Service-duration slots inside Opening Hours", () => {
    const slots = calculateAvailableSlots({
      date: "2026-09-28",
      timeZone: "Europe/London",
      durationMinutes: 30,
      openingHours: monday,
      appointments: [],
      now: new Date("2026-09-25T00:00:00Z"),
    });

    expect(slots).toEqual([
      "2026-09-28T08:00:00.000Z",
      "2026-09-28T08:30:00.000Z",
      "2026-09-28T09:00:00.000Z",
      "2026-09-28T09:30:00.000Z",
    ]);
  });

  it("removes overlapping active appointments but ignores cancelled ones", () => {
    const slots = calculateAvailableSlots({
      date: "2026-09-28",
      timeZone: "Europe/London",
      durationMinutes: 30,
      openingHours: monday,
      appointments: [
        {
          id: "90000000-0000-4000-8000-000000000001",
          starts_at: "2026-09-28T08:30:00.000Z",
          ends_at: "2026-09-28T09:00:00.000Z",
          status: "confirmed",
        },
        {
          id: "90000000-0000-4000-8000-000000000002",
          starts_at: "2026-09-28T09:00:00.000Z",
          ends_at: "2026-09-28T09:30:00.000Z",
          status: "cancelled",
        },
      ],
      now: new Date("2026-09-25T00:00:00Z"),
    });

    expect(slots).toEqual([
      "2026-09-28T08:00:00.000Z",
      "2026-09-28T09:00:00.000Z",
      "2026-09-28T09:30:00.000Z",
    ]);
  });

  it("returns no slots for closed or mismatched weekdays", () => {
    expect(calculateAvailableSlots({
      date: "2026-09-28",
      timeZone: "Europe/London",
      durationMinutes: 30,
      openingHours: { ...monday, is_closed: true, opens_at: null, closes_at: null },
      appointments: [],
      now: new Date("2026-09-25T00:00:00Z"),
    })).toEqual([]);

    expect(calculateAvailableSlots({
      date: "2026-09-29",
      timeZone: "Europe/London",
      durationMinutes: 30,
      openingHours: monday,
      appointments: [],
      now: new Date("2026-09-25T00:00:00Z"),
    })).toEqual([]);
  });

  it("skips nonexistent DST wall-clock slots instead of shifting them", () => {
    const slots = calculateAvailableSlots({
      date: "2026-03-29",
      timeZone: "Europe/London",
      durationMinutes: 30,
      openingHours: {
        weekday: 7,
        is_closed: false,
        opens_at: "00:00:00",
        closes_at: "04:00:00",
      },
      appointments: [],
      now: new Date("2026-03-20T00:00:00Z"),
    });

    expect(slots).not.toContain("2026-03-29T01:00:00.000Z");
    expect(slots.length).toBeGreaterThan(0);
  });

  it("uses half-open overlap rules", () => {
    expect(intervalsOverlap(
      new Date("2026-09-28T08:00:00Z"),
      new Date("2026-09-28T08:30:00Z"),
      new Date("2026-09-28T08:30:00Z"),
      new Date("2026-09-28T09:00:00Z"),
    )).toBe(false);
    expect(intervalsOverlap(
      new Date("2026-09-28T08:00:00Z"),
      new Date("2026-09-28T08:30:00Z"),
      new Date("2026-09-28T08:15:00Z"),
      new Date("2026-09-28T08:45:00Z"),
    )).toBe(true);
  });
});
