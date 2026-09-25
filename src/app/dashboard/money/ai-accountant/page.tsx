import Link from "next/link";
import { randomUUID } from "node:crypto";
import { AIAccountantPanel } from "@/components/money/AIAccountantPanel";
import { getAIAccountantHistory } from "@/modules/ai-accountant/data";
import { requireDashboardTenant } from "@/server/auth/session";
import { loadAIAccountantTrustedContext } from "@/server/ai/accountant/context";

export default async function AIAccountantPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const query=await searchParams;
  const { context }=await requireDashboardTenant();

  let accountantContext: Awaited<ReturnType<typeof loadAIAccountantTrustedContext>>;
  try {
    accountantContext=await loadAIAccountantTrustedContext({
      tenant:context,
      correlationId:randomUUID(),
    });
  } catch {
    return (
      <>
        <div className="pageHead">
          <div>
            <div className="eyebrow">Codeedge Money</div>
            <h1>AI Accountant</h1>
            <p className="muted">Grounded Finance assistance with human-approved actions.</p>
          </div>
        </div>
        <section className="panel">
          <h2>Finance connection required</h2>
          <p className="muted">
            Configure Codeedge Money first. AI Accountant never bypasses the Finance domain
            or connects directly to ERPNext.
          </p>
          <Link className="btn" href="/dashboard/money">Open Money Overview</Link>
        </section>
      </>
    );
  }

  const history=await getAIAccountantHistory({
    tenant:context,
    selectedSessionId:query.session ?? null,
  });

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Codeedge Money</div>
          <h1>AI Accountant</h1>
          <p className="muted">
            Ask grounded Finance questions and prepare human-approved financial actions.
          </p>
        </div>
        <span className="pill">{context.business.execution_mode} workspace</span>
      </div>

      {history.sessions.length ? (
        <section className="panel aiHistoryStrip">
          <div>
            <h2>Recent sessions</h2>
            <p className="muted">Only bounded Codeedge AI history is loaded into a model request.</p>
          </div>
          <div className="aiSessionLinks">
            <Link className="aiSessionLink" href="/dashboard/money/ai-accountant">
              New conversation
            </Link>
            {history.sessions.slice(0,6).map((session) => (
              <Link
                className={
                  "aiSessionLink"+
                  (history.sessionId===session.id ? " aiSessionLinkActive" : "")
                }
                href={"/dashboard/money/ai-accountant?session="+session.id}
                key={session.id}
              >
                {new Date(session.created_at).toLocaleString()}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="topGap">
        <AIAccountantPanel
          initialSessionId={history.sessionId}
          initialMessages={history.messages}
          initialProposals={history.proposals}
          engine={accountantContext.financeEngine}
          executionMode={accountantContext.executionMode}
          currency={accountantContext.defaultCurrency}
          owner={context.role==="owner"}
        />
      </div>
    </>
  );
}
