import { NextRequest, NextResponse } from "next/server";
import { CART_COOKIE_NAME } from "./store";
import { cookieSecure } from "./cookies";

const TOKEN_PATTERN = /^[a-f0-9]{24,64}$/;
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 60; // 60 jours

function validToken(value: string | null | undefined): string | null {
  return value && TOKEN_PATTERN.test(value) ? value : null;
}

/** Récupère le jeton de panier depuis le cookie, ou à défaut depuis l'en-tête x-cart-token. */
export function extractCartToken(req: NextRequest): string | null {
  return validToken(req.cookies.get(CART_COOKIE_NAME)?.value) ?? validToken(req.headers.get("x-cart-token"));
}

export function attachCartCookie(res: NextResponse, sessionToken: string): NextResponse {
  res.cookies.set(CART_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
  });
  return res;
}
