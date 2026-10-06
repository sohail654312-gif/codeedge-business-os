"use client";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <section className="panel" role="alert">
      <h1>Unable to load this workspace page</h1>
      <p className="muted">Try again. If the problem continues, return to the dashboard or check your connection.</p>
      <div className="row"><button className="btn primary" onClick={reset}>Try again</button><a className="btn" href="/dashboard">Back to dashboard</a></div>
    </section>
  );
}
