export function isEnglishPath(pathname) {
  if (!pathname) return false;
  return pathname === "/en" || pathname.startsWith("/en/");
}
