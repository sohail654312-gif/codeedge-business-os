import Link from "next/link";
import type { BusinessRole } from "@/types/database";

export function DashboardHeader({ businessName, role, executionMode }: {
  businessName: string;
  role: BusinessRole;
  executionMode: string;
}) {
  return (
    <header className="ceTopbar">
      <form className="ceSearch" action="/dashboard/buy-from-me/leads" method="get" role="search">
        <span aria-hidden="true">⌕</span>
        <input aria-label="Search leads" name="q" type="search" maxLength={120} placeholder="Search leads…" />
        <button className="ceSearchSubmit" type="submit">Search</button>
      </form>
      <div className="ceTopActions">
        <Link className="ceNewButton" href="/dashboard/buy-from-me/leads/new">+ New lead</Link>
        <span className="pill ceMode">{executionMode} mode</span>
        <div className="ceTopIdentity">
          <div className="ceTopAvatar" aria-hidden="true">{businessName.slice(0, 2).toUpperCase()}</div>
          <div><b>{businessName}</b><span>{role === "owner" ? "Owner" : "Staff"}</span></div>
        </div>
      </div>
    </header>
  );
}
