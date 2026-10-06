import Link from "next/link";
import { Brand } from "./Brand";
import { signOut } from "@/modules/auth/actions";
import type { BusinessRole } from "@/types/database";
import { SidebarNavigation } from "./SidebarNavigation";

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

      <SidebarNavigation />

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
