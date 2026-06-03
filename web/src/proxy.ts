import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/trade/:path*",
    "/craft/:path*",
    "/simulate/:path*",
    "/listings/:path*",
    "/queries/:path*",
    "/ideal-items/:path*",
    "/sessions/:path*",
    "/settings/:path*",
  ],
};
