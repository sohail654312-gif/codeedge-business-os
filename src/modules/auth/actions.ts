"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/server/db/client";
import { verifiedUser } from "@/server/authorization/tenant";
import { loginSchema, signupSchema } from "./validation";

export type AuthFormState = { error?: string; success?: string };

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

    try {
      await verifiedUser(client);
    } catch {
      await client.auth.signOut({ scope: "local" });
      return { error: "Unable to sign in. Check your details and verify your email." };
    }
  } catch {
    return { error: "Sign-in is unavailable. Please try again shortly." };
  }

  redirect("/dashboard");
}

export async function signUp(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    business_name: formData.get("business_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your signup details." };
  }

  try {
    const client = await createClient();
    const { data, error } = await client.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          codeedge_signup: true,
          business_name: parsed.data.business_name,
        },
      },
    });

    if (error) {
      return { error: "Unable to create the account. Check the details and try again." };
    }

    if (data.session) {
      redirect("/dashboard");
    }

    return {
      success: "Account created. Check your email to confirm your address, then sign in.",
    };
  } catch {
    return { error: "Signup is unavailable. Please try again shortly." };
  }
}

export async function signOut() {
  const client = await createClient();
  await client.auth.signOut({ scope: "local" });
  redirect("/login");
}
