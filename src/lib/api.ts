import { NextResponse } from "next/server";

/** Réponse d'erreur JSON uniforme : { error: "message" }. */
export function fail(error: string, status = 400): NextResponse {
  return NextResponse.json({ error }, { status });
}

/** Lit le corps JSON d'une requête ; renvoie un objet vide si le corps est absent ou invalide. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Convertit une valeur inconnue en texte nettoyé et tronqué. */
export function cleanText(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

/** Retourne `value` s'il fait partie des valeurs autorisées, sinon `fallback`. */
export function pickOne<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Vrai si l'erreur provient d'une violation de contrainte d'unicité PostgreSQL (code 23505). */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
