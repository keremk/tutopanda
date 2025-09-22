import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  // Define public routes that don't require authentication
  const publicRoutes = ["/", "/auth/login", "/auth/signup"];

  // Check if the current path is a public route
  const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith("/auth/"));

  // If it's a public route, allow access
  if (isPublicRoute) {
    // If user is already authenticated and tries to access auth pages or root, redirect to /edit
    if (sessionCookie && (pathname === "/" || pathname.startsWith("/auth/"))) {
      return NextResponse.redirect(new URL("/edit", request.url));
    }
    return NextResponse.next();
  }

  // For protected routes, check if user is authenticated
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/auth/signup", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};