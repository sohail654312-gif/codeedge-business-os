import Link from "next/link";
import { Brand } from "./Brand";

const items = [
  ["⌂", "Command Centre", "/dashboard"],
  ["◎", "Find Me", "/dashboard/find-me"],
  ["☎", "Contact Me", "/dashboard/contact-me"],
  ["↗", "Buy From Me", "/dashboard/buy-from-me"],
  ["£", "Pay Me", "/dashboard/pay-me"],
  ["✓", "Manage Me", "/dashboard/manage-me"],
  ["✦", "Help Me Grow", "/dashboard/help-me-grow"],
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <Brand />
      <div className="navGroup">
        <div className="navLabel">Business OS</div>
        {items.map(([icon, label, href]) => (
          <Link className="navItem" key={href} href={href}>
            <span>{icon}</span><span>{label}</span>
          </Link>
        ))}
        <div className="navLabel">Workspace</div>
        <Link className="navItem" href="/dashboard/settings">⚙ Settings</Link>
        <Link className="navItem" href="/">↩ Sign out</Link>
      </div>
    </aside>
  );
}
