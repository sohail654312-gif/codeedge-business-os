"use server";

import { revalidatePath } from "next/cache";
import {
  currentBusinessOsE2EUser,
  requireBusinessOsE2ETenant,
  signInBusinessOsE2E,
} from "./auth";
import {
  automationDemoDryRunJourney,
  convertLeadJourney,
  createBookingJourney,
  createLeadJourney,
  demoMoneyJourney,
  demoVoiceReceptionistJourney,
  safeCommunicationJourney,
} from "./service";
import {
  businessOsE2EFixtures,
  businessOsE2EPersistence,
  businessOsE2ESnapshot,
  resetBusinessOsE2EState,
} from "./state";

const path = "/e2e-harness/business-os";

export async function signInBusinessOsE2EAction(formData: FormData) {
  resetBusinessOsE2EState();
  await signInBusinessOsE2E(
    String(formData.get("email") ?? ""),
    String(formData.get("password") ?? ""),
  );
  revalidatePath(path);
}

export async function attemptCrossTenantE2EAction() {
  const userId = await currentBusinessOsE2EUser();
  if (!userId) throw new Error("e2e_unauthenticated");

  try {
    await requireBusinessOsE2ETenant(businessOsE2EFixtures.businessB);
    businessOsE2EPersistence.recordSecurityCheck(userId, "unexpected-access");
  } catch {
    businessOsE2EPersistence.recordSecurityCheck(userId, "denied");
  }
  revalidatePath(path);
}

export async function createLeadE2EAction() {
  createLeadJourney(await requireBusinessOsE2ETenant());
  revalidatePath(path);
}

export async function convertLeadE2EAction() {
  const context = await requireBusinessOsE2ETenant();
  const snapshot = businessOsE2ESnapshot(context.userId);
  if (snapshot.leadCount < 1) throw new Error("e2e_lead_required");
  convertLeadJourney(context, "lead-1");
  revalidatePath(path);
}

export async function createBookingE2EAction() {
  createBookingJourney(await requireBusinessOsE2ETenant());
  revalidatePath(path);
}

export async function communicationE2EAction() {
  safeCommunicationJourney(await requireBusinessOsE2ETenant());
  revalidatePath(path);
}

export async function automationE2EAction() {
  automationDemoDryRunJourney(await requireBusinessOsE2ETenant());
  revalidatePath(path);
}

export async function voiceE2EAction() {
  await demoVoiceReceptionistJourney(await requireBusinessOsE2ETenant());
  revalidatePath(path);
}

export async function moneyE2EAction() {
  demoMoneyJourney(await requireBusinessOsE2ETenant());
  revalidatePath(path);
}
