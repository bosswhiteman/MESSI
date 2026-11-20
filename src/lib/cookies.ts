/**
 * Cookies "Secure" (HTTPS uniquement). Actif en production par défaut ;
 * COOKIE_SECURE=true/false permet de forcer le comportement (ex. test en HTTP local).
 * Note : sur Netlify, les variables de netlify.toml ne sont disponibles qu'au build,
 * d'où ce repli sur NODE_ENV qui est bien défini à l'exécution.
 */
export function cookieSecure(): boolean {
  const forced = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (forced === "true") return true;
  if (forced === "false") return false;
  return process.env.NODE_ENV === "production";
}
