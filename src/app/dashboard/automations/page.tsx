import { AutomationWorkspace } from "@/components/automation/AutomationWorkspace";
import { requireDashboardTenant } from "@/server/auth/session";
import type { AutomationActionRun } from "@/types/database";

export default async function AutomationsPage() {
  const { client, context } = await requireDashboardTenant();

  const [workflowsResult, runsResult] = await Promise.all([
    client
      .from("automation_workflows")
      .select("*")
      .eq("business_id", context.business.id)
      .order("updated_at", { ascending: false }),
    client
      .from("automation_runs")
      .select("*")
      .eq("business_id", context.business.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (workflowsResult.error || runsResult.error) {
    throw new Error("Unable to load Automation.");
  }

  const runs = runsResult.data ?? [];
  let actionRuns: AutomationActionRun[] = [];
  if (runs.length > 0) {
    const result = await client
      .from("automation_action_runs")
      .select("*")
      .eq("business_id", context.business.id)
      .in("run_id", runs.map((run) => run.id))
      .order("action_index", { ascending: true });
    if (result.error) throw new Error("Unable to load Automation run history.");
    actionRuns = result.data ?? [];
  }

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Manage Me</div>
          <h1>Automations</h1>
          <p className="muted">Create focused workflows and inspect real execution history.</p>
        </div>
        <span className="pill">{context.business.execution_mode} workspace</span>
      </div>

      <AutomationWorkspace
        workflows={workflowsResult.data ?? []}
        runs={runs}
        actionRuns={actionRuns}
        role={context.role}
        executionMode={context.business.execution_mode}
      />
    </>
  );
}
