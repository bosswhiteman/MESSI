import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/** DATABASE_URL, ou à défaut la variable créée automatiquement par Netlify DB. */
const databaseUrl = process.env.DATABASE_URL?.trim() || process.env.NETLIFY_DATABASE_URL?.trim();

// Pendant `next build`, aucune requête n'est envoyée : on ne bloque pas le build si la variable manque.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (!databaseUrl && !isBuildPhase) {
  throw new Error("DATABASE_URL est requis (ou NETLIFY_DATABASE_URL avec Netlify DB).");
}

const globalForDb = globalThis as typeof globalThis & {
  __messiStorePool?: Pool;
};

function createPool(): Pool {
  return new Pool({
    connectionString: databaseUrl ?? "postgresql://build:build@127.0.0.1:5432/build",
    // Hébergement serverless : peu de connexions par instance, libérées rapidement.
    max: Number(process.env.DB_POOL_MAX) || 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
}

export const pool = globalForDb.__messiStorePool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__messiStorePool = pool;
}

export const db = drizzle(pool, { schema });
