import { describe, expect, it } from "vitest";
import {
  appointmentTransitions,
  canTransitionAppointment,
} from "@/modules/booking/domain";

describe("Appointment status transitions", () => {
  it("permits only the defined lifecycle", () => {
    expect(appointmentTransitions.pending).toEqual(["confirmed", "cancelled"]);
    expect(appointmentTransitions.confirmed).toEqual([
      "completed",
      "cancelled",
      "no_show",
    ]);
    expect(canTransitionAppointment("pending", "completed")).toBe(false);
    expect(canTransitionAppointment("confirmed", "no_show")).toBe(true);
    expect(canTransitionAppointment("cancelled", "confirmed")).toBe(false);
  });
});
