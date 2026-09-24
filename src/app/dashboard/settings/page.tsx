import Link from "next/link";

export default function Settings() {
  return <>
    <div className="pageHead"><div><div className="eyebrow">Workspace</div><h1>Settings</h1><p className="muted">ABC Plumbing & Heating Ltd</p></div></div>
    <div className="twoCol">
      <div className="panel">
        <h2>Business profile</h2>
        <p className="muted">Industry: Plumbing & Heating</p>
        <p className="muted">Country: United Kingdom</p>
        <p className="muted">Workspace type: Demo</p>
      </div>
      <div className="panel">
        <h2>Integration status</h2>
        <p><b>ERPNext</b> — adapter prepared</p>
        <p className="muted">Messaging adapter: Not connected</p>
        <p className="muted">Voice adapter: Demo mode</p>
        <Link className="btn" href="/dashboard/settings/erpnext">Open ERPNext setup</Link>
      </div>
    </div>
  </>;
}
