import { notFound } from "next/navigation";
import { AIAccountantPanel } from "@/components/money/AIAccountantPanel";
import {
  approveAIAccountantE2EAction,
  rejectAIAccountantE2EAction,
  submitAIAccountantE2EAction,
} from "./actions";
import {
  requireE2EHarness,
  snapshotAIAccountantE2EState,
} from "./state";

export const dynamic="force-dynamic";

export default function AIAccountantE2EPage() {
  try {
    requireE2EHarness();
  } catch {
    notFound();
  }

  const snapshot=snapshotAIAccountantE2EState();

  return (
    <main style={{ padding:"24px",maxWidth:"1400px",margin:"0 auto" }}>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Codeedge E2E Harness</div>
          <h1>AI Accountant</h1>
          <p className="muted">
            Deterministic browser coverage for the Demo Accountant approval UX.
          </p>
        </div>
        <div>
          <span className="pill">demo workspace</span>
          <span
            data-testid="finance-document-count"
            style={{ marginLeft:"8px" }}
          >
            Finance documents: {snapshot.financeDocumentCount}
          </span>
        </div>
      </div>

      <AIAccountantPanel
        initialSessionId={snapshot.messages.length ? snapshot.messages[0]!.session_id : null}
        initialMessages={snapshot.messages}
        initialProposals={snapshot.proposals}
        engine="demo_finance"
        executionMode="demo"
        currency="GBP"
        owner
        submitAction={submitAIAccountantE2EAction}
        approveAction={approveAIAccountantE2EAction}
        rejectAction={rejectAIAccountantE2EAction}
      />
    </main>
  );
}
