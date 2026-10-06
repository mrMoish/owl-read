import React from "react";
import RichText from "./RichText.jsx";
export default function Scripture({ block, shown, tr }) {
  return <blockquote className="verse"><p><RichText nodes={block.nodes} shown={shown} tr={tr} /></p></blockquote>;
}
