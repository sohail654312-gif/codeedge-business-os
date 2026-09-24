import "server-only";

export async function readWebsiteChatBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new Error("JSON required");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new Error("Body required");

  let size = 0;
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        throw new Error("Request too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export const websiteChatCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Codeedge-Chat-Session",
  "Cache-Control": "no-store",
} as const;
