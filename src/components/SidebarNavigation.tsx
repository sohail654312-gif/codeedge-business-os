"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const primaryItems = [
  ["▦", "Dashboard", "/dashboard"],
  ["↗", "Leads", "/dashboard/buy-from-me/leads"],
  ["◎", "Customers", "/dashboard/buy-from-me/customers"],
  ["◫", "Shared Inbox", "/dashboard/contact-me"],
  ["◷", "Bookings", "/dashboard/bookings"],
  ["⚡", "Automations", "/dashboard/automations"],
  ["£", "Money", "/dashboard/money"],
  ["✦", "AI Accountant", "/dashboard/money/ai-accountant"],
  ["◉", "AI Voice", "/dashboard/contact-me/voice"],
] as const;
const secondaryItems = [
  ["⌁", "Find Me", "/dashboard/find-me"],
  ["✓", "Manage Me", "/dashboard/manage-me"],
  ["✦", "Help Me Grow", "/dashboard/help-me-grow"],
  ["⚙", "Settings", "/dashboard/settings"],
] as const;
const items = [...primaryItems, ...secondaryItems];

export function SidebarNavigation() {
  const pathname = usePathname();
  const active = items.filter(([, , href]) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/")))
    .sort((a, b) => b[2].length - a[2].length)[0]?.[2];
  return (
    <nav className="ceNav" aria-label="Business OS">
      <Link className={"ceNavItem" + (pathname === "/dashboard/buy-from-me" ? " ceNavPrimary" : "")} aria-current={pathname === "/dashboard/buy-from-me" ? "page" : undefined} href="/dashboard/buy-from-me">
        <span className="ceNavIcon" aria-hidden="true">▦</span><span>CRM</span>
      </Link>
      {[primaryItems, secondaryItems].map((group, index) => (
        <div key={index}>
          {index > 0 && <div className="ceNavDivider" />}
          <div className="ceNavSection">
            {group.map(([icon, label, href]) => (
              <Link className={"ceNavItem" + (active === href ? " ceNavPrimary" : "")} aria-current={active === href ? "page" : undefined} key={href} href={href}>
                <span className="ceNavIcon" aria-hidden="true">{icon}</span><span>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
