import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/server/db/client";
import { AccessError, requireDefaultTenant, requireTenant, verifiedUser } from "@/server/authorization/tenant";

export async function requireSession() {
  const client = await createClient();
  try {
    return { client, user: await verifiedUser(client) };
  } catch (error) {
    if (error instanceof AccessError && error.status === 401) redirect("/login");
    throw error;
  }
}

const loadDashboardTenant = cache(async () => {
  const client = await createClient();
  try {
    return { client, context: await requireDefaultTenant(client) };
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.status === 401) redirect("/login");
      notFound();
    }
    throw error;
  }
});

export async function requireDashboardTenant() {
  return loadDashboardTenant();
}

export async function requireBusinessById(businessId: string) {
  const client = await createClient();
  try {
    return { client, context: await requireTenant(client, { id: businessId }) };
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.status === 401) redirect("/login");
      notFound();
    }
    throw error;
  }
}
