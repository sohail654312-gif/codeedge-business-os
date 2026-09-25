import "server-only";

import type { DeliveryStatus } from "@/modules/contact-me/conversations/domain";
import {
  ExternalEffectBlockedError,
  requireCommunicationExternalEffectAllowed,
} from "./execution";
import { ProviderDeliveryError } from "./provider";
import type { ExternalCommunicationChannel } from "./registry";

type PreparedExternalDelivery = {
  message_id: string;
  provider: string;
  delivery_status: DeliveryStatus;
  created: boolean;
};

type DispatchOptions<TResult> = {
  channel: ExternalCommunicationChannel;
  prepared: PreparedExternalDelivery;
  successfulExistingStatuses: readonly DeliveryStatus[];
  failedExistingStatuses: readonly DeliveryStatus[];
  previousFailureMessage: string;
  deliveryFailureMessage: string;
  send: () => Promise<TResult>;
  complete: (result: TResult) => Promise<void>;
  fail: (errorCode: string) => Promise<void>;
  statusFromResult: (result: TResult) => DeliveryStatus;
  providerRejected?: (result: TResult) => boolean;
};

async function bestEffortFailure(
  fail: (errorCode: string) => Promise<void>,
  code: string,
) {
  await fail(code).catch(() => undefined);
}

export async function dispatchPreparedExternalMessage<TResult>(
  options: DispatchOptions<TResult>,
) {
  const { prepared } = options;

  if (!prepared.created) {
    if (options.successfulExistingStatuses.includes(prepared.delivery_status)) {
      return {
        messageId: prepared.message_id,
        status: prepared.delivery_status,
      };
    }

    if (options.failedExistingStatuses.includes(prepared.delivery_status)) {
      throw new Error(options.previousFailureMessage);
    }

    // Existing in-flight/ambiguous requests are never automatically resent.
    return {
      messageId: prepared.message_id,
      status: prepared.delivery_status,
    };
  }

  try {
    await requireCommunicationExternalEffectAllowed(prepared.message_id, {
      channel: options.channel,
      provider: prepared.provider,
    });
  } catch (error) {
    const code = error instanceof ExternalEffectBlockedError
      ? error.code
      : "external_effect_invalid_context";
    await bestEffortFailure(options.fail, code);
    throw new Error(options.deliveryFailureMessage);
  }

  let result: TResult;
  try {
    result = await options.send();
  } catch (error) {
    const errorCode = error instanceof ProviderDeliveryError
      ? error.code
      : "provider_unavailable";
    await bestEffortFailure(options.fail, errorCode);
    throw new Error(options.deliveryFailureMessage);
  }

  try {
    await options.complete(result);
  } catch {
    // Provider acceptance may already have occurred. Keep the canonical request
    // in-flight rather than retrying and risking a duplicate external message.
    return { messageId: prepared.message_id, status: "sending" as const };
  }

  if (options.providerRejected?.(result)) {
    throw new Error(options.deliveryFailureMessage);
  }

  return {
    messageId: prepared.message_id,
    status: options.statusFromResult(result),
  };
}
