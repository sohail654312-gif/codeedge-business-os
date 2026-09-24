import { Sidebar } from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <main className="dash"><Sidebar /><section className="content">{children}</section></main>;
}
