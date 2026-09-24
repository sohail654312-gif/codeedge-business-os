"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/server/db/client";
import { verifiedUser } from "@/server/authorization/tenant";
import { loginSchema } from "./validation";

export type AuthFormState = { error?: string };

export async function signIn(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email address and password." };
  }

  try {
    const client = await createClient();
    const { error } = await client.auth.signInWithPassword(parsed.data);
    if (error) {
      return { error: "Unable to sign in. Check your details and verify your email." };
    }

    await verifiedUser(client);
  } catch {
    return { error: "Sign-in is unavailable. Please try again shortly." };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const client = await createClient();
  await client.auth.signOut({ scope: "local" });
  redirect("/login");
}
