import { describe, expect, it } from "vitest";
import { formatLeadDate, formatNoteDate } from "@/modules/buy-from-me/leads/data";

describe("Lead business-timezone display", () => {
  it("formats Lead and note timestamps in the configured business timezone", () => {
    const instant = "2026-09-26T22:30:00.000Z";
    expect(formatLeadDate(instant, "Asia/Karachi")).toContain("27 Sept 2026");
    expect(formatNoteDate(instant, "Asia/Karachi")).toContain("27 Sept 2026");
    expect(formatLeadDate(instant, "UTC")).toContain("26 Sept 2026");
  });
});
