const LANG_KEY = "reader.lang";

function getURLParams() {
  if (typeof window === "undefined" || !window.location) {
    return { pathname: "/", search: "" };
  }
  return {
    pathname: window.location.pathname || "/",
    search: window.location.search || "",
  };
}

export function resolveLanguageMode(urlState = getURLParams()) {
  const { pathname, search } = urlState;

  // 1. Path-based check: /en or /en/ or /en/...
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    return { isEn: true, source: "path" };
  }

  // 2. Query param check: ?en or ?lang=en
  if (search) {
    const params = new URLSearchParams(search);
    if (params.has("en") || params.get("lang") === "en") {
      return { isEn: true, source: "query" };
    }
  }

  // 3. Saved localStorage preference within current container
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "en") return { isEn: true, source: "storage" };
      if (saved === "es" || saved === "ru") return { isEn: false, source: "storage" };
    } catch {
      // ignore storage errors
    }
  }

  // 4. Default: Spanish / Russian base mode (Spanish default for reading app)
  return { isEn: false, source: "default" };
}

export function saveLanguagePreference(isEn) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(LANG_KEY, isEn ? "en" : "es");
  } catch {
    // ignore storage errors
  }
}

export function updateManifestLink() {
  if (typeof document === "undefined") return;
  const { isEn } = resolveLanguageMode();

  // Save current resolved preference into local container storage
  saveLanguagePreference(isEn);

  let link = document.querySelector('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }

  const targetManifest = isEn ? "/manifest-en.webmanifest" : "/manifest.webmanifest";
  if (link.getAttribute("href") !== targetManifest) {
    link.setAttribute("href", targetManifest);
  }
}
