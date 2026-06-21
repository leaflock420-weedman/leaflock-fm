import { getFmSettings } from "@/lib/fm-store";

export async function GET() {
  const settings = await getFmSettings();
  return Response.json({
    playlistId: settings.playlistId,
    updatedAt: settings.updatedAt
  });
}