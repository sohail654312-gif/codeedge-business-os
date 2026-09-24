import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { visitorSessionTokenSchema } from "@/modules/website-chat/validation";

export function newVisitorSessionToken() {
  return randomBytes(32).toString("hex");
}

export function hashVisitorSessionToken(token: string) {
  const parsed = visitorSessionTokenSchema.parse(token);
  return createHash("sha256").update(parsed).digest("hex");
}
