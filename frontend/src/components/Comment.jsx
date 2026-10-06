import React from "react";
import RichText from "./RichText.jsx";
export default function Comment({ blocks, shown, tr }) {
  return <div className="comment">{blocks.map((b, i) => <p key={i}><RichText nodes={b.nodes} shown={shown} tr={tr} /></p>)}</div>;
}
