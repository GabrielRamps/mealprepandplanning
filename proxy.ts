import type { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/server";

let middleware: ((request: NextRequest) => Promise<Response>) | undefined;

// Redirects signed-out visitors to /auth/sign-in. API routes are excluded:
// each Route Handler checks the session (or an import token) itself and
// answers 401 instead of redirecting.
export default function proxy(request: NextRequest) {
  middleware ??= getAuth().middleware({ loginUrl: "/auth/sign-in" });
  return middleware(request);
}

export const config = {
  matcher: [
    "/((?!auth(?:/|$)|api/|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)",
  ],
};
