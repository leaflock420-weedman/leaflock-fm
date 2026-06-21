import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await requireUser();
  const jobs = await prisma.publishingJob.findMany({ orderBy: { updatedAt: "desc" }, take: 100 });
  return NextResponse.json({ jobs });
}
