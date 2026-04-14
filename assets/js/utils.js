export function escapeHtml(s=""){
  return String(s).replace(/[&<>\"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch]));
}

export function escapeAttr(s=""){
  return escapeHtml(s);
}

export function decodeBase64Utf8(base64){
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

export function downloadText(filename, text, mime="text/plain;charset=utf-8"){
  const blob = new Blob([text], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url;
  a.download=filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export async function copyTextToClipboard(text){
  const value = String(text || "").trim();
  if (!value) return false;
  if (navigator.clipboard?.writeText){
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {}
  }
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  return ok;
}

export function openBookmarkUrl(url){
  const href = String(url || "").trim();
  if (!href) return;
  window.open(href, "_blank", "noopener,noreferrer");
}
