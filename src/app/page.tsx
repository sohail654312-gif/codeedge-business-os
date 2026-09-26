import Link from "next/link";
import { Brand } from "@/components/Brand";

const modules = [
  ["◎", "FIND ME", "Website · Local SEO · Reviews"],
  ["☎", "CONTACT ME", "Calls · WhatsApp · AI Voice"],
  ["↗", "BUY FROM ME", "Leads · CRM · Quotes"],
  ["£", "PAY ME", "Invoices · Payments · Finance"],
  ["✓", "MANAGE ME", "Team · Tasks · Operations"],
  ["✦", "HELP ME GROW", "Insights · Marketing · AI"]
];

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <Brand />
        <div className="row">
          <Link className="btn" href="/login">Sign in</Link>
          <Link className="btn primary" href="/signup">Create workspace</Link>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">CodeEdge Business OS</div>
          <h1>One business.<br />One account.<br />One control centre.</h1>
          <p>
            A problem-solving operating system for small businesses. See what needs attention,
            manage the customer journey, and connect specialist tools without turning your
            business into a maze of software.
          </p>
          <div className="actions">
            <Link className="btn primary" href="/signup">Create workspace</Link>
            <Link className="btn" href="/login">Sign in</Link>
          </div>
        </div>

        <div className="preview">
          <div className="previewHead">
            <b>ABC Plumbing & Heating Ltd</b><span className="pill">Demo workspace</span>
          </div>
          <div className="metrics">
            <div className="metric"><span className="muted">Revenue</span><b>£18,420</b></div>
            <div className="metric"><span className="muted">New leads</span><b>14</b></div>
            <div className="metric"><span className="muted">Overdue</span><b className="danger">£1,720</b></div>
            <div className="metric"><span className="muted">AI calls</span><b>18</b></div>
          </div>
        </div>
      </section>

      <section className="grid6">
        {modules.map(([icon, title, desc]) => (
          <div className="moduleCard" key={title}>
            <div className="moduleIcon">{icon}</div>
            <h3>{title}</h3>
            <div className="muted">{desc}</div>
          </div>
        ))}
      </section>
    </main>
  );
}
