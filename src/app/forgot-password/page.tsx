import Link from "next/link";
import { Brand } from "@/components/Brand";
import { RecoveryEmailForm } from "@/components/auth/RecoveryForms";

export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ recovery?: string }> }) {
  const query = await searchParams;
  return <main className="loginWrap"><div className="loginCard">
    <Brand /><h1>Recover your account</h1><p className="muted">Request a secure link to set a new password.</p>
    {query.recovery === "invalid" ? <p className="formError" role="alert">This recovery link is invalid or expired. Request a new link.</p> : null}
    <RecoveryEmailForm /><p className="authSwitch"><Link href="/login">Back to sign in</Link></p>
  </div></main>;
}
