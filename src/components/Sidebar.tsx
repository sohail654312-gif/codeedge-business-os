import Link from "next/link";
import { Brand } from "./Brand";
import { signOut } from "@/modules/auth/actions";
import type { BusinessRole } from "@/types/database";

const items = [
  ["⌂", "Command Centre", "/dashboard"],
  ["◎", "Find Me", "/dashboard/find-me"],
  ["☎", "Contact Me", "/dashboard/contact-me"],
  ["•", "AI Voice", "/dashboard/contact-me/voice"],
  ["↗", "Buy From Me", "/dashboard/buy-from-me"],
  ["•", "Customers", "/dashboard/buy-from-me/customers"],
  ["•", "Leads", "/dashboard/buy-from-me/leads"],
  ["◷", "Bookings", "/dashboard/bookings"],
  ["⚡", "Automations", "/dashboard/automations"],
  ["£", "Money", "/dashboard/money"],
  ["✓", "Manage Me", "/dashboard/manage-me"],
  ["✦", "Help Me Grow", "/dashboard/help-me-grow"],
];

export function Sidebar({
  businessName,
  role,
}: {
  businessName: string;
  role: BusinessRole;
}) {
  return (
    <aside className="sidebar">
      <Brand />
      <div className="workspaceIdentity">
        <b>{businessName}</b>
        <span>{role === "owner" ? "Owner" : "Staff"}</span>
      </div>
      <div className="navGroup">
        <div className="navLabel">Business OS</div>
        {items.map(([icon, label, href]) => (
          <Link className="navItem" key={href} href={href}>
            <span>{icon}</span><span>{label}</span>
          </Link>
        ))}
        <div className="navLabel">Workspace</div>
        <Link className="navItem" href="/dashboard/settings">⚙ Settings</Link>
        <form action={signOut}>
          <button className="navItem navButton" type="submit">↩ Sign out</button>
        </form>
      </div>
    </aside>
  );
}
