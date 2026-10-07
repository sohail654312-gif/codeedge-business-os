import "server-only";
export interface TranscriptionProvider {
  readonly id: string;
  transcribe(input: { bytes: Uint8Array; mimeType: string; language?: string; signal: AbortSignal }): Promise<{ text: string }>;
}
/** Optional server seam. Clinic audio stays in human control. */
export async function transcribeWhatsAppAudio(input: { bytes: Uint8Array; mimeType: string; clinicMode: boolean }, provider?: TranscriptionProvider) {
  if (process.env.WHATSAPP_TRANSCRIPTION_ENABLED !== "true") return { status: "disabled" as const };
  if (input.clinicMode) return { status: "human_review" as const };
  if (!provider) return { status: "provider_unavailable" as const };
  if (!/^audio\/(ogg|mpeg|mp4|aac|amr)$/.test(input.mimeType) || input.bytes.byteLength > 16 * 1024 * 1024) throw new Error("transcription_media_not_allowed");
  try {
    const result = await provider.transcribe({ ...input,signal: AbortSignal.timeout(15_000) });
    if (!result.text.trim() || result.text.length > 4000) throw new Error("transcription_invalid_text");
    return { status: "transcribed" as const,text: result.text.trim() };
  } catch { return { status: "failed" as const }; }
}
