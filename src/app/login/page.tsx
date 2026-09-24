import Link from "next/link";
import { Brand } from "@/components/Brand";
import { LoginForm } from "@/components/auth/LoginForm";

export default function Login() {
  return (
    <main className="loginWrap">
      <div className="loginCard">
        <Brand />
        <h1>Welcome back</h1>
        <p className="muted">Sign in to your CodeEdge workspace.</p>
        <LoginForm />
        <p className="authSwitch">
          New to CodeEdge? <Link href="/signup">Create a workspace</Link>
        </p>
        <div className="demoHint">
          Access is checked against your active CodeEdge business membership.
        </div>
      </div>
    </main>
  );
}
