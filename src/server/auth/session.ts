import "server-only";
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

export async function requireDashboardTenant() {
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
