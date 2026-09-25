import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppointmentAction } from "@/modules/booking/actions";
import { createAppointmentAtSlot } from "@/modules/booking/service";
import { requireDashboardTenant } from "@/server/auth/session";
import { redirect } from "next/navigation";

vi.mock("@/server/auth/session", () => ({
  requireDashboardTenant: vi.fn(),
}));

vi.mock("@/modules/booking/service", () => ({
  createAppointmentAtSlot: vi.fn(),
  rescheduleAppointmentAtSlot: vi.fn(),
  changeAppointmentStatus: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

const businessId = "20000000-0000-4000-8000-000000000001";
const otherBusiness = "20000000-0000-4000-8000-000000000002";
const serviceId = "30000000-0000-4000-8000-000000000001";
const appointmentId = "90000000-0000-4000-8000-000000000001";

function form() {
  const value = new FormData();
  value.set("service_id", serviceId);
  value.set("lead_id", "");
  value.set("customer_id", "");
  value.set("contact_name", "Booking Contact");
  value.set("contact_email", "booking@example.test");
  value.set("contact_phone", "");
  value.set("starts_at", "2030-01-07T09:00:00.000Z");
  value.set("notes", "Internal");
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireDashboardTenant).mockResolvedValue({
    client: {},
    context: {
      userId: "10000000-0000-4000-8000-000000000003",
      role: "staff",
      business: {
        id: businessId,
        name: "Business A",
        slug: "business-a",
        status: "active",
        timezone: "Europe/London",
        execution_mode: "demo",
        created_at: "2026-09-24T00:00:00Z",
        updated_at: "2026-09-24T00:00:00Z",
      },
    },
  } as unknown as Awaited<ReturnType<typeof requireDashboardTenant>>);
  vi.mocked(createAppointmentAtSlot).mockResolvedValue(appointmentId);
});

describe("Booking dashboard actions", () => {
  it("derives tenant, source and execution context server-side", async () => {
    const value = form();
    value.set("business_id", otherBusiness);
    value.set("source", "ai");
    value.set("execution_mode", "production");
    value.set("provider", "google_calendar");

    await createAppointmentAction({}, value);

    expect(createAppointmentAtSlot).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        business: expect.objectContaining({
          id: businessId,
          execution_mode: "demo",
        }),
      }),
      serviceId,
      source: "staff",
    }));
    expect(createAppointmentAtSlot).not.toHaveBeenCalledWith(
      expect.objectContaining({ businessId: otherBusiness }),
    );
    expect(redirect).toHaveBeenCalledWith(`/dashboard/bookings/${appointmentId}`);
  });

  it("validates appointment input before resolving tenant state", async () => {
    const value = form();
    value.set("contact_name", "");

    await expect(createAppointmentAction({}, value)).resolves.toHaveProperty("error");
    expect(requireDashboardTenant).not.toHaveBeenCalled();
    expect(createAppointmentAtSlot).not.toHaveBeenCalled();
  });
});
