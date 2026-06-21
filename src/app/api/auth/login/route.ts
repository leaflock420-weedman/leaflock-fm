import { NextResponse } from "next/server";
import { createSession, verifyLogin } from "@/lib/auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const user = await verifyLogin(email, password);

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), { status: 303 });
  }

  await createSession(user.id);
  return NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
}
