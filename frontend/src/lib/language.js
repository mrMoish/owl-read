export function isEnglishPath(pathname) {
  if (!pathname) return false;
  return pathname === "/en" || pathname.startsWith("/en/");
}

export function isSpanishPath(pathname) {
  if (!pathname) return false;
  return pathname === "/es" || pathname.startsWith("/es/");
}
