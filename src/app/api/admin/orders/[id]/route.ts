import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { isAdminRequest, unauthorized } from "@/lib/admin-auth";
import { fail, readJson } from "@/lib/api";
import { ORDER_STATUSES } from "@/lib/format";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function parseId(ctx: Context): Promise<number | null> {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(req: NextRequest, ctx: Context) {
  if (!isAdminRequest(req)) return unauthorized();
  const id = await parseId(ctx);
  if (id === null) return fail("Commande introuvable.", 404);

  const { status } = await readJson(req);
  if (!ORDER_STATUSES.some((s) => s.id === String(status ?? ""))) return fail("Statut invalide.");

  const [updated] = await db
    .update(orders)
    .set({ status: String(status) })
    .where(eq(orders.id, id))
    .returning({ id: orders.id });
  if (!updated) return fail("Commande introuvable.", 404);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Context) {
  if (!isAdminRequest(req)) return unauthorized();
  const id = await parseId(ctx);
  if (id === null) return fail("Commande introuvable.", 404);

  await db.delete(orders).where(eq(orders.id, id));
  return NextResponse.json({ ok: true });
}
