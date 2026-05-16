import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const auth = request.cookies.get("auth_token")?.value
  const isLoginPage = request.nextUrl.pathname === "/login"
  const isAuthApi = request.nextUrl.pathname === "/api/auth"

  if (isAuthApi) return NextResponse.next()
  if (!auth || auth !== process.env.AUTH_SECRET) {
    if (isLoginPage) return NextResponse.next()
    return NextResponse.redirect(new URL("/login", request.url))
  }
  if (isLoginPage) return NextResponse.redirect(new URL("/dashboard", request.url))
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}