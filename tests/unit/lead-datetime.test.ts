import { describe, expect, it } from "vitest";
import { formatLeadDate, formatNoteDate } from "@/modules/buy-from-me/leads/data";

describe("Audit 3 CRM business timezone display", () => {
  it("shows summer and winter UTC instants in the configured business timezone", () => {
    expect(formatLeadDate("2026-07-15T08:00:00.000Z", "Europe/London")).toContain("09:00");
    expect(formatLeadDate("2026-01-15T08:00:00.000Z", "Europe/London")).toContain("08:00");
  });

  it("formats note timestamps consistently with Leads and is timezone-aware", () => {
    const value = "2026-09-27T19:15:00.000Z";
    expect(formatNoteDate(value, "Asia/Karachi")).toBe(formatLeadDate(value, "Asia/Karachi"));
    expect(formatNoteDate(value, "Asia/Karachi")).toContain("00:15");
  });

  it("keeps the missing last-contact state explicit", () => {
    expect(formatLeadDate(null, "Europe/London")).toBe("Not contacted");
  });

  it("rejects invalid workspace timezones rather than silently displaying UTC", () => {
    expect(() => formatNoteDate("2026-07-15T08:00:00.000Z", "Invalid/Zone")).toThrow();
  });
});
