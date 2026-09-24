import Script from "next/script";
import { notFound } from "next/navigation";
import { publicWidgetIdSchema } from "@/modules/website-chat/validation";

export default async function WebsiteChatPreviewPage({
  params,
}: {
  params: Promise<{ widgetId: string }>;
}) {
  const parsed = publicWidgetIdSchema.safeParse((await params).widgetId);
  if (!parsed.success) notFound();

  return (
    <main className="publicChatPreview">
      <section>
        <div className="eyebrow">Codeedge Website Chat</div>
        <h1>Widget preview</h1>
        <p>
          This page loads the same embed script used on a client website.
          Open the launcher in the lower corner to test the configured widget.
        </p>
      </section>
      <Script
        src="/widget.js"
        strategy="afterInteractive"
        data-widget-id={parsed.data}
      />
    </main>
  );
}
