"use client";

import { useActionState, useState } from "react";
import {
  createAutomationWorkflow,
  setAutomationWorkflowEnabled,
  type AutomationFormState,
} from "@/modules/automation/actions";
import { automationTriggerTypes } from "@/server/automation/domain";
import type {
  AutomationActionRun,
  AutomationRun,
  AutomationWorkflow,
  ExecutionMode,
} from "@/types/database";

const initialState: AutomationFormState = {};

function Notice({ state }: { state: AutomationFormState }) {
  return (
    <>
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
      {state.success ? <div className="formSuccess" role="status">{state.success}</div> : null}
    </>
  );
}

function WorkflowToggle({ workflow }: { workflow: AutomationWorkflow }) {
  const [state, action, pending] = useActionState(setAutomationWorkflowEnabled, initialState);
  return (
    <form action={action}>
      <input type="hidden" name="workflow_id" value={workflow.id} />
      <input type="hidden" name="enabled" value={workflow.enabled ? "false" : "true"} />
      <Notice state={state} />
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Saving..." : workflow.enabled ? "Disable" : "Enable"}
      </button>
    </form>
  );
}

export function AutomationWorkspace({
  workflows,
  runs,
  actionRuns,
  role,
  executionMode,
}: {
  workflows: AutomationWorkflow[];
  runs: AutomationRun[];
  actionRuns: AutomationActionRun[];
  role: "owner" | "staff";
  executionMode: ExecutionMode;
}) {
  const [state, action, pending] = useActionState(createAutomationWorkflow, initialState);
  const [actionType, setActionType] = useState("crm.update_lead_status");
  const [conditionOperator, setConditionOperator] = useState("eq");
  const runActions = new Map<string, AutomationActionRun[]>();
  for (const row of actionRuns) {
    runActions.set(row.run_id, [...(runActions.get(row.run_id) ?? []), row]);
  }
  const workflowNames = new Map(workflows.map((workflow) => [workflow.id, workflow.name]));

  return (
    <>
      <section className="panel">
        <div className="settingsSectionHead">
          <div>
            <div className="eyebrow">Codeedge Automation</div>
            <h2>Workflow builder</h2>
            <p className="muted">
              Create focused trigger → condition → action workflows using the existing Codeedge domains.
            </p>
          </div>
          <span className="pill">{executionMode} mode</span>
        </div>

        {executionMode === "demo" ? (
          <p className="muted formHelp">
            Demo mode executes safe internal actions and records external messaging actions as simulated dry-runs.
          </p>
        ) : null}

        {role === "owner" ? (
          <form action={action} className="businessInfoForm">
            <div className="profileGrid">
              <div className="field">
                <label htmlFor="automation-name">Workflow name</label>
                <input id="automation-name" name="name" required maxLength={120} />
              </div>
              <div className="field">
                <label htmlFor="automation-trigger">Trigger</label>
                <select id="automation-trigger" name="trigger_type" defaultValue="lead.created">
                  {automationTriggerTypes.map((trigger) => (
                    <option value={trigger} key={trigger}>{trigger}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="automation-description">Description</label>
              <input id="automation-description" name="description" maxLength={1000} />
            </div>

            <details className="businessServiceCard">
              <summary>Optional condition</summary>
              <div className="profileGrid">
                <div className="field">
                  <label htmlFor="condition-path">Payload path</label>
                  <input id="condition-path" name="condition_path" maxLength={120} placeholder="lead.status" />
                </div>
                <div className="field">
                  <label htmlFor="condition-operator">Operator</label>
                  <select
                    id="condition-operator"
                    name="condition_operator"
                    value={conditionOperator}
                    onChange={(event) => setConditionOperator(event.target.value)}
                  >
                    <option value="eq">equals</option>
                    <option value="not_eq">does not equal</option>
                    <option value="exists">exists</option>
                    <option value="not_exists">does not exist</option>
                  </select>
                </div>
              </div>
              {conditionOperator === "exists" || conditionOperator === "not_exists" ? null : (
                <div className="field">
                  <label htmlFor="condition-value">Value</label>
                  <input id="condition-value" name="condition_value" maxLength={500} />
                </div>
              )}
            </details>

            <div className="field">
              <label htmlFor="automation-action">Action</label>
              <select
                id="automation-action"
                name="action_type"
                value={actionType}
                onChange={(event) => setActionType(event.target.value)}
              >
                <option value="crm.update_lead_status">Update lead status</option>
                <option value="communication.send_whatsapp">Send WhatsApp reply</option>
                <option value="communication.send_email">Send email reply</option>
                <option value="communication.send_sms">Send SMS reply</option>
                <option value="internal.flag_conversation">Flag conversation</option>
              </select>
            </div>

            {actionType === "crm.update_lead_status" ? (
              <div className="profileGrid">
                <div className="field">
                  <label htmlFor="lead-id-path">Lead ID path</label>
                  <input id="lead-id-path" name="lead_id_path" defaultValue="lead.id" required />
                </div>
                <div className="field">
                  <label htmlFor="lead-status">New status</label>
                  <select id="lead-status" name="lead_status" defaultValue="contacted">
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="conversation-id-path">Conversation ID path</label>
                <input id="conversation-id-path" name="conversation_id_path" defaultValue="conversation.id" required />
              </div>
            )}

            {actionType.startsWith("communication.") ? (
              <div className="field">
                <label htmlFor="message-body">Message</label>
                <textarea id="message-body" name="message_body" required maxLength={4000} rows={4} />
              </div>
            ) : null}

            <label className="checkField">
              <input type="checkbox" name="enabled" defaultChecked />
              Enable immediately
            </label>

            <Notice state={state} />
            <button className="btn primary" type="submit" disabled={pending}>
              {pending ? "Creating workflow..." : "Create workflow"}
            </button>
          </form>
        ) : (
          <p className="muted">Staff can review Automation workflows and runs; only owners can change them.</p>
        )}
      </section>

      <section className="panel topGap">
        <div className="settingsSectionHead">
          <div><h2>Workflows</h2><p className="muted">Current tenant-owned Automation definitions.</p></div>
          <span className="pill">{workflows.length} total</span>
        </div>
        <div className="serviceList">
          {workflows.length === 0 ? (
            <div className="coverageEmpty"><div className="emptyIcon">⚡</div><h3>No workflows yet</h3><p>Create the first V1 Automation workflow above.</p></div>
          ) : workflows.map((workflow) => (
            <article className="businessServiceCard" key={workflow.id}>
              <div className="serviceCardHead">
                <div>
                  <h3>{workflow.name}</h3>
                  <div className="serviceMeta">
                    <span>{workflow.enabled ? "Enabled" : "Disabled"}</span>
                    <span>{workflow.trigger_type}</span>
                    <span>v{workflow.version}</span>
                  </div>
                </div>
                {role === "owner" ? <WorkflowToggle workflow={workflow} /> : null}
              </div>
              {workflow.description ? <p className="plainTextValue">{workflow.description}</p> : null}
              <p className="muted formHelp">Conditions: {JSON.stringify(workflow.conditions)}</p>
              <p className="muted formHelp">Actions: {JSON.stringify(workflow.actions)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel topGap">
        <div className="settingsSectionHead">
          <div><h2>Recent runs</h2><p className="muted">Run status and dry-run/action outcomes from the existing Automation Engine.</p></div>
          <span className="pill">{runs.length} shown</span>
        </div>
        <div className="serviceList">
          {runs.length === 0 ? (
            <div className="coverageEmpty"><h3>No Automation runs yet</h3><p>Runs appear after a matching trusted Codeedge domain event occurs.</p></div>
          ) : runs.map((run) => (
            <article className="businessServiceCard" key={run.id}>
              <div className="serviceCardHead">
                <div>
                  <h3>{workflowNames.get(run.workflow_id) ?? "Workflow run"}</h3>
                  <div className="serviceMeta">
                    <span>{run.status}</span>
                    <span>{run.execution_mode}</span>
                    <span>{run.attempts} attempt{run.attempts === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <span className="muted">{new Date(run.created_at).toLocaleString()}</span>
              </div>
              {(runActions.get(run.id) ?? []).map((item) => (
                <div className="customerMiniRow" key={item.id}>
                  <div><b>{item.action_type}</b><div className="muted">{item.external_effect ? "External effect" : "Internal action"}</div></div>
                  <span className="pill">{item.status}</span>
                </div>
              ))}
              {run.error_code ? <div className="formError">Run error: {run.error_code}</div> : null}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
