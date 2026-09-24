import Link from "next/link";
import { getERPNextPublicStatus } from "@/integrations/erpnext";

export default function ERPNextSettingsPage() {
  const status = getERPNextPublicStatus();

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Integration</div>
          <h1>ERPNext</h1>
          <p className="muted">CodeEdge uses ERPNext as a replaceable back-office engine for finance and operations.</p>
        </div>
        <span className="pill">{status.configured ? "Configured" : "Not configured"}</span>
      </div>

      <div className="twoCol">
        <div className="panel">
          <h2>Connection</h2>
          <p className="muted">Base URL: {status.baseUrl ?? "Not set"}</p>
          <p className="muted">API credentials stay server-side and are never rendered in the browser.</p>
          <p>Status endpoint: <code>/api/integrations/erpnext/status</code></p>
        </div>

        <div className="panel">
          <h2>What ERPNext will power</h2>
          <p className="muted">Customers and contacts</p>
          <p className="muted">Leads and quotations</p>
          <p className="muted">Sales invoices and payments</p>
          <p className="muted">Suppliers and purchase documents</p>
          <p className="muted">Projects, tasks and selected operations</p>
        </div>
      </div>

      <div className="panel topGap">
        <h2>Integration principle</h2>
        <p className="muted">CodeEdge remains the client-facing product. ERPNext stays behind an adapter so it can be upgraded or replaced without redesigning the CodeEdge customer experience.</p>
        <Link className="btn" href="/dashboard/settings">Back to settings</Link>
      </div>
    </>
  );
}
