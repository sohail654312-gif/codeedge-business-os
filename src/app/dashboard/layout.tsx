import { Sidebar } from "@/components/Sidebar";
import { DashboardHeader } from "@/components/DashboardHeader";
import { requireDashboardTenant } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { context } = await requireDashboardTenant();

  return (
    <div className="dash">
      <a className="ceSkipLink" href="#workspace-content">Skip to workspace content</a>
      <Sidebar businessName={context.business.name} role={context.role} />
      <div className="content ceContent">
        <DashboardHeader businessName={context.business.name} role={context.role} executionMode={context.business.execution_mode} />
        <main className="cePageContent" id="workspace-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
