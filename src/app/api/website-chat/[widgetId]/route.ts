import { NextRequest, NextResponse } from "next/server";
import {
  publicWidgetIdSchema,
  visitorSessionTokenSchema,
  websiteChatRequestSchema,
} from "@/modules/website-chat/validation";
import {
  captureWebsiteChatLead,
  getWebsiteChatHistory,
  sendWebsiteChatMessage,
  startWebsiteChat,
} from "@/server/website-chat/service";
import { newVisitorSessionToken } from "@/server/website-chat/session";
import {
  readWebsiteChatBody,
  websiteChatCorsHeaders,
} from "@/server/website-chat/http";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: websiteChatCorsHeaders,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ widgetId: string }> },
) {
  const headers = websiteChatCorsHeaders;

  try {
    const widgetId = publicWidgetIdSchema.parse((await params).widgetId);
    const input = websiteChatRequestSchema.parse(await readWebsiteChatBody(request));

    const suppliedToken = request.headers.get("x-codeedge-chat-session") ?? "";
    const parsedToken = visitorSessionTokenSchema.safeParse(suppliedToken);

    if (input.action === "start") {
      const token = parsedToken.success ? parsedToken.data : newVisitorSessionToken();
      const state = await startWebsiteChat(widgetId, token);

      return NextResponse.json(
        {
          ...state,
          sessionToken: state.config?.available ? token : null,
        },
        { headers },
      );
    }

    if (!parsedToken.success) {
      return NextResponse.json(
        { error: "Chat session unavailable." },
        { status: 401, headers },
      );
    }

    if (input.action === "history" || input.action === "status") {
      return NextResponse.json(
        await getWebsiteChatHistory(widgetId, parsedToken.data),
        { headers },
      );
    }

    if (input.action === "send") {
      return NextResponse.json(
        await sendWebsiteChatMessage(
          widgetId,
          parsedToken.data,
          input.requestId,
          input.body,
        ),
        { headers },
      );
    }

    return NextResponse.json(
      await captureWebsiteChatLead(widgetId, parsedToken.data, input),
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Chat is unavailable or the request could not be accepted." },
      { status: 400, headers },
    );
  }
}
