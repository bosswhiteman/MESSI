import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { newsletterSubscribers, settings } from "@/db/schema";
import { isAdminRequest, unauthorized } from "@/lib/admin-auth";
import { cleanText, fail, readJson } from "@/lib/api";
import { getSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

const KEYS = [
  "announcement",
  "deliveryAbidjan",
  "deliveryInterieur",
  "freeDeliveryThreshold",
  "showroomAddress",
  "openingHours",
  "experienceYears",
  "aboutText",
] as const;
const NUMERIC_KEYS = new Set<string>(["deliveryAbidjan", "deliveryInterieur", "freeDeliveryThreshold", "experienceYears"]);

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorized();
  const [storeSettings, subscribers] = await Promise.all([
    getSettings(),
    db.select().from(newsletterSubscribers).orderBy(desc(newsletterSubscribers.createdAt)),
  ]);
  return NextResponse.json({
    settings: storeSettings,
    subscribers: subscribers.map((s) => ({ id: s.id, contact: s.contact, createdAt: s.createdAt.toISOString() })),
  });
}

export async function PUT(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorized();
  const body = await readJson(req);

  // On valide tous les champs avant d'écrire, pour ne jamais enregistrer un envoi à moitié.
  const updates: Array<{ key: string; value: string }> = [];
  for (const key of KEYS) {
    if (body[key] === undefined) continue;
    let value = cleanText(body[key], key === "aboutText" ? 1200 : 300);
    if (NUMERIC_KEYS.has(key)) {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || n < 0) return fail(`Valeur invalide pour ${key}.`);
      value = String(n);
    }
    updates.push({ key, value });
  }

  for (const { key, value } of updates) {
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  }
  return NextResponse.json({ ok: true, settings: await getSettings() });
}
