import { Sidebar } from "@/components/Sidebar";
import { requireDashboardTenant } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { context } = await requireDashboardTenant();

  return (
    <main className="dash">
      <Sidebar businessName={context.business.name} role={context.role} />
      <section className="content">{children}</section>
    </main>
  );
}
