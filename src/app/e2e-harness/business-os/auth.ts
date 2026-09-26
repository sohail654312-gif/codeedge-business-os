import "server-only";

import { cookies } from "next/headers";
import {
  businessOsE2EFixtures,
  membershipFor,
  requireBusinessOsE2EHarness,
} from "./state";

const cookieName = "codeedge_business_os_e2e_user";

export type BusinessOsE2ETenant = {
  userId: string;
  businessId: string;
  role: "owner";
};

export async function signInBusinessOsE2E(
  email: string,
  password: string,
) {
  requireBusinessOsE2EHarness();

  if (email !== "owner@codeedge.test" || password !== "Test-only-pass!") {
    throw new Error("e2e_sign_in_failed");
  }

  const jar = await cookies();
  jar.set(cookieName, businessOsE2EFixtures.ownerA, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  });
}

export async function currentBusinessOsE2EUser() {
  requireBusinessOsE2EHarness();
  return (await cookies()).get(cookieName)?.value ?? null;
}

export async function requireBusinessOsE2ETenant(
  businessId: string = businessOsE2EFixtures.businessA,
): Promise<BusinessOsE2ETenant> {
  requireBusinessOsE2EHarness();
  const userId = await currentBusinessOsE2EUser();
  if (!userId) throw new Error("e2e_unauthenticated");

  const role = membershipFor(userId, businessId);
  if (!role) throw new Error("e2e_tenant_denied");

  return { userId, businessId, role };
}
