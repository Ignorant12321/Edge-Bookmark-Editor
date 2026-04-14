import { state, uid, reseedIds } from "./state.js";
import { t } from "../i18n/index.js";

export function parseBookmarkHtml(input){
  const parser = new DOMParser();
  const doc = parser.parseFromString(input, "text/html");
  const mainDL = doc.querySelector("DL");
  state.nextId = 1;

  function readDL(dl){
    const items = [];
    if (!dl) return items;
    const children = Array.from(dl.children);
    for (let i=0; i<children.length; i++){
      const node = children[i];
      if (node.tagName !== "DT") continue;
      const folderHeader = node.querySelector(":scope > H3");
      const link = node.querySelector(":scope > A");
      if (folderHeader){
        let next = node.nextElementSibling;
        if (!next || next.tagName !== "DL") next = node.querySelector(":scope > DL");
        items.push({
          id: uid(),
          type: "folder",
          title: folderHeader.textContent?.trim() || t("defaults.untitledFolder"),
          addDate: folderHeader.getAttribute("ADD_DATE") || "",
          lastModified: folderHeader.getAttribute("LAST_MODIFIED") || "",
          personalToolbarFolder: folderHeader.getAttribute("PERSONAL_TOOLBAR_FOLDER") || "",
          children: readDL(next),
        });
      } else if (link){
        items.push({
          id: uid(),
          type: "bookmark",
          title: link.textContent?.trim() || link.getAttribute("HREF") || t("defaults.untitledBookmark"),
          href: link.getAttribute("HREF") || "",
          addDate: link.getAttribute("ADD_DATE") || "",
          icon: link.getAttribute("ICON") || "",
          lastModified: link.getAttribute("LAST_MODIFIED") || "",
        });
      }
    }
    return items;
  }

  return { id:uid(), type:"folder", title:t("defaults.rootTitle"), addDate:"", lastModified:"", children: readDL(mainDL) };
}

export function serializeBookmarkHtml(root){
  function escText(s=""){
    return String(s).replace(/[&<>]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[ch]));
  }
  function escAttr(s=""){
    return String(s).replace(/[&<>\"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch]));
  }
  function folderToHtml(folder, depth=1){
    const indent = "    ".repeat(depth);
    const toolbarValue = String(folder.personalToolbarFolder || "").trim();
    const h3Attrs = [
      folder.addDate ? `ADD_DATE="${escAttr(folder.addDate)}"` : "",
      folder.lastModified ? `LAST_MODIFIED="${escAttr(folder.lastModified)}"` : "",
      toolbarValue ? `PERSONAL_TOOLBAR_FOLDER="${escAttr(toolbarValue)}"` : "",
    ].filter(Boolean).join(" ");
    let html = `${indent}<DT><H3${h3Attrs ? " " + h3Attrs : ""}>${escText(folder.title)}</H3>\n`;
    html += `${indent}<DL><p>\n`;
    for (const child of folder.children){
      if (child.type === "folder") html += folderToHtml(child, depth+1);
      else html += bookmarkToHtml(child, `${indent}    `);
    }
    html += `${indent}</DL><p>\n`;
    return html;
  }

  function bookmarkToHtml(bookmark, indent="    "){
    const attrs = [
      bookmark.href ? `HREF="${escAttr(bookmark.href)}"` : `HREF=""`,
      bookmark.addDate ? `ADD_DATE="${escAttr(bookmark.addDate)}"` : "",
      bookmark.icon ? `ICON="${escAttr(bookmark.icon)}"` : "",
      bookmark.lastModified ? `LAST_MODIFIED="${escAttr(bookmark.lastModified)}"` : "",
    ].filter(Boolean).join(" ");
    return `${indent}<DT><A ${attrs}>${escText(bookmark.title || "")}</A>\n`;
  }

  const sourceChildren = Array.isArray(root?.children) ? root.children : [];
  const topFolders = sourceChildren.filter(child => child.type === "folder");
  const topBookmarks = sourceChildren.filter(child => child.type !== "folder");
  const hasTopToolbarFolder = topFolders.some(folder => String(folder.personalToolbarFolder || "").trim());

  let exportChildren = sourceChildren;
  if (!hasTopToolbarFolder && topFolders.length > 0){
    if (topFolders.length === 1 && topBookmarks.length === 0){
      const onlyFolder = topFolders[0];
      exportChildren = [{ ...onlyFolder, personalToolbarFolder: "true" }];
    } else {
      const now = String(Math.floor(Date.now()/1000));
      const toolbarFolder = {
        type: "folder",
        title: "收藏夹栏",
        addDate: now,
        lastModified: now,
        personalToolbarFolder: "true",
        children: topFolders,
      };
      exportChildren = [toolbarFolder, ...topBookmarks];
    }
  }

  const head = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

  const body = exportChildren.map(child => child.type === "folder"
    ? folderToHtml(child, 1)
    : bookmarkToHtml(child, "    ")
  ).join("");

  return head + body + `</DL><p>\n`;
}

export function importJson(text){
  const data = JSON.parse(text);
  return reseedIds(data);
}
