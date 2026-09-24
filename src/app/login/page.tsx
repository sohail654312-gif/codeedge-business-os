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
        <div className="demoHint">
          Access is checked against your active CodeEdge business membership.
        </div>
      </div>
    </main>
  );
}
