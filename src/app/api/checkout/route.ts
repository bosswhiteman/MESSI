import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { carts, cartItems, orders, orderItems, products, productVariants } from "@/db/schema";
import { buildCartDTO, getOrCreateCart, getSettings } from "@/lib/store";
import { calculatePromoDiscount, calculateShippingFee, getConditionLabel, type StoreSettings } from "@/lib/format";
import { attachCartCookie, extractCartToken } from "@/lib/cart-cookie";
import { cleanText, fail, isUniqueViolation, pickOne, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

const DELIVERY_METHODS = ["abidjan-express", "retrait-boutique", "interieur-ci"] as const;
const PAYMENT_METHODS = ["livraison-especes", "wave", "orange-money", "mtn-momo"] as const;
const ORDER_NUMBER_ATTEMPTS = 5;

const EMPTY_CART_MESSAGE = "Votre panier est vide.";

class EmptyCartError extends Error {}

const newOrderNumber = () => `MS-225-${crypto.randomInt(10000, 99999)}`;

interface CheckoutInput {
  fullName: string;
  phone: string;
  email: string | null;
  deliveryMethod: (typeof DELIVERY_METHODS)[number];
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  city: string;
  commune: string;
  addressDetails: string;
  customerNote: string | null;
}

/** Lit et normalise le formulaire de commande (valeurs par défaut identiques à l'ancienne version). */
function parseCheckoutInput(body: Record<string, unknown>): CheckoutInput {
  const deliveryMethod = pickOne(DELIVERY_METHODS, body.deliveryMethod, "abidjan-express");
  const pickup = deliveryMethod === "retrait-boutique";
  const commune = cleanText(body.commune, 120) || (pickup ? "Showroom Messi Store" : "Cocody");
  const email = cleanText(body.email, 200);

  return {
    fullName: cleanText(body.fullName, 120),
    phone: cleanText(body.phone, 40),
    email: email.includes("@") ? email : null,
    deliveryMethod,
    paymentMethod: pickOne(PAYMENT_METHODS, body.paymentMethod, "livraison-especes"),
    city: cleanText(body.city, 120) || (deliveryMethod === "interieur-ci" ? "Intérieur CI" : "Abidjan"),
    commune,
    addressDetails:
      cleanText(body.addressDetails, 300) || (pickup ? "Retrait direct au showroom Messi Store" : commune),
    customerNote: cleanText(body.customerNote, 500) || null,
  };
}

function validateCheckoutInput(input: CheckoutInput): string | null {
  if (input.fullName.length < 2) return "Veuillez renseigner votre nom et prénom.";
  if (input.phone.replace(/\D/g, "").length < 8) {
    return "Veuillez entrer un numéro de téléphone ou WhatsApp valide (ex: 07 / 05 / 01...).";
  }
  if (input.deliveryMethod !== "retrait-boutique" && input.addressDetails.length < 3) {
    return "Veuillez préciser votre quartier ou repère de livraison.";
  }
  return null;
}

/** Crée la commande, ses lignes, décrémente le stock et vide le panier, dans une seule transaction. */
async function createOrder(cart: { id: number; promoCode: string | null }, input: CheckoutInput, storeSettings: StoreSettings) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ item: cartItems, product: products, variant: productVariants })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
      // Mêmes règles que le panier affiché : pas de variante archivée ni sans prix.
      .where(and(eq(cartItems.cartId, cart.id), eq(productVariants.archived, false)));

    const lines = rows.filter((r) => r.variant.price > 0);
    if (lines.length === 0) throw new EmptyCartError();

    const subtotal = lines.reduce((sum, r) => sum + r.variant.price * r.item.quantity, 0);
    const promo = calculatePromoDiscount(subtotal, cart.promoCode);
    const discount = promo.valid ? promo.discount : 0;
    const afterDiscount = Math.max(0, subtotal - discount);
    const shippingFee = calculateShippingFee(input.deliveryMethod, afterDiscount, storeSettings);

    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber: newOrderNumber(),
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        city: input.city,
        commune: input.commune,
        addressDetails: input.addressDetails,
        deliveryMethod: input.deliveryMethod,
        paymentMethod: input.paymentMethod,
        customerNote: input.customerNote,
        promoCode: promo.valid ? promo.code : null,
        subtotal,
        discount,
        shippingFee,
        total: afterDiscount + shippingFee,
        status: "confirmée",
      })
      .returning();

    for (const { item, product, variant } of lines) {
      const variantLabel = [
        getConditionLabel(variant.condition),
        variant.storage !== "Standard" ? variant.storage : null,
        variant.simType,
      ]
        .filter(Boolean)
        .join(" · ");

      await tx.insert(orderItems).values({
        orderId: order.id,
        productId: product.id,
        variantId: variant.id,
        productName: product.name,
        productBrand: product.brand,
        productSlug: product.slug,
        variantLabel,
        selectedColor: item.selectedColor,
        imageUrl: product.primaryImage,
        unitPrice: variant.price,
        quantity: item.quantity,
        lineTotal: variant.price * item.quantity,
      });

      await tx
        .update(productVariants)
        .set({ stockQty: sql`GREATEST(1, ${productVariants.stockQty} - ${item.quantity})` })
        .where(eq(productVariants.id, variant.id));
    }

    await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await tx.update(carts).set({ promoCode: null, updatedAt: new Date() }).where(eq(carts.id, cart.id));

    return order;
  });
}

export async function POST(req: NextRequest) {
  try {
    const cart = await getOrCreateCart(extractCartToken(req));
    const currentCart = await buildCartDTO(cart.id);
    if (currentCart.items.length === 0) return fail(EMPTY_CART_MESSAGE);

    const input = parseCheckoutInput(await readJson(req));
    const validationError = validateCheckoutInput(input);
    if (validationError) return fail(validationError);

    const storeSettings = await getSettings();

    // Le numéro de commande est aléatoire : en cas (rare) de collision, on retente avec un nouveau numéro.
    let order: Awaited<ReturnType<typeof createOrder>> | null = null;
    for (let attempt = 1; attempt <= ORDER_NUMBER_ATTEMPTS && !order; attempt++) {
      try {
        order = await createOrder(cart, input, storeSettings);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === ORDER_NUMBER_ATTEMPTS) throw error;
      }
    }
    if (!order) throw new Error("Order creation failed");

    const res = NextResponse.json(
      { orderNumber: order.orderNumber, total: order.total, cart: await buildCartDTO(cart.id) },
      { status: 201 }
    );
    return attachCartCookie(res, cart.sessionToken);
  } catch (error) {
    if (error instanceof EmptyCartError) return fail(EMPTY_CART_MESSAGE);
    console.error("POST /api/checkout error:", error);
    return fail("Erreur lors de l'enregistrement de la commande. Veuillez réessayer.", 500);
  }
}
