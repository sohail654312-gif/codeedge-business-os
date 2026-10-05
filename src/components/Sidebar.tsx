import Link from "next/link";
import { Brand } from "./Brand";
import { signOut } from "@/modules/auth/actions";
import type { BusinessRole } from "@/types/database";

const primaryItems = [
  ["▦", "Dashboard", "/dashboard"],
  ["↗", "Leads", "/dashboard/buy-from-me/leads"],
  ["◎", "Customers", "/dashboard/buy-from-me/customers"],
  ["◫", "Shared Inbox", "/dashboard/contact-me"],
  ["◷", "Bookings", "/dashboard/bookings"],
  ["⚡", "Automations", "/dashboard/automations"],
  ["£", "Money", "/dashboard/money"],
  ["◉", "AI Voice", "/dashboard/contact-me/voice"],
];

const secondaryItems = [
  ["⌁", "Find Me", "/dashboard/find-me"],
  ["✓", "Manage Me", "/dashboard/manage-me"],
  ["✦", "Help Me Grow", "/dashboard/help-me-grow"],
  ["⚙", "Settings", "/dashboard/settings"],
];

export function Sidebar({
  businessName,
  role,
}: {
  businessName: string;
  role: BusinessRole;
}) {
  return (
    <aside className="sidebar ceSidebar">
      <div className="ceSidebarBrand"><Brand /></div>

      <nav className="ceNav" aria-label="Business OS">
        <Link className="ceNavItem ceNavPrimary" href="/dashboard/buy-from-me">
          <span className="ceNavIcon">▦</span><span>CRM</span>
        </Link>

        <div className="ceNavSection">
          {primaryItems.map(([icon, label, href]) => (
            <Link className="ceNavItem" key={href} href={href}>
              <span className="ceNavIcon">{icon}</span><span>{label}</span>
            </Link>
          ))}
        </div>

        <div className="ceNavDivider" />

        <div className="ceNavSection">
          {secondaryItems.map(([icon, label, href]) => (
            <Link className="ceNavItem" key={href} href={href}>
              <span className="ceNavIcon">{icon}</span><span>{label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <div className="ceSidebarGrow">
        <div className="ceSidebarPromo">
          <div className="cePromoWave" />
          <b>Turn conversations into customers.</b>
          <p>A smarter, simpler Business OS for modern teams.</p>
          <Link className="cePromoButton" href="/dashboard/buy-from-me/leads/new">
            + New lead
          </Link>
        </div>
      </div>

      <div className="ceWorkspaceCard">
        <div className="ceWorkspaceAvatar">{businessName.slice(0, 2).toUpperCase()}</div>
        <div className="ceWorkspaceText">
          <b>{businessName}</b>
          <span>{role === "owner" ? "Workspace Owner" : "Workspace Staff"}</span>
        </div>
      </div>

      <form action={signOut}>
        <button className="ceSignOut" type="submit">↩ Sign out</button>
      </form>
    </aside>
  );
}
