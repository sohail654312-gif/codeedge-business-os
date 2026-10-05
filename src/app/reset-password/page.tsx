import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { ResetPasswordForm } from "@/components/auth/RecoveryForms";
import { createClient } from "@/server/db/client";
import { verifiedUser } from "@/server/authorization/tenant";

export const dynamic = "force-dynamic";

export default async function ResetPassword() {
  const client = await createClient();
  try { await verifiedUser(client); } catch { redirect("/forgot-password?recovery=invalid"); }
  return <main className="loginWrap"><div className="loginCard">
    <Brand /><h1>Set a new password</h1><p className="muted">Use at least 12 characters. After saving, sign in with your new password.</p>
    <ResetPasswordForm />
  </div></main>;
}
