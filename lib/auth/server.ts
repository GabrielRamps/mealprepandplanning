import "server-only";
import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";
import { connection } from "next/server";

// Created on first use so a missing env var fails the request with a clear
// message instead of failing `next build`.
let instance: NeonAuth | undefined;

export function getAuth(): NeonAuth {
  if (!instance) {
    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    const secret = process.env.NEON_AUTH_COOKIE_SECRET;
    if (!baseUrl) throw new Error("NEON_AUTH_BASE_URL is not set");
    if (!secret || secret.length < 32) {
      throw new Error("NEON_AUTH_COOKIE_SECRET must be at least 32 characters");
    }
    instance = createNeonAuth({ baseUrl, cookies: { secret } });
  }
  return instance;
}

export type SessionUser = { id: string; email: string; name: string };

/** The signed-in user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  // Stop prerendering here: Neon Auth would otherwise catch Next's dynamic-usage
  // signal from cookies() and log it as an error during `next build`.
  await connection();
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name };
}
