import { getNowPlaying } from "@/lib/azuracast";

export async function GET() {
  const nowPlaying = await getNowPlaying();
  return Response.json({
    nowPlaying,
    configured: Boolean(process.env.AZURACAST_BASE_URL && process.env.AZURACAST_STATION_SHORTCODE)
  });
}
