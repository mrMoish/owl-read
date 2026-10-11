import { getModeByPath } from "./modes.js";

export function isEnglishPath(pathname) {
  if (!pathname) return false;
  const path = pathname.toLowerCase();
  if (path === "/en" || path.startsWith("/en/")) return true;
  if (path.startsWith("/s4")) return true;
  return false;
}

export function isSpanishPath(pathname) {
  if (!pathname) return false;
  const path = pathname.toLowerCase();
  if (path === "/es" || path.startsWith("/es/")) return true;
  if (path.startsWith("/s1") || path.startsWith("/s3")) return true;
  return false;
}

export function isRussianPath(pathname) {
  if (!pathname) return false;
  const path = pathname.toLowerCase();
  if (path === "/ru" || path.startsWith("/ru/")) return true;
  if (path.startsWith("/s2")) return true;
  return false;
}
