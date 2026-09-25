export const receptionistToolNames = [
  "business_knowledge",
  "appointment_availability",
  "get_appointment",
  "create_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "human_handoff",
] as const;

export type ReceptionistToolName = (typeof receptionistToolNames)[number];
