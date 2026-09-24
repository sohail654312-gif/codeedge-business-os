"use client";

import { useActionState } from "react";
import { signUp, type AuthFormState } from "@/modules/auth/actions";

const initialState: AuthFormState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initialState);

  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="business_name">Business name</label>
        <input id="business_name" name="business_name" maxLength={120} required />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" minLength={12} autoComplete="new-password" required />
      </div>
      <div className="field">
        <label htmlFor="confirmation">Confirm password</label>
        <input id="confirmation" name="confirmation" type="password" minLength={12} autoComplete="new-password" required />
      </div>
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
      {state.success ? <div className="formSuccess" role="status">{state.success}</div> : null}
      <button className="btn primary full" type="submit" disabled={pending || Boolean(state.success)}>
        {pending ? "Creating workspace..." : state.success ? "Check your email" : "Create workspace"}
      </button>
    </form>
  );
}
