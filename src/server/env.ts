import "server-only";
import { z } from "zod";

function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function decodeJwtRole(value: string) {
  try {
    const payload = value.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(atob(padded)).role as string | undefined;
  } catch {
    return null;
  }
}

function publicSupabaseKey(value: string) {
  if (value.startsWith("sb_publishable_") && value.length > 25) return true;
  return decodeJwtRole(value) === "anon";
}

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().refine(safeHttpUrl, "Use HTTPS, or localhost for development."),
  NEXT_PUBLIC_SUPABASE_URL: z.string().refine(safeHttpUrl, "Use a valid Supabase URL."),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().refine(
    publicSupabaseKey,
    "Use a Supabase publishable/anon key, never a privileged secret key.",
  ),
});

export type SupabaseEnvironment = z.infer<typeof schema>;

export function parseEnvironment(input: Record<string, string | undefined>) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(
      `Invalid or missing environment settings: ${names.join(", ")}. See .env.example.`,
    );
  }
  return result.data;
}

export function getEnvironment() {
  return parseEnvironment({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function getEnvironmentIfConfigured(): SupabaseEnvironment | null {
  const input = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
  if (!Object.values(input).every(Boolean)) return null;
  return parseEnvironment(input);
}
