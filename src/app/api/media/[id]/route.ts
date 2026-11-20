import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { media } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const notFound = () => new NextResponse("Not found", { status: 404 });

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return notFound();

  const [file] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!file) return notFound();

  return new NextResponse(Buffer.from(file.data, "base64"), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
