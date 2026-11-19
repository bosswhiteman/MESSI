import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { media } from "@/db/schema";
import { isAdminRequest, unauthorized } from "@/lib/admin-auth";
import { fail, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES_PER_REQUEST = 12;
const DATA_URL = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/;

/** Vérifie que le contenu réel correspond au type annoncé (signature des premiers octets). */
function matchesSignature(mime: string, base64: string): boolean {
  const head = Buffer.from(base64.slice(0, 32), "base64");
  switch (mime) {
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/png":
      return head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    case "image/webp":
      return head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP";
    default:
      return false;
  }
}

/** Reçoit une ou plusieurs images (data URL déjà compressées côté navigateur). */
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorized();
  try {
    const body = await readJson(req);
    const list: unknown[] = Array.isArray(body.images) ? body.images : body.image ? [body.image] : [];
    if (list.length === 0) return fail("Aucune image reçue.");
    if (list.length > MAX_IMAGES_PER_REQUEST) return fail(`${MAX_IMAGES_PER_REQUEST} images maximum par envoi.`);

    // Tout est validé avant la moindre écriture : un envoi invalide n'enregistre rien.
    const files: Array<{ mime: string; data: string; size: number }> = [];
    for (const item of list) {
      const match = DATA_URL.exec(String(item));
      if (!match || !ALLOWED_MIME.has(match[1]) || !matchesSignature(match[1], match[2])) {
        return fail("Format accepté : JPG, PNG ou WEBP.");
      }
      const size = Math.floor((match[2].length * 3) / 4);
      if (size > MAX_BYTES) return fail("Image trop lourde (4 Mo maximum).");
      files.push({ mime: match[1], data: match[2], size });
    }

    const urls: string[] = [];
    for (const file of files) {
      const [row] = await db.insert(media).values(file).returning({ id: media.id });
      urls.push(`/api/media/${row.id}`);
    }
    return NextResponse.json({ urls }, { status: 201 });
  } catch (error) {
    console.error("upload error:", error);
    return fail("Envoi impossible.", 500);
  }
}
