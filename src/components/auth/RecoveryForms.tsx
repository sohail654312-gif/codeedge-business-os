"use client";

import { useActionState } from "react";
import { requestPasswordRecovery, updateRecoveredPassword } from "@/modules/auth/recovery-actions";
import type { AuthFormState } from "@/modules/auth/actions";

const initial: AuthFormState = {};

export function RecoveryEmailForm() {
  const [state, action, pending] = useActionState(requestPasswordRecovery, initial);
  return <form action={action}>
    <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
    {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
    {state.success ? <p role="status">{state.success}</p> : null}
    <button className="btn primary full" type="submit" disabled={pending}>{pending ? "Requesting..." : "Send recovery link"}</button>
  </form>;
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updateRecoveredPassword, initial);
  return <form action={action}>
    <div className="field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required /></div>
    <div className="field"><label htmlFor="confirmation">Confirm new password</label><input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={256} required /></div>
    {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
    <button className="btn primary full" type="submit" disabled={pending}>{pending ? "Updating..." : "Set new password"}</button>
  </form>;
}
