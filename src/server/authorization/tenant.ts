import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Business, BusinessRole, Database } from "@/types/database";

export class AccessError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

export type TenantContext = {
  userId: string;
  business: Business;
  role: BusinessRole;
};

export async function verifiedUser(client: SupabaseClient<Database>): Promise<User> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || !data.user.email_confirmed_at) {
    throw new AccessError(401, "Sign in to continue.");
  }
  return data.user;
}

async function tenantForVerifiedUser(
  client: SupabaseClient<Database>,
  userId: string,
  selector: { id: string } | { slug: string },
): Promise<TenantContext> {
  const column = "id" in selector ? "id" : "slug";
  const value = "id" in selector ? selector.id : selector.slug;

  const { data: business, error: businessError } = await client
    .from("businesses")
    .select("id,name,slug,status,timezone,execution_mode,created_at,updated_at")
    .eq(column, value)
    .eq("status", "active")
    .maybeSingle();

  if (businessError) throw new Error("Unable to load business access.");
  if (!business) throw new AccessError(404, "Business unavailable.");

  const { data: membership, error: membershipError } = await client
    .from("business_memberships")
    .select("role")
    .eq("business_id", business.id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) throw new Error("Unable to verify business membership.");
  if (!membership) throw new AccessError(404, "Business unavailable.");

  return { userId, business, role: membership.role };
}

export async function requireTenant(
  client: SupabaseClient<Database>,
  selector: { id: string } | { slug: string },
): Promise<TenantContext> {
  const user = await verifiedUser(client);
  return tenantForVerifiedUser(client, user.id, selector);
}

export async function requireDefaultTenant(
  client: SupabaseClient<Database>,
): Promise<TenantContext> {
  const user = await verifiedUser(client);

  const { data: membership, error } = await client
    .from("business_memberships")
    .select("business_id,role,created_at")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("Unable to resolve workspace membership.");
  if (!membership) throw new AccessError(404, "No active workspace is available.");

  return tenantForVerifiedUser(client, user.id, { id: membership.business_id });
}

export function requireOwner(context: TenantContext) {
  if (context.role !== "owner") {
    throw new AccessError(403, "Only a business owner can perform this action.");
  }
}
