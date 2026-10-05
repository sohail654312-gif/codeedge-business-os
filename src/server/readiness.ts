import "server-only";
import { parseEnvironment } from "./env";
import { validateRestrictedDatabaseConnection } from "./db/restricted-capability";
export const readinessSettings = ["NEXT_PUBLIC_APP_URL","NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","CHAT_DATABASE_URL","COMMUNICATION_DATABASE_URL","AUTOMATION_RUNNER_SECRET"] as const;
export function configurationReady(env:Record<string,string|undefined>) {
  try {
    parseEnvironment(env);
    validateRestrictedDatabaseConnection(env.CHAT_DATABASE_URL);
    validateRestrictedDatabaseConnection(env.COMMUNICATION_DATABASE_URL);
    return Boolean(env.AUTOMATION_RUNNER_SECRET && env.AUTOMATION_RUNNER_SECRET.trim().length >= 32);
  } catch { return false; }
}
