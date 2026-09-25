import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  localDateBoundsUtc,
  localDateFromInstant,
  localTimeFromInstant,
  zonedWallTimeToUtc,
} from "@/modules/booking/timezone";

describe("Booking timezone helpers", () => {
  it("converts London wall time using the correct seasonal offset", () => {
    expect(zonedWallTimeToUtc("2026-01-15", "09:00", "Europe/London").toISOString())
      .toBe("2026-01-15T09:00:00.000Z");
    expect(zonedWallTimeToUtc("2026-07-15", "09:00", "Europe/London").toISOString())
      .toBe("2026-07-15T08:00:00.000Z");
  });

  it("rejects a nonexistent spring-forward wall time", () => {
    expect(() => zonedWallTimeToUtc(
      "2026-03-29",
      "01:30",
      "Europe/London",
    )).toThrow(/does not exist/i);
  });

  it("handles local date boundaries independently of machine timezone", () => {
    const instant = zonedWallTimeToUtc("2026-09-28", "00:00", "Asia/Karachi");
    expect(instant.toISOString()).toBe("2026-09-27T19:00:00.000Z");
    expect(localDateFromInstant(instant, "Asia/Karachi")).toBe("2026-09-28");
    expect(localTimeFromInstant(instant, "Asia/Karachi")).toBe("00:00");
  });

  it("builds DST-aware day bounds", () => {
    const bounds = localDateBoundsUtc("2026-03-29", "Europe/London");
    expect(bounds.start.toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-03-29T23:00:00.000Z");
    expect(addLocalDays("2026-03-29", 1)).toBe("2026-03-30");
  });
});
