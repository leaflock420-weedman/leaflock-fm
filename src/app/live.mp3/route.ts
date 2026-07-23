/**
 * https://fm.leaflock.com.au/live.mp3
 * Inline config — Next cannot read dynamic/runtime when re-exported from another file.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export { GET, HEAD } from "@/app/api/fm/listen/route";
