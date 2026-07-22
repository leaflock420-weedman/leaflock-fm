/**
 * Public Live Radio mount on the main site:
 *   https://fm.leaflock.com.au/live.mp3
 *
 * Same handler as /api/fm/listen (DJ420 continuous stream proxy).
 */
export { GET, dynamic, runtime } from "@/app/api/fm/listen/route";
