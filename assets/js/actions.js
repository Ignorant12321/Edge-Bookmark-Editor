import { state, cloneDeep, reseedIds, createFolder, createBookmark } from "./state.js";
import { PRELOADED_BOOKMARK_HTML_BASE64 } from "./constants.js";
import { decodeBase64Utf8 } from "./utils.js";
import { parseBookmarkHtml, importJson } from "./bookmark-format.js";
import { t } from "../i18n/index.js";
import {
  walk,
  findById,
  findParentOf,
  getCurrentFolder,
  expandPath,
  moveItemToFolder,
  touchLastModified,
} from "./tree-model.js";

/**
 * Node shape docs:
 * FolderNode: { id, type:"folder", title, addDate, lastModified, personalToolbarFolder?, children: BookmarkNode[] }
 * LinkNode: { id, type:"bookmark", title, href, addDate, lastModified, icon? }
 * BookmarkNode: FolderNode | LinkNode
 *
 * ICON input normalize rules:
 * 1) keep data:image/... and http(s) URLs as-is
 * 2) if raw Base64 (no prefix), convert to data:image/png;base64,...
 * 3) local file input is converted to data URL before save
 */
const ICON_FETCH_CONCURRENCY = 4;
let iconBatchRunning = false;
let toastTimer = null;

function showToast(runtime, text="", options={}){
  const { sticky=false, duration=2400 } = options;
  const { toast } = runtime.dom;
  if (!toast) return;
  toast.textContent = text || "";
  toast.classList.toggle("hidden", !text);
  if (toastTimer){
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (!text) return;
  if (!sticky){
    toastTimer = setTimeout(() => {
      toast.classList.add("hidden");
      toast.textContent = "";
      toastTimer = null;
    }, duration);
  }
}

function buildIconCandidates(href){
  try {
    const url = new URL(String(href || "").trim());
    if (!/^https?:$/i.test(url.protocol)) return [];
    const hostname = url.hostname;
    const protocol = /^https?:$/i.test(url.protocol) ? url.protocol.toLowerCase() : "https:";
    const oppositeProtocol = protocol === "https:" ? "http:" : "https:";
    const primaryOrigin = `${protocol}//${hostname}`;
    const fallbackOrigin = `${oppositeProtocol}//${hostname}`;
    const encodedHref = encodeURIComponent(url.href);
    const candidates = [
      `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
      `${primaryOrigin}/favicon.ico`,
      `${primaryOrigin}/apple-touch-icon.png`,
      `${primaryOrigin}/apple-touch-icon-precomposed.png`,
      `${fallbackOrigin}/favicon.ico`,
      // Keep Google only as final fallback: improves long-tail site hit rate
      // when reachable, and harmlessly fails when blocked.
      `https://www.google.com/s2/favicons?domain_url=${encodedHref}&sz=64`,
    ];
    return Array.from(new Set(candidates));
  } catch {
    return [];
  }
}

function canLoadImage(url, timeoutMs=4500){
  return new Promise(resolve => {
    let settled = false;
    const img = new Image();
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, timeoutMs);
    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

function updateIconPreviewElement(dom, iconValue){
  if (!dom.iconPreview) return;
  const src = String(iconValue || "").trim();
  if (!src){
    dom.iconPreview.classList.add("hidden");
    dom.iconPreview.removeAttribute("src");
    return;
  }
  dom.iconPreview.onload = () => {
    dom.iconPreview.classList.remove("hidden");
  };
  dom.iconPreview.onerror = () => {
    dom.iconPreview.classList.add("hidden");
  };
  dom.iconPreview.src = src;
}

async function readFileAsDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(t("alerts.readImageFailed")));
    reader.readAsDataURL(file);
  });
}

async function fetchIconForBookmarkNode(runtime, bookmark){
  if (!bookmark || bookmark.type !== "bookmark") return { ok:false, reason:"not-bookmark" };
  const candidates = buildIconCandidates(bookmark.href);
  if (!candidates.length) return { ok:false, reason:"invalid-url" };
  for (const candidate of candidates){
    // Image probing avoids CORS fetch limitations and keeps this client-only.
    if (await canLoadImage(candidate)){
      bookmark.icon = candidate;
      touchLastModified(bookmark);
      return { ok:true, icon:candidate };
    }
  }
  return { ok:false, reason:"all-failed" };
}

export function normalizeIconInput(runtime, rawValue){
  const value = String(rawValue ?? runtime.dom.editIcon?.value ?? "").trim();
  if (!value) return "";
  if (/^data:image\//i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^data:/i.test(value)) return value;
  const compact = value.replace(/\s+/g, "");
  if (/^[A-Za-z0-9+/=]+$/.test(compact) && compact.length >= 32){
    return `data:image/png;base64,${compact}`;
  }
  return value;
}

export function updateIconPreview(runtime, rawValue){
  const normalized = normalizeIconInput(runtime, rawValue);
  updateIconPreviewElement(runtime.dom, normalized);
}

export async function loadIconFileToEditor(runtime, file){
  if (!file) return;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    runtime.dom.editIcon.value = dataUrl;
    updateIconPreview(runtime, dataUrl);
  } catch (err){
    alert(err instanceof Error ? err.message : t("alerts.readImageFailed"));
  }
}

export async function fetchIconForSelectedBookmark(runtime){
  const info = findById(state.selectedItemId);
  if (!info || info.node.type !== "bookmark"){
    alert(t("alerts.selectBookmarkFirst"));
    return;
  }
  showToast(runtime, t("toasts.fetchCurrentStart"), { sticky:true });
  const result = await fetchIconForBookmarkNode(runtime, info.node);
  if (result.ok){
    runtime.dom.editIcon.value = info.node.icon || "";
    updateIconPreview(runtime, info.node.icon || "");
    showToast(runtime, t("toasts.fetchCurrentSuccess"));
  } else {
    showToast(runtime, t("toasts.fetchCurrentFailed"));
  }
  runtime.render();
}

export async function fetchIconsForAllMissing(runtime){
  if (iconBatchRunning) return;
  if (!state.root){
    alert(t("alerts.importFirst"));
    return;
  }
  const targets = walk(state.root)
    .map(x => x.node)
    .filter(node => node.type === "bookmark" && !String(node.icon || "").trim() && String(node.href || "").trim());
  if (!targets.length){
    showToast(runtime, t("toasts.noMissingIcons"));
    return;
  }

  iconBatchRunning = true;
  let done = 0;
  let success = 0;
  let failed = 0;
  let cursor = 0;
  showToast(runtime, t("toasts.batchProgress", { done: 0, total: targets.length, success, failed }), { sticky:true });

  async function worker(){
    while (true){
      const idx = cursor++;
      if (idx >= targets.length) return;
      const result = await fetchIconForBookmarkNode(runtime, targets[idx]);
      done++;
      if (result.ok) success++;
      else failed++;
      showToast(runtime, t("toasts.batchProgress", { done, total: targets.length, success, failed }), { sticky:true });
    }
  }

  const workers = Array.from({ length: Math.min(ICON_FETCH_CONCURRENCY, targets.length) }, () => worker());
  await Promise.all(workers);
  iconBatchRunning = false;

  showToast(runtime, t("toasts.batchDone", { success, failed }));
  runtime.render();
}

export function selectFolder(runtime, id){
  state.selectedFolderId = id;
  state.selectedItemId = id;
  expandPath(id);
  runtime.render();
}

export function selectItem(runtime, id){
  const info = findById(id);
  if (!info) return;
  state.selectedItemId = id;
  if (info.node.type === "folder") expandPath(id);
  runtime.renderEditor();
  runtime.renderList();
  runtime.renderTree();
}

export function saveEditor(runtime){
  const changed = applyEditorValues(runtime);
  if (!changed) return;
  const info = findById(state.selectedItemId);
  if (info?.node?.type === "bookmark") updateIconPreview(runtime, info.node.icon || "");
  runtime.render();
}

function applyEditorValues(runtime){
  const { dom } = runtime;
  const info = findById(state.selectedItemId);
  if (!info) return false;
  const item = info.node;

  const oldSnapshot = {
    title: item.title || "",
    href: item.href || "",
    icon: item.icon || "",
    lastModified: item.lastModified || "",
  };

  item.title = dom.editTitle.value.trim() || (item.type === "folder" ? t("defaults.untitledFolder") : t("defaults.untitledBookmark"));

  if (item.type === "bookmark"){
    item.href = dom.editHref.value.trim();
    item.icon = normalizeIconInput(runtime, dom.editIcon.value);
  }

  const hasContentChange = oldSnapshot.title !== (item.title || "")
    || (item.type === "bookmark" && (oldSnapshot.href !== (item.href || "") || oldSnapshot.icon !== (item.icon || "")));
  if (hasContentChange) touchLastModified(item);

  return oldSnapshot.title !== (item.title || "")
    || oldSnapshot.href !== (item.href || "")
    || oldSnapshot.icon !== (item.icon || "")
    || oldSnapshot.lastModified !== (item.lastModified || "");
}

export function autosaveEditor(runtime){
  const changed = applyEditorValues(runtime);
  if (!changed) return;
  runtime.renderTree();
  runtime.renderList();
}

export function deleteSelected(runtime){
  const itemId = state.selectedItemId;
  const owner = findParentOf(itemId);
  const item = findById(itemId)?.node;
  if (!owner || !item) return alert(t("alerts.cannotDeleteRoot"));
  if (!confirm(t("alerts.confirmDelete", { title: item.title }))) return;
  owner.children = owner.children.filter(c => c.id !== itemId);
  touchLastModified(owner);
  state.selectedItemId = owner.id;
  state.selectedFolderId = owner.id;
  runtime.render();
}

export function addFolder(runtime){
  const folder = getCurrentFolder();
  const node = createFolder();
  folder.children.unshift(node);
  touchLastModified(folder);
  state.expanded.add(folder.id);
  state.selectedItemId = node.id;
  runtime.render();
}

export function addBookmark(runtime){
  const folder = getCurrentFolder();
  const node = createBookmark();
  folder.children.unshift(node);
  touchLastModified(folder);
  state.expanded.add(folder.id);
  state.selectedItemId = node.id;
  runtime.render();
}

export function openMoveModal(runtime){
  const { dom } = runtime;
  const info = findById(state.selectedItemId);
  if (!info) return;
  state.moveTargetFolderId = findParentOf(info.node.id)?.id || state.root.id;
  dom.moveModalMask.classList.add("open");
  state.expanded.add(state.root.id);
  runtime.renderMoveTree();
}

export function closeMoveModal(runtime){
  runtime.dom.moveModalMask.classList.remove("open");
}

export function confirmMove(runtime){
  const itemId = state.selectedItemId;
  const targetFolderId = state.moveTargetFolderId;
  if (!itemId || !targetFolderId) return;
  moveItemToFolder(itemId, targetFolderId);
  closeMoveModal(runtime);
  runtime.render();
}

export function setRoot(runtime, root, options={}){
  state.root = root;
  if (options.rememberOriginal !== false) state.originalRoot = cloneDeep(root);
  state.selectedFolderId = root.id;
  state.selectedItemId = root.id;
  state.expanded = new Set([root.id]);
  showToast(runtime, "");
  runtime.render();
}

export function loadPreloaded(runtime){
  setRoot(runtime, parseBookmarkHtml(decodeBase64Utf8(PRELOADED_BOOKMARK_HTML_BASE64)), {rememberOriginal:true});
}

export function restoreOriginalData(runtime){
  if (!state.originalRoot) return;
  const restored = reseedIds(cloneDeep(state.originalRoot));
  setRoot(runtime, restored, {rememberOriginal:false});
}

export function applyTheme(runtime, theme){
  document.documentElement.setAttribute("data-theme", theme);
  if (runtime.dom.themeToggleBtn){
    runtime.dom.themeToggleBtn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    runtime.dom.themeToggleBtn.dataset.theme = theme;
  }
  localStorage.setItem("bookmark_editor_theme", theme);
}

export function initTheme(runtime){
  const saved = localStorage.getItem("bookmark_editor_theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(runtime, saved || (prefersDark ? "dark" : "light"));
}

export function importHtmlText(runtime, text){
  setRoot(runtime, parseBookmarkHtml(text));
}

export function importJsonText(runtime, text){
  setRoot(runtime, importJson(text), {rememberOriginal:true});
}

export function createActions(runtime){
  return {
    saveEditor: () => saveEditor(runtime),
    autosaveEditor: () => autosaveEditor(runtime),
    deleteSelected: () => deleteSelected(runtime),
    addFolder: () => addFolder(runtime),
    addBookmark: () => addBookmark(runtime),
    openMoveModal: () => openMoveModal(runtime),
    closeMoveModal: () => closeMoveModal(runtime),
    confirmMove: () => confirmMove(runtime),
    restoreOriginalData: () => restoreOriginalData(runtime),
    applyTheme: theme => applyTheme(runtime, theme),
    initTheme: () => initTheme(runtime),
    selectFolder: id => selectFolder(runtime, id),
    selectItem: id => selectItem(runtime, id),
    setRoot: (root, options) => setRoot(runtime, root, options),
    loadPreloaded: () => loadPreloaded(runtime),
    importHtmlText: text => importHtmlText(runtime, text),
    importJsonText: text => importJsonText(runtime, text),
    normalizeIconInput: raw => normalizeIconInput(runtime, raw),
    updateIconPreview: raw => updateIconPreview(runtime, raw),
    loadIconFileToEditor: file => loadIconFileToEditor(runtime, file),
    fetchIconForSelectedBookmark: () => fetchIconForSelectedBookmark(runtime),
    fetchIconsForAllMissing: () => fetchIconsForAllMissing(runtime),
  };
}
