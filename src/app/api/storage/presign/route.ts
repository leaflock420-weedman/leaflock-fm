import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createUploadUrl } from "@/lib/storage";

const schema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  purpose: z.enum(["master", "audio", "video", "artwork", "transcript", "waveform", "clip"])
});

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

export async function POST(request: Request) {
  await requireUser();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const key = `${parsed.data.purpose}/${Date.now()}-${safeFileName(parsed.data.fileName)}`;
  const upload = await createUploadUrl({ key, mimeType: parsed.data.mimeType });
  return NextResponse.json(upload);
}
