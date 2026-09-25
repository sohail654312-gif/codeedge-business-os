"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDashboardTenant } from "@/server/auth/session";
import { localDateFromInstant } from "@/modules/booking/timezone";
import {
  checkReceptionistAvailability,
  createReceptionistAppointment,
  loadReceptionistKnowledge,
} from "@/server/voice/receptionist-tools";
import { withVoiceCapability } from "@/server/voice/capability";

export type DemoReceptionistState = {
  error?: string;
  success?: string;
  conversationId?: string;
  appointmentId?: string;
};

const schema = z.object({
  contact_name: z.string().trim().min(1).max(120),
  contact_phone: z.string().trim().max(80),
  service_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }),
}).strict();

export async function runDemoReceptionist(
  _state: DemoReceptionistState,
  formData: FormData,
): Promise<DemoReceptionistState> {
  const parsed = schema.safeParse({
    contact_name: formData.get("contact_name"),
    contact_phone: formData.get("contact_phone"),
    service_id: formData.get("service_id"),
    starts_at: formData.get("starts_at"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Demo call details." };
  }

  const { client, context } = await requireDashboardTenant();
  if (context.business.execution_mode !== "demo") {
    return { error: "Demo Voice is available only in a Demo workspace." };
  }

  const knowledge = await loadReceptionistKnowledge({ client, tenant: context });
  const service = knowledge.services.find(
    (item) => item.id === parsed.data.service_id,
  );
  if (!service) return { error: "Service unavailable in this workspace." };

  const start = new Date(parsed.data.starts_at);
  const localDate = localDateFromInstant(start, context.business.timezone);
  const availability = await checkReceptionistAvailability(
    { client, tenant: context },
    { serviceId: service.id, date: localDate },
  );
  if (!availability.slots.includes(start.toISOString())) {
    return { error: "That appointment time is no longer available." };
  }

  const correlationId = randomUUID();
  const { data, error } = await client.rpc("voice_start_demo_call", {
    p_business_id: context.business.id,
    p_user_id: context.userId,
    p_correlation_id: correlationId,
    p_contact_name: parsed.data.contact_name,
    p_contact_phone: parsed.data.contact_phone,
  });
  const call = data?.[0];
  if (error || !call) {
    return { error: "Unable to start the Demo AI Receptionist call." };
  }

  const appointmentId = await createReceptionistAppointment(
    { client, tenant: context },
    {
      serviceId: service.id,
      leadId: call.lead_id,
      customerId: null,
      contactName: parsed.data.contact_name,
      contactEmail: "",
      contactPhone: parsed.data.contact_phone,
      startsAt: start.toISOString(),
      notes: "Created by Codeedge Demo AI Receptionist.",
    },
  );

  const timeText = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: context.business.timezone,
  }).format(start);

  await withVoiceCapability(async (db) => {
    await db.query(
      "select public.voice_append_transcript($1,$2,$3,$4)",
      [
        call.voice_call_id,
        `demo:${correlationId}:caller:0`,
        "caller",
        `I would like to book ${service.name}.`,
      ],
    );
    await db.query(
      "select public.voice_append_transcript($1,$2,$3,$4)",
      [
        call.voice_call_id,
        `demo:${correlationId}:assistant:0`,
        "assistant",
        `Your ${service.name} appointment is booked for ${timeText}.`,
      ],
    );
    await db.query(
      "select public.voice_complete_call($1,$2,$3,$4,$5)",
      [
        context.business.id,
        call.voice_call_id,
        `Caller booked ${service.name} for ${timeText}.`,
        "appointment_booked",
        false,
      ],
    );
  });

  revalidatePath("/dashboard/contact-me");
  revalidatePath("/dashboard/contact-me/voice");
  revalidatePath("/dashboard/bookings");
  revalidatePath(`/dashboard/buy-from-me/leads/${call.lead_id}`);

  return {
    success: "Demo AI Receptionist completed the booking with zero live telephony.",
    conversationId: call.conversation_id,
    appointmentId,
  };
}
