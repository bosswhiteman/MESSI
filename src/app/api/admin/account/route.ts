import { NextRequest, NextResponse } from "next/server";
import { checkCredentials, getAdminEmail, isAdminRequest, unauthorized, updateAdminCredentials } from "@/lib/admin-auth";
import { fail, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorized();
  return NextResponse.json({ email: await getAdminEmail() });
}

/** Modifier l'e-mail et/ou le mot de passe administrateur (mot de passe actuel requis). */
export async function PUT(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorized();
  const body = await readJson(req);
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "").trim();
  const newEmail = String(body.newEmail ?? "").trim();

  if (!(await checkCredentials(await getAdminEmail(), currentPassword))) {
    return fail("Mot de passe actuel incorrect.");
  }
  if (newPassword && newPassword.length < MIN_PASSWORD_LENGTH) {
    return fail(`Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }
  if (newEmail && !EMAIL_PATTERN.test(newEmail)) return fail("Adresse e-mail invalide.");

  await updateAdminCredentials(newEmail || null, newPassword || null);
  return NextResponse.json({ ok: true, email: await getAdminEmail() });
}
