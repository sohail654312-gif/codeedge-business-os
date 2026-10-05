import "server-only";
import { parseEnvironment } from "./env";
import { restrictedDatabasePoolConnection } from "./db/restricted-capability";
export const readinessSettings = ["NEXT_PUBLIC_APP_URL","NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","CHAT_DATABASE_URL","COMMUNICATION_DATABASE_URL","AUTOMATION_RUNNER_SECRET"] as const;
export function configurationReady(env:Record<string,string|undefined>) {
  try {
    parseEnvironment(env);
    restrictedDatabasePoolConnection(env.CHAT_DATABASE_URL, "Chat", env.RESTRICTED_DATABASE_CA_CERT);
    restrictedDatabasePoolConnection(env.COMMUNICATION_DATABASE_URL, "Communication", env.RESTRICTED_DATABASE_CA_CERT);
    return Boolean(env.AUTOMATION_RUNNER_SECRET && env.AUTOMATION_RUNNER_SECRET.trim().length >= 32);
  } catch { return false; }
}
