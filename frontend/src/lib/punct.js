export function formatTextNode(s) {
  if (typeof s !== "string" || !s) return s;
  return s
    .replace(/ +([—–])/g, "\u00A0$1")
    .replace(/\s+([,.\!?:;\)\]\}\»”\…%])/g, "$1")
    .replace(/([«\(\[\{“]) +/g, "$1\u00A0");
}
