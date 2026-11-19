import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { newsletterSubscribers } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { cleanText, fail, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const body = await readJson(req);
    const contact = cleanText(body.contact ?? body.email, 101);

    if (contact.length < 6 || contact.length > 100) {
      return fail("Veuillez saisir un numéro WhatsApp ou une adresse e-mail valide.");
    }

    await db
      .insert(newsletterSubscribers)
      .values({ contact })
      .onConflictDoNothing({ target: newsletterSubscribers.contact });

    return NextResponse.json({
      message: "Inscription enregistrée ! Vous recevrez nos prochains arrivages et baisses de prix en priorité.",
    });
  } catch (error) {
    console.error("POST /api/newsletter error:", error);
    return fail("Impossible d'enregistrer votre contact pour le moment.", 500);
  }
}
