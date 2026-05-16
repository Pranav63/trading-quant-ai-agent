import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const { action, password } = await req.json()

  if (action === "logout") {
    const res = NextResponse.json({ ok: true })
    res.cookies.delete("auth_token")
    return res
  }

  if (password !== process.env.AUTH_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set("auth_token", process.env.AUTH_SECRET!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
  })
  return res
}