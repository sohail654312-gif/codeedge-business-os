import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getEnvironment } from "@/server/env";
import type { Database } from "@/types/database";

export function createWebsiteChatCapabilityClient() {
  const env = getEnvironment();

  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
