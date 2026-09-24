import Link from "next/link";
import { Brand } from "@/components/Brand";
import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <main className="loginWrap">
      <div className="loginCard">
        <Brand />
        <h1>Create your workspace</h1>
        <p className="muted">
          Your account receives a new isolated CodeEdge business workspace. It cannot join an existing tenant through this form.
        </p>
        <SignupForm />
        <p className="authSwitch">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
