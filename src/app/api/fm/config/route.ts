import { getFmPublicConfig } from "@/lib/fm-store";

export async function GET() {
  const config = await getFmPublicConfig();
  return Response.json(config);
}