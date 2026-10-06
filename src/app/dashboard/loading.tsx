export default function DashboardLoading() {
  return (
    <section className="ceLoading" aria-busy="true" aria-label="Loading workspace">
      <p role="status" className="muted">Loading workspace…</p>
      <div className="ceLoadingCards" aria-hidden="true"><div /><div /><div /></div>
    </section>
  );
}
