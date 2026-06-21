import { getFmSettings, getTopLikes, saveFmSettings, verifyFmDeskAccess } from "@/lib/fm-store";

export async function GET(request: Request) {
  if (!verifyFmDeskAccess(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings, topLikes] = await Promise.all([getFmSettings(), getTopLikes(25)]);
  return Response.json({ settings, topLikes });
}

export async function PUT(request: Request) {
  if (!verifyFmDeskAccess(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { playlistId?: string };
  if (!body.playlistId?.trim()) {
    return Response.json({ error: "playlistId is required" }, { status: 400 });
  }

  const settings = await saveFmSettings(body.playlistId);
  return Response.json({ settings });
}