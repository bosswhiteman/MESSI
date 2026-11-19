import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, checkCredentials, createSessionToken, isAdminRequest, setAdminCookie } from "@/lib/admin-auth";
import { fail, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 8;
const LOCK_MS = 10 * 60 * 1000;
const FAILURE_DELAY_MS = 500;

/** Tentatives échouées par adresse IP (en mémoire ; les entrées expirées sont purgées). */
const attempts = new Map<string, { count: number; lockedUntil: number }>();

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

function purgeExpired(now: number) {
  for (const [ip, entry] of attempts) {
    if (entry.lockedUntil !== 0 && entry.lockedUntil <= now) attempts.delete(ip);
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ authenticated: isAdminRequest(req) });
}

export async function POST(req: NextRequest) {
  const now = Date.now();
  purgeExpired(now);

  const ip = clientIp(req);
  const previous = attempts.get(ip);
  if (previous && previous.lockedUntil > now) {
    return fail("Trop de tentatives. Réessayez dans quelques minutes.", 429);
  }

  const body = await readJson(req);
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");

  if (!email || !password || !(await checkCredentials(email, password))) {
    const count = (previous?.count ?? 0) + 1;
    attempts.set(ip, { count, lockedUntil: count >= MAX_ATTEMPTS ? now + LOCK_MS : 0 });
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    return fail("E-mail ou mot de passe incorrect.", 401);
  }

  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  setAdminCookie(res, createSessionToken());
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
