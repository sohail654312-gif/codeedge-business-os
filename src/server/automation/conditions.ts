import {
  type AutomationCondition,
  type AutomationEventPayload,
} from "./domain";

export function resolveAutomationPath(
  payload: AutomationEventPayload,
  path: string,
): unknown {
  let current: unknown = payload;
  for (const segment of path.split(".")) {
    if (
      !current
      || typeof current !== "object"
      || Array.isArray(current)
      || !(segment in current)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function evaluateAutomationCondition(
  payload: AutomationEventPayload,
  condition: AutomationCondition,
) {
  const actual = resolveAutomationPath(payload, condition.path);

  switch (condition.operator) {
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    case "not_exists":
      return actual === undefined || actual === null || actual === "";
    case "eq":
      return actual === condition.value;
    case "not_eq":
      return actual !== condition.value;
  }
}

export function evaluateAutomationConditions(
  payload: AutomationEventPayload,
  conditions: readonly AutomationCondition[],
) {
  return conditions.every((condition) =>
    evaluateAutomationCondition(payload, condition)
  );
}
