"use client";

import { useActionState, useEffect, useState } from "react";
import {
  approveAIProposalAction,
  rejectAIProposalAction,
  submitAIAccountantMessage,
  type AIAccountantActionState,
} from "@/modules/ai-accountant/actions";
import {
  financeAIActionLabels,
  type FinanceAIActionType,
} from "@/modules/ai-accountant/domain";
import type {
  AIActionProposalRecord,
  AIMessageRecord,
} from "@/server/ai/persistence";

const initialState: AIAccountantActionState = {};

const suggestions=[
  "Give me a finance summary.",
  "What invoices are outstanding?",
  "Which invoices are overdue?",
  "Explain my Profit & Loss.",
  "Summarize my expenses.",
  "What bills are due?",
  "Explain my cash flow.",
  "Show the biggest outstanding balances.",
];

function ProposalCard(input: {
  proposal: AIActionProposalRecord;
  owner: boolean;
}) {
  const [approveState,approveAction,approvePending]=useActionState(
    approveAIProposalAction,initialState,
  );
  const [rejectState,rejectAction,rejectPending]=useActionState(
    rejectAIProposalAction,initialState,
  );
  const localDone=Boolean(approveState.success || rejectState.success);
  const pending=input.proposal.status==="proposed" && !localDone;
  const label=financeAIActionLabels[
    input.proposal.action_type as FinanceAIActionType
  ] ?? input.proposal.action_type;

  return (
    <article className="aiProposalCard">
      <div className="aiProposalHead">
        <div>
          <span className="pill">Human approval required</span>
          <h3>{label}</h3>
        </div>
        <span className={"aiProposalStatus aiProposalStatus"+input.proposal.status}>
          {localDone ? "updated" : input.proposal.status}
        </span>
      </div>

      <dl className="aiProposalDetails">
        {Object.entries(input.proposal.payload).map(([key,value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value === null ? "—" : String(value)}</dd>
          </div>
        ))}
        <div><dt>Engine</dt><dd>{input.proposal.finance_engine}</dd></div>
        <div><dt>Mode</dt><dd>{input.proposal.execution_mode}</dd></div>
        <div><dt>Expires</dt><dd>{new Date(input.proposal.expires_at).toLocaleString()}</dd></div>
      </dl>

      {approveState.error ? <p className="formError">{approveState.error}</p> : null}
      {approveState.success ? <p className="formSuccess">{approveState.success}</p> : null}
      {rejectState.error ? <p className="formError">{rejectState.error}</p> : null}
      {rejectState.success ? <p className="formSuccess">{rejectState.success}</p> : null}

      {pending && input.owner ? (
        <div className="aiProposalActions">
          <form action={approveAction}>
            <input type="hidden" name="proposal_id" value={input.proposal.id} />
            <button className="btn" disabled={approvePending || rejectPending}>
              {approvePending ? "Approving…" : "Approve"}
            </button>
          </form>
          <form action={rejectAction}>
            <input type="hidden" name="proposal_id" value={input.proposal.id} />
            <button className="btn secondary" disabled={approvePending || rejectPending}>
              {rejectPending ? "Rejecting…" : "Reject"}
            </button>
          </form>
        </div>
      ) : pending ? (
        <p className="muted">An owner must review and approve this financial action.</p>
      ) : null}
    </article>
  );
}

export function AIAccountantPanel(input: {
  initialSessionId: string | null;
  initialMessages: AIMessageRecord[];
  initialProposals: AIActionProposalRecord[];
  engine: string;
  executionMode: string;
  currency: string;
  owner: boolean;
}) {
  const [state,action,pending]=useActionState(
    submitAIAccountantMessage,initialState,
  );
  const [prompt,setPrompt]=useState("");
  const sessionId=state.sessionId ?? input.initialSessionId ?? "";
  const messages=state.messages ?? input.initialMessages;
  const proposals=state.proposals ?? input.initialProposals;

  useEffect(() => {
    if (state.answer) setPrompt("");
  },[state.answer]);

  return (
    <div className="aiAccountantGrid">
      <section className="panel aiChatPanel">
        <div className="aiStatusRow">
          <div>
            <h2>AI Accountant</h2>
            <p className="muted">
              Grounded in Codeedge Money. Financial writes always require Codeedge approval.
            </p>
          </div>
          <div className="aiStatusPills">
            <span className="pill">{input.engine}</span>
            <span className="pill">{input.executionMode}</span>
            <span className="pill">{input.currency}</span>
          </div>
        </div>

        <div className="aiSuggestions">
          {suggestions.map((question) => (
            <button
              className="aiSuggestion"
              type="button"
              key={question}
              onClick={()=>setPrompt(question)}
            >
              {question}
            </button>
          ))}
        </div>

        <div className="aiConversation">
          {messages.length ? messages.map((message) => (
            <div
              className={"aiMessage aiMessage"+message.role}
              key={message.id}
            >
              <b>{message.role === "user" ? "You" : "Codeedge AI Accountant"}</b>
              <p>{message.content}</p>
            </div>
          )) : (
            <div className="aiEmpty">
              Ask about invoices, receivables, expenses, P&amp;L, Balance Sheet,
              Cash Flow or another supported Codeedge Money area.
            </div>
          )}
        </div>

        <form className="aiComposer" action={action}>
          <input type="hidden" name="session_id" value={sessionId} />
          <div className="field">
            <label htmlFor="ai-accountant-message">Finance question</label>
            <textarea
              id="ai-accountant-message"
              name="message"
              value={prompt}
              onChange={(event)=>setPrompt(event.target.value)}
              maxLength={4000}
              placeholder="e.g. Which invoices are overdue?"
              disabled={pending}
              required
            />
          </div>
          {state.error ? <p className="formError">{state.error}</p> : null}
          <button className="btn" disabled={pending || !prompt.trim()}>
            {pending ? "Checking Codeedge Finance…" : "Ask AI Accountant"}
          </button>
        </form>

        {state.evidence?.length ? (
          <div className="aiEvidence">
            <h3>Finance evidence used</h3>
            {state.evidence.map((item,index) => (
              <div className="aiEvidenceRow" key={(item.tool ?? "source")+index}>
                <b>{item.documentType ?? item.tool ?? "Finance data"}</b>
                <span>
                  {item.asOf ? "As of "+new Date(item.asOf).toLocaleString() : ""}
                  {item.currency ? " · "+item.currency : ""}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <aside className="aiProposalList">
        <section className="panel">
          <h2>Action proposals</h2>
          <p className="muted">
            A proposal is not an executed transaction. Codeedge revalidates it after approval.
          </p>
        </section>
        {proposals.length ? proposals.map((proposal) => (
          <ProposalCard proposal={proposal} owner={input.owner} key={proposal.id} />
        )) : (
          <section className="panel">
            <p className="muted">No financial action proposals in this session.</p>
          </section>
        )}
      </aside>
    </div>
  );
}
