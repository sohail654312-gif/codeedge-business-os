import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function Login() {
  return (
    <main className="loginWrap">
      <div className="loginCard">
        <Brand />
        <h1>Welcome back</h1>
        <p className="muted">Sign in to your CodeEdge workspace.</p>
        <div className="field">
          <label>Email</label>
          <input defaultValue="demo@codeedge.co.uk" />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" defaultValue="codeedge-demo" />
        </div>
        <Link href="/dashboard" className="btn primary full">Sign in</Link>
        <div className="demoHint">
          Demo only — authentication will be connected in the SaaS core phase.
        </div>
      </div>
    </main>
  );
}
