"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/server/db/client";
import { verifiedUser } from "@/server/authorization/tenant";
import { getEnvironment } from "@/server/env";
import { recoveryEmailSchema, resetPasswordSchema } from "./validation";
import type { AuthFormState } from "./actions";

export async function requestPasswordRecovery(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = recoveryEmailSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return { error: "Enter a valid email address." };
  try {
    const client = await createClient();
    await client.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: new URL("/auth/confirm", getEnvironment().NEXT_PUBLIC_APP_URL).href,
    });
  } catch {
    // Keep the response identical for existing, missing and restricted accounts.
  }
  return { success: "If this address has an account, check its inbox for a recovery link. Requests may be rate limited; try again later if no email arrives." };
}

export async function updateRecoveredPassword(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({ password: form.get("password"), confirmation: form.get("confirmation") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your password." };
  try {
    const client = await createClient();
    await verifiedUser(client);
    const { error } = await client.auth.updateUser({ password: parsed.data.password });
    if (error) return { error: "Unable to update the password. Request a new recovery link and try again." };
    await client.auth.signOut({ scope: "local" });
  } catch {
    return { error: "Open a valid recovery link before setting a new password." };
  }
  redirect("/login?password=updated");
}
