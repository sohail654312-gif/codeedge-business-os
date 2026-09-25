import "server-only";

import type { AppointmentStatus } from "@/modules/booking/domain";
import type { CredentialEnvironment } from "@/types/database";

export type CalendarAppointmentSnapshot = {
  id: string;
  businessId: string;
  contactName: string;
  contactEmail: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  status: AppointmentStatus;
};

export type CalendarSyncResult = {
  externalEventId: string;
};

export interface CalendarProvider {
  readonly id: string;
  readonly environment: CredentialEnvironment;
  upsertAppointment(
    appointment: CalendarAppointmentSnapshot,
  ): Promise<CalendarSyncResult>;
  cancelAppointment(externalEventId: string): Promise<void>;
}

// Codeedge appointments remain the source of truth. Google/Microsoft adapters
// can implement this contract later and must be invoked only through the
// server execution context + External Effect Policy.
