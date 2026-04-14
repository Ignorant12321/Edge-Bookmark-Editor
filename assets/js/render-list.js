import { state } from "./state.js";
import { escapeHtml, copyTextToClipboard, openBookmarkUrl } from "./utils.js";
import { t } from "../i18n/index.js";
import {
  countStats,
  getCurrentFolder,
  getVisibleItems,
  countCurrentItems,
  findParentOf,
  pathToNode,
  moveItemToFolder,
  reorderWithinFolder,
} from "./tree-model.js";

function renderBreadcrumbs(runtime, folder){
  const { dom, actions } = runtime;
  dom.breadcrumbs.innerHTML = "";
  const path = pathToNode(folder.id);
  path.forEach((node, idx) => {
    const btn = document.createElement("button");
    btn.className = "crumb-btn";
    btn.textContent = node.title;
    btn.onclick = () => actions.selectFolder(node.id);
    dom.breadcrumbs.appendChild(btn);
    if (idx < path.length - 1){
      const sep = document.createElement("span");
      sep.textContent = "›";
      sep.style.color = "#94a3b8";
      dom.breadcrumbs.appendChild(sep);
    }
  });
}

function clearDragMarkers(scope=document){
  scope.querySelectorAll(".card").forEach(c => c.classList.remove("drag-over-before", "drag-over-after", "drag-over-folder"));
}

function cardDragEvents(runtime, card, item, index, currentFolder){
  if (state.search.trim()) return;
  card.draggable = true;
  card.addEventListener("dragstart", e => {
    state.draggingId = item.id;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    state.draggingId = null;
    clearDragMarkers();
  });
  card.addEventListener("dragover", e => {
    if (!state.draggingId || state.draggingId === item.id) return;
    e.preventDefault();
    clearDragMarkers();
    const rect = card.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (item.type === "folder" && y > rect.height * 0.28 && y < rect.height * 0.72) card.classList.add("drag-over-folder");
    else if (y < rect.height / 2) card.classList.add("drag-over-before");
    else card.classList.add("drag-over-after");
  });
  card.addEventListener("drop", e => {
    e.preventDefault();
    const draggingId = state.draggingId;
    if (!draggingId || draggingId === item.id) return;
    if (card.classList.contains("drag-over-folder") && item.type === "folder"){
      moveItemToFolder(draggingId, item.id);
    } else {
      const insertIndex = card.classList.contains("drag-over-before") ? index : index + 1;
      const draggingOwner = findParentOf(draggingId);
      if (draggingOwner?.id === currentFolder.id) reorderWithinFolder(currentFolder.id, draggingId, insertIndex);
      else moveItemToFolder(draggingId, currentFolder.id, insertIndex);
    }
    clearDragMarkers();
    runtime.render();
  });
}

export function renderStats(runtime){
  const s = countStats();
  runtime.dom.stats.textContent = t("list.treeStats", { count: s.bookmarks });
}

export function renderList(runtime){
  const { dom, actions } = runtime;
  dom.list.innerHTML = "";
  if (!state.root) return;

  const folder = getCurrentFolder();
  const items = getVisibleItems();
  const currentStats = countCurrentItems(folder);

  dom.listTitle.textContent = t("list.titlePrefix") + folder.title;
  const listStats = [];
  if (currentStats.folders) listStats.push(t("list.stats.folder", { count: currentStats.folders }));
  if (currentStats.bookmarks) listStats.push(t("list.stats.bookmark", { count: currentStats.bookmarks }));
  dom.listStats.textContent = listStats.join(" · ");
  dom.listStats.classList.toggle("hidden", listStats.length === 0);

  renderBreadcrumbs(runtime, folder);

  if (!items.length){
    dom.list.innerHTML = `<div class="empty">${escapeHtml(t("list.empty"))}</div>`;
    return;
  }

  items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "card" + (state.selectedItemId === item.id ? " active" : "");
    const isFolder = item.type === "folder";
    const bookmarkIconHtml = item.icon
      ? `<img class="card-favicon" src="${escapeHtml(item.icon)}" alt="" />`
      : "🔗";
    const parent = findParentOf(item.id);
    const pathInfo = parent && parent.id !== folder.id ? t("list.pathPrefix") + pathToNode(item.id).map(x => x.title).join(" / ") : "";
    const itemTypeLabel = isFolder ? t("list.itemTypes.folder") : t("list.itemTypes.bookmark");

    card.innerHTML = `<div>
      <div class="card-title">${isFolder ? "📁" : bookmarkIconHtml} <span>${escapeHtml(item.title || "")}</span></div>
      ${!isFolder ? `<div class="url-text">${escapeHtml(item.href || "")}</div>` : ""}
      <div class="meta">
        <span>${escapeHtml(t("list.metaType", { type: itemTypeLabel }))}</span>
        ${isFolder ? `<span>${escapeHtml(t("list.metaItemCount", { count: item.children.length }))}</span>` : ""}
        ${pathInfo ? `<span>${escapeHtml(pathInfo)}</span>` : ""}
      </div>
    </div>
    <div class="actions">
      ${isFolder ? `<button class="btn btn-open">${escapeHtml(t("list.buttons.enter"))}</button>` : `<div class="icon-actions"><button class="icon-btn btn-copy-url" title="${escapeHtml(t("list.buttons.copyUrl"))}" aria-label="${escapeHtml(t("list.buttons.copyUrl"))}">⧉</button><button class="icon-btn btn-open-url" title="${escapeHtml(t("list.buttons.openUrl"))}" aria-label="${escapeHtml(t("list.buttons.openUrl"))}">↗</button></div>`}
    </div>`;

    const btnOpen = card.querySelector(".btn-open");
    if (btnOpen){
      btnOpen.onclick = e => {
        e.stopPropagation();
        actions.selectFolder(item.id);
      };
    }

    const btnCopyUrl = card.querySelector(".btn-copy-url");
    if (btnCopyUrl){
      btnCopyUrl.onclick = async e => {
        e.stopPropagation();
        const copied = await copyTextToClipboard(item.href || "");
        btnCopyUrl.textContent = copied ? "✓" : "!";
        setTimeout(() => { btnCopyUrl.textContent = "⧉"; }, 900);
      };
    }

    const btnOpenUrl = card.querySelector(".btn-open-url");
    if (btnOpenUrl){
      btnOpenUrl.onclick = e => {
        e.stopPropagation();
        openBookmarkUrl(item.href);
      };
    }

    card.addEventListener("click", e => {
      if (e.target.closest("button")) return;
      actions.selectItem(item.id);
    });

    card.addEventListener("dblclick", e => {
      if (e.target.closest("button")) return;
      if (isFolder) actions.selectFolder(item.id);
    });

    cardDragEvents(runtime, card, item, index, folder);
    dom.list.appendChild(card);
  });
}
