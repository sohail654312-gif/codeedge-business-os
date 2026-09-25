import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { sendEmailReply } from "@/server/channels/email";
import { sendSmsReply } from "@/server/channels/sms";
import { sendWhatsAppReply } from "@/server/channels/whatsapp";
import { withAutomationCapability } from "./capability";
import { resolveAutomationPath } from "./conditions";
import {
  type AutomationAction,
  type AutomationRunContext,
} from "./domain";

type RetryClassification = "idempotent" | "safe_internal";

export type AutomationActionRegistration = {
  externalEffect: boolean;
  retry: RetryClassification;
};

export const automationActionRegistry = Object.freeze({
  "crm.update_lead_status": {
    externalEffect: false,
    retry: "safe_internal",
  },
  "communication.send_whatsapp": {
    externalEffect: true,
    retry: "idempotent",
  },
  "communication.send_email": {
    externalEffect: true,
    retry: "idempotent",
  },
  "communication.send_sms": {
    externalEffect: true,
    retry: "idempotent",
  },
  "internal.flag_conversation": {
    externalEffect: false,
    retry: "safe_internal",
  },
} satisfies Record<AutomationAction["type"], AutomationActionRegistration>);

function requiredUuid(context: AutomationRunContext, path: string) {
  return z.string().uuid().parse(resolveAutomationPath(context.payload, path));
}

export function deterministicAutomationRequestId(
  runId: string,
  actionIndex: number,
) {
  const digest = createHash("sha256")
    .update(`codeedge-automation:${runId}:${actionIndex}`)
    .digest();

  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export async function executeAutomationAction(
  context: AutomationRunContext,
  action: AutomationAction,
  actionIndex: number,
): Promise<Record<string, unknown>> {
  switch (action.type) {
    case "crm.update_lead_status": {
      const leadId = requiredUuid(context, action.leadIdPath);
      await withAutomationCapability(async (db) => {
        await db.query(
          "select public.automation_update_lead_status($1,$2,$3)",
          [context.runId, leadId, action.status],
        );
      });
      return { leadId, status: action.status };
    }

    case "internal.flag_conversation": {
      const conversationId = requiredUuid(context, action.conversationIdPath);
      await withAutomationCapability(async (db) => {
        await db.query(
          "select public.automation_flag_conversation($1,$2)",
          [context.runId, conversationId],
        );
      });
      return { conversationId, status: "pending" };
    }

    case "communication.send_whatsapp":
    case "communication.send_email":
    case "communication.send_sms": {
      const conversationId = requiredUuid(context, action.conversationIdPath);
      const requestId = deterministicAutomationRequestId(
        context.runId,
        actionIndex,
      );
      const input = {
        businessId: context.businessId,
        conversationId,
        userId: context.actorUserId,
        requestId,
        body: action.body,
      };

      const result = action.type === "communication.send_whatsapp"
        ? await sendWhatsAppReply(input)
        : action.type === "communication.send_email"
          ? await sendEmailReply(input)
          : await sendSmsReply(input);

      return {
        conversationId,
        requestId,
        messageId: result.messageId,
        status: result.status,
      };
    }
  }
}
