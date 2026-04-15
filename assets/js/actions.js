import { state, cloneDeep, reseedIds, createFolder, createBookmark, uid } from "./state.js";
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
  moveItemRelativeToTarget,
  reorderWithinFolder,
  pathToNode,
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
const HISTORY_LIMIT = 120;
let iconBatchRunning = false;
let toastTimer = null;
let editorHistoryTimer = null;
let pendingEditorSnapshot = null;

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

function setLastAction(runtime, key, vars={}){
  state.lastAction = { key, vars };
}

function getNodeActionTitle(node){
  if (!node) return "";
  if (node.type === "folder") return node.title || t("defaults.untitledFolder");
  if (node.type === "bookmark") return node.title || t("defaults.untitledBookmark");
  return node.title || "";
}

function buildIconCandidates(href, mode="auto"){
  try {
    const url = new URL(String(href || "").trim());
    if (!/^https?:$/i.test(url.protocol)) return [];
    const hostname = url.hostname;
    const protocol = /^https?:$/i.test(url.protocol) ? url.protocol.toLowerCase() : "https:";
    const oppositeProtocol = protocol === "https:" ? "http:" : "https:";
    const primaryOrigin = `${protocol}//${hostname}`;
    const fallbackOrigin = `${oppositeProtocol}//${hostname}`;
    const encodedHref = encodeURIComponent(url.href);
    const normalizedMode = String(mode || "auto").toLowerCase() === "google" ? "googles2" : String(mode || "auto").toLowerCase();
    const candidatesByMode = {
      auto: [
        `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
        `${primaryOrigin}/favicon.ico`,
        `${primaryOrigin}/apple-touch-icon.png`,
        `${primaryOrigin}/apple-touch-icon-precomposed.png`,
        `${fallbackOrigin}/favicon.ico`,
        // Keep Google only as final fallback: improves long-tail site hit rate
        // when reachable, and harmlessly fails when blocked.
        `https://www.google.com/s2/favicons?domain_url=${encodedHref}&sz=64`,
      ],
      duckduckgo: [`https://icons.duckduckgo.com/ip3/${hostname}.ico`],
      favicon: [`${primaryOrigin}/favicon.ico`, `${fallbackOrigin}/favicon.ico`],
      apple: [`${primaryOrigin}/apple-touch-icon.png`, `${primaryOrigin}/apple-touch-icon-precomposed.png`],
      googles2: [`https://www.google.com/s2/favicons?domain_url=${encodedHref}&sz=64`],
      google: [`https://www.google.com/s2/favicons?domain_url=${encodedHref}&sz=64`],
    };
    const candidates = candidatesByMode[normalizedMode] || candidatesByMode.auto;
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
  const fallback = dom.iconPreviewFallback;
  if (!src){
    dom.iconPreview.classList.add("hidden");
    dom.iconPreview.removeAttribute("src");
    fallback?.classList.remove("hidden");
    return;
  }
  fallback?.classList.remove("hidden");
  dom.iconPreview.onload = () => {
    dom.iconPreview.classList.remove("hidden");
    fallback?.classList.add("hidden");
  };
  dom.iconPreview.onerror = () => {
    dom.iconPreview.classList.add("hidden");
    fallback?.classList.remove("hidden");
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

async function resizeDataUrlToSquare(dataUrl, size=32){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx){
        resolve(dataUrl);
        return;
      }
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("resize-failed"));
    img.src = dataUrl;
  });
}

async function fetchIconForBookmarkNode(runtime, bookmark, mode="auto"){
  if (!bookmark || bookmark.type !== "bookmark") return { ok:false, reason:"not-bookmark" };
  const candidates = buildIconCandidates(bookmark.href, mode);
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

export async function loadIconFileToEditor(runtime, file, sizeOverride){
  if (!file) return;
  const size = Number.isFinite(Number(sizeOverride)) ? Math.max(16, Number(sizeOverride)) : Number(state.iconUploadSize || 32);
  try {
    const rawDataUrl = await readFileAsDataUrl(file);
    let dataUrl = rawDataUrl;
    try {
      dataUrl = await resizeDataUrlToSquare(rawDataUrl, size);
    } catch {
      dataUrl = rawDataUrl;
    }
    runtime.dom.editIcon.value = dataUrl;
    updateIconPreview(runtime, dataUrl);
    const selected = findById(state.selectedItemId)?.node;
    if (selected?.type === "bookmark"){
      setLastAction(runtime, "history.uploadIcon", { title: getNodeActionTitle(selected), size });
    }
  } catch (err){
    alert(err instanceof Error ? err.message : t("alerts.readImageFailed"));
  }
}

function focusEditorTitleInput(runtime){
  const input = runtime?.dom?.editTitle;
  if (!input) return;
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function snapshotState(){
  if (!state.root) return null;
  return {
    root: cloneDeep(state.root),
    selectedFolderId: state.selectedFolderId,
    breadcrumbFolderId: state.breadcrumbFolderId,
    selectedItemId: state.selectedItemId,
    expanded: Array.from(state.expanded),
  };
}

function syncNextIdFromRoot(){
  if (!state.root) return;
  let maxId = 0;
  walk(state.root).forEach(({ node }) => {
    const match = /^n(\d+)$/.exec(String(node.id || ""));
    if (match) maxId = Math.max(maxId, Number(match[1]));
  });
  state.nextId = Math.max(state.nextId, maxId + 1);
}

function restoreSnapshot(snapshot){
  if (!snapshot?.root) return;
  state.root = cloneDeep(snapshot.root);
  state.expanded = new Set(snapshot.expanded || []);
  state.selectedFolderId = snapshot.selectedFolderId;
  state.breadcrumbFolderId = snapshot.breadcrumbFolderId;
  state.selectedItemId = snapshot.selectedItemId;

  const selectedFolder = findById(state.selectedFolderId)?.node;
  if (!selectedFolder || selectedFolder.type !== "folder"){
    state.selectedFolderId = state.root.id;
  }
  const breadcrumbFolder = findById(state.breadcrumbFolderId)?.node;
  if (!breadcrumbFolder || breadcrumbFolder.type !== "folder"){
    state.breadcrumbFolderId = state.selectedFolderId;
  }
  if (!findById(state.selectedItemId)){
    state.selectedItemId = state.selectedFolderId;
  }
  syncNextIdFromRoot();
}

function pushHistorySnapshot(snapshot){
  if (!snapshot?.root) return;
  state.historyPast.push(snapshot);
  if (state.historyPast.length > HISTORY_LIMIT) state.historyPast.shift();
  state.historyFuture = [];
}

function queueEditorHistorySnapshot(snapshot){
  if (!snapshot?.root) return;
  if (!pendingEditorSnapshot) pendingEditorSnapshot = snapshot;
  if (editorHistoryTimer) return;
  editorHistoryTimer = setTimeout(() => {
    if (pendingEditorSnapshot) pushHistorySnapshot(pendingEditorSnapshot);
    pendingEditorSnapshot = null;
    editorHistoryTimer = null;
  }, 420);
}

function flushEditorHistorySnapshot(){
  if (editorHistoryTimer){
    clearTimeout(editorHistoryTimer);
    editorHistoryTimer = null;
  }
  if (pendingEditorSnapshot){
    pushHistorySnapshot(pendingEditorSnapshot);
    pendingEditorSnapshot = null;
  }
}

function recordMutationBeforeChange(){
  flushEditorHistorySnapshot();
  pushHistorySnapshot(snapshotState());
}

function clearHistoryStacks(){
  pendingEditorSnapshot = null;
  if (editorHistoryTimer){
    clearTimeout(editorHistoryTimer);
    editorHistoryTimer = null;
  }
  state.historyPast = [];
  state.historyFuture = [];
}

function setCurrentFolderState(folderId, options={}){
  const { selectedItemId=folderId, updateBreadcrumb=true } = options;
  const folder = findById(folderId)?.node;
  if (!folder || folder.type !== "folder") return false;
  state.selectedFolderId = folderId;
  state.selectedItemId = selectedItemId;
  expandPath(folderId);
  if (updateBreadcrumb) state.breadcrumbFolderId = folderId;
  return true;
}

function keepCurrentFolderWhenMovingAcrossParents(itemId, nextOwnerId){
  if (!itemId || state.selectedFolderId !== itemId) return;
  const owner = findParentOf(itemId);
  if (!owner || owner.id === nextOwnerId) return;
  state.selectedFolderId = owner.id;
  if (state.breadcrumbFolderId === itemId) state.breadcrumbFolderId = owner.id;
}

export async function fetchIconForSelectedBookmark(runtime, modeOverride){
  const info = findById(state.selectedItemId);
  if (!info || info.node.type !== "bookmark"){
    alert(t("alerts.selectBookmarkFirst"));
    return;
  }
  const snapshot = snapshotState();
  showToast(runtime, t("toasts.fetchCurrentStart"), { sticky:true });
  const mode = String(modeOverride || state.iconFetchMode || "auto");
  const result = await fetchIconForBookmarkNode(runtime, info.node, mode);
  if (result.ok){
    pushHistorySnapshot(snapshot);
    runtime.dom.editIcon.value = info.node.icon || "";
    updateIconPreview(runtime, info.node.icon || "");
    setLastAction(runtime, "history.fetchIcon", { title: getNodeActionTitle(info.node) });
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
  const snapshot = snapshotState();
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
  if (success > 0) pushHistorySnapshot(snapshot);

  showToast(runtime, t("toasts.batchDone", { success, failed }));
  setLastAction(runtime, "history.fetchMissingIcons", { success, failed });
  runtime.render();
}

export function selectFolder(runtime, id, options={}){
  if (!setCurrentFolderState(id, options)) return;
  runtime.render();
}

export function locateItem(runtime, id, options={}){
  const info = findById(id);
  if (!info) return;
  if (info.node.type === "folder"){
    if (setCurrentFolderState(id, options)) runtime.render();
    return;
  }
  const owner = findParentOf(id);
  if (!owner) return;
  if (setCurrentFolderState(owner.id, { ...options, selectedItemId: id })) runtime.render();
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
  const snapshot = snapshotState();
  const changed = applyEditorValues(runtime);
  if (!changed) return;
  pushHistorySnapshot(snapshot);
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

  const newTitle = item.title || "";
  const newHref = item.href || "";
  if (oldSnapshot.title !== newTitle){
    setLastAction(runtime, "history.rename", {
      from: oldSnapshot.title || (item.type === "folder" ? t("defaults.untitledFolder") : t("defaults.untitledBookmark")),
      to: newTitle,
    });
  } else if (item.type === "bookmark" && oldSnapshot.href !== newHref){
    setLastAction(runtime, "history.updateUrl", {
      title: getNodeActionTitle(item),
      url: newHref,
    });
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
  const snapshot = snapshotState();
  const changed = applyEditorValues(runtime);
  if (!changed) return;
  queueEditorHistorySnapshot(snapshot);
  runtime.renderTree();
  runtime.renderList();
  runtime.renderLastAction?.();
}

export function moveItemToFolderWithState(runtime, itemId, targetFolderId, targetIndex=null, options={}){
  const { render=true } = options;
  const owner = findParentOf(itemId);
  if (!owner) return false;
  const itemTitle = getNodeActionTitle(findById(itemId)?.node);
  const targetTitle = getNodeActionTitle(findById(targetFolderId)?.node);
  recordMutationBeforeChange();
  keepCurrentFolderWhenMovingAcrossParents(itemId, targetFolderId);
  moveItemToFolder(itemId, targetFolderId, targetIndex);
  setLastAction(runtime, "history.moveTo", { title: itemTitle, target: targetTitle });
  if (render) runtime.render();
  return true;
}

export function moveItemRelativeWithState(runtime, itemId, targetId, place, options={}){
  const { render=true, trackAction=true } = options;
  const owner = findParentOf(itemId);
  const targetOwner = findParentOf(targetId);
  if (!owner || !targetOwner) return false;
  const itemTitle = getNodeActionTitle(findById(itemId)?.node);
  const targetTitle = getNodeActionTitle(findById(targetId)?.node);
  recordMutationBeforeChange();
  keepCurrentFolderWhenMovingAcrossParents(itemId, targetOwner.id);
  moveItemRelativeToTarget(itemId, targetId, place);
  if (trackAction){
    const key = place === "before" ? "history.reorderBefore" : "history.reorderAfter";
    setLastAction(runtime, key, { title: itemTitle, target: targetTitle });
  }
  if (render) runtime.render();
  return true;
}

export function reorderItemWithState(runtime, folderId, itemId, targetIndex, options={}){
  const { render=true, trackAction=true } = options;
  const itemTitle = getNodeActionTitle(findById(itemId)?.node);
  recordMutationBeforeChange();
  reorderWithinFolder(folderId, itemId, targetIndex);
  if (trackAction){
    setLastAction(runtime, "history.reorder", { title: itemTitle });
  }
  if (render) runtime.render();
}

export function moveSelectedByOffset(runtime, offset){
  const itemId = state.selectedItemId;
  const owner = findParentOf(itemId);
  if (!owner) return;
  const index = owner.children.findIndex(x => x.id === itemId);
  if (index === -1) return;
  const itemTitle = getNodeActionTitle(owner.children[index]);
  const nextIndex = Math.max(0, Math.min(owner.children.length - 1, index + offset));
  if (nextIndex === index) return;
  // reorderWithinFolder expects insertion index based on the original array,
  // so moving downward needs +1 to land at the expected final position.
  const insertionIndex = nextIndex > index ? nextIndex + 1 : nextIndex;
  reorderItemWithState(runtime, owner.id, itemId, insertionIndex, { trackAction:false });
  setLastAction(runtime, offset > 0 ? "history.moveDown" : "history.moveUp", { title: itemTitle });
}

export function deleteSelected(runtime){
  const itemId = state.selectedItemId;
  const owner = findParentOf(itemId);
  const item = findById(itemId)?.node;
  if (!owner || !item) return alert(t("alerts.cannotDeleteRoot"));
  if (!confirm(t("alerts.confirmDelete", { title: item.title }))) return;
  recordMutationBeforeChange();
  owner.children = owner.children.filter(c => c.id !== itemId);
  touchLastModified(owner);
  if (state.selectedFolderId === itemId){
    state.selectedFolderId = owner.id;
    if (state.breadcrumbFolderId === itemId) state.breadcrumbFolderId = owner.id;
  }
  if (!findById(state.selectedFolderId)) state.selectedFolderId = owner.id;
  state.selectedItemId = findById(state.selectedFolderId)?.node ? state.selectedFolderId : owner.id;
  setLastAction(runtime, "history.delete", { title: getNodeActionTitle(item) });
  runtime.render();
}

export function dissolveSelected(runtime){
  const info = findById(state.selectedItemId);
  if (!info || info.node.type !== "folder"){
    alert(t("alerts.selectFolderFirst"));
    return;
  }
  const folder = info.node;
  if (folder.id === state.root?.id){
    alert(t("alerts.cannotDissolveRoot"));
    return;
  }
  const targetFolder = getCurrentFolder();
  if (!targetFolder || targetFolder.type !== "folder") return;
  if (targetFolder.id === folder.id){
    alert(t("alerts.cannotDissolveCurrentFolder"));
    return;
  }
  const owner = findParentOf(folder.id);
  if (!owner) return;
  const targetPath = pathToNode(targetFolder.id).map(x => x.id);
  if (targetPath.includes(folder.id)){
    alert(t("alerts.cannotDissolveIntoDescendant"));
    return;
  }
  if (!confirm(t("alerts.confirmDissolve", { title: folder.title, target: targetFolder.title }))) return;
  recordMutationBeforeChange();

  const index = owner.children.findIndex(x => x.id === folder.id);
  if (index === -1) return;
  const children = folder.children || [];
  if (owner.id === targetFolder.id){
    owner.children.splice(index, 1, ...children);
    touchLastModified(owner);
  } else {
    owner.children.splice(index, 1);
    targetFolder.children.push(...children);
    touchLastModified(owner);
    touchLastModified(targetFolder);
  }

  if (state.selectedFolderId === folder.id){
    state.selectedFolderId = owner.id;
    if (state.breadcrumbFolderId === folder.id) state.breadcrumbFolderId = owner.id;
  }
  state.selectedItemId = targetFolder.id;
  setLastAction(runtime, "history.dissolve", { title: getNodeActionTitle(folder), target: getNodeActionTitle(targetFolder) });
  runtime.render();
}

function cloneNodeWithNewIds(node){
  const cloned = cloneDeep(node);
  function renew(current){
    current.id = uid();
    if (current.type === "folder"){
      current.children = (current.children || []).map(child => renew(child));
    }
    return current;
  }
  return renew(cloned);
}

export function copySelected(runtime){
  const info = findById(state.selectedItemId);
  if (!info) return;
  const owner = findParentOf(info.node.id);
  if (!owner) return alert(t("alerts.cannotCopyRoot"));
  recordMutationBeforeChange();
  const cloned = cloneNodeWithNewIds(info.node);
  const idx = owner.children.findIndex(x => x.id === info.node.id);
  owner.children.splice(idx + 1, 0, cloned);
  touchLastModified(owner);
  if (cloned.type === "folder") state.expanded.add(cloned.id);
  state.selectedItemId = cloned.id;
  setLastAction(runtime, "history.copy", { title: getNodeActionTitle(info.node) });
  runtime.render();
  focusEditorTitleInput(runtime);
}

export function addFolder(runtime){
  const folder = getCurrentFolder();
  recordMutationBeforeChange();
  const node = createFolder();
  folder.children.unshift(node);
  touchLastModified(folder);
  state.expanded.add(folder.id);
  state.selectedItemId = node.id;
  setLastAction(runtime, "history.addFolder", { title: getNodeActionTitle(node) });
  runtime.render();
  focusEditorTitleInput(runtime);
}

export function addBookmark(runtime){
  const folder = getCurrentFolder();
  recordMutationBeforeChange();
  const node = createBookmark();
  folder.children.unshift(node);
  touchLastModified(folder);
  state.expanded.add(folder.id);
  state.selectedItemId = node.id;
  setLastAction(runtime, "history.addBookmark", { title: getNodeActionTitle(node) });
  runtime.render();
  focusEditorTitleInput(runtime);
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
  moveItemToFolderWithState(runtime, itemId, targetFolderId, null, { render:false });
  closeMoveModal(runtime);
  runtime.render();
}

export function locateSelectionInTree(runtime){
  const info = findById(state.selectedItemId);
  if (!info) return;
  if (info.node.type === "folder") expandPath(info.node.id);
  else {
    const owner = findParentOf(info.node.id);
    if (owner) expandPath(owner.id);
  }
  runtime.renderTree();
  const treeEl = runtime.dom.tree;
  const row = treeEl?.querySelector(`.tree-row[data-node-id="${info.node.id}"]`);
  if (row){
    row.scrollIntoView({ block:"center", behavior:"smooth" });
    row.classList.add("locate-flash");
    setTimeout(() => row.classList.remove("locate-flash"), 640);
  }
}

export function undo(runtime){
  flushEditorHistorySnapshot();
  const snapshot = state.historyPast.pop();
  if (!snapshot) return;
  const current = snapshotState();
  if (current?.root){
    state.historyFuture.push(current);
    if (state.historyFuture.length > HISTORY_LIMIT) state.historyFuture.shift();
  }
  restoreSnapshot(snapshot);
  setLastAction(runtime, "history.undo");
  runtime.render();
}

export function redo(runtime){
  flushEditorHistorySnapshot();
  const snapshot = state.historyFuture.pop();
  if (!snapshot) return;
  const current = snapshotState();
  if (current?.root){
    state.historyPast.push(current);
    if (state.historyPast.length > HISTORY_LIMIT) state.historyPast.shift();
  }
  restoreSnapshot(snapshot);
  setLastAction(runtime, "history.redo");
  runtime.render();
}

export function setRoot(runtime, root, options={}){
  state.root = root;
  if (options.rememberOriginal !== false) state.originalRoot = cloneDeep(root);
  state.selectedFolderId = root.id;
  state.breadcrumbFolderId = root.id;
  state.selectedItemId = root.id;
  state.expanded = new Set([root.id]);
  state.lastAction = null;
  clearHistoryStacks();
  syncNextIdFromRoot();
  showToast(runtime, "");
  runtime.render();
}

export function loadPreloaded(runtime){
  setRoot(runtime, parseBookmarkHtml(decodeBase64Utf8(PRELOADED_BOOKMARK_HTML_BASE64)), {rememberOriginal:true});
  setLastAction(runtime, "history.loadSample");
  runtime.render();
}

export function restoreOriginalData(runtime){
  if (!state.originalRoot) return;
  const restored = reseedIds(cloneDeep(state.originalRoot));
  setRoot(runtime, restored, {rememberOriginal:false});
  setLastAction(runtime, "history.restoreOriginal");
  runtime.render();
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
  setLastAction(runtime, "history.importHtml");
  runtime.render();
}

export function importJsonText(runtime, text){
  setRoot(runtime, importJson(text), {rememberOriginal:true});
  setLastAction(runtime, "history.importJson");
  runtime.render();
}

export function createActions(runtime){
  return {
    saveEditor: () => saveEditor(runtime),
    autosaveEditor: () => autosaveEditor(runtime),
    deleteSelected: () => deleteSelected(runtime),
    dissolveSelected: () => dissolveSelected(runtime),
    copySelected: () => copySelected(runtime),
    moveSelectedUp: () => moveSelectedByOffset(runtime, -1),
    moveSelectedDown: () => moveSelectedByOffset(runtime, 1),
    addFolder: () => addFolder(runtime),
    addBookmark: () => addBookmark(runtime),
    openMoveModal: () => openMoveModal(runtime),
    closeMoveModal: () => closeMoveModal(runtime),
    confirmMove: () => confirmMove(runtime),
    moveItemToFolder: (itemId, folderId, targetIndex, options) => moveItemToFolderWithState(runtime, itemId, folderId, targetIndex, options),
    moveItemRelativeToTarget: (itemId, targetId, place, options) => moveItemRelativeWithState(runtime, itemId, targetId, place, options),
    reorderWithinFolder: (folderId, itemId, targetIndex, options) => reorderItemWithState(runtime, folderId, itemId, targetIndex, options),
    restoreOriginalData: () => restoreOriginalData(runtime),
    undo: () => undo(runtime),
    redo: () => redo(runtime),
    locateSelectionInTree: () => locateSelectionInTree(runtime),
    applyTheme: theme => applyTheme(runtime, theme),
    initTheme: () => initTheme(runtime),
    selectFolder: (id, options) => selectFolder(runtime, id, options),
    locateItem: (id, options) => locateItem(runtime, id, options),
    selectItem: id => selectItem(runtime, id),
    setRoot: (root, options) => setRoot(runtime, root, options),
    loadPreloaded: () => loadPreloaded(runtime),
    importHtmlText: text => importHtmlText(runtime, text),
    importJsonText: text => importJsonText(runtime, text),
    normalizeIconInput: raw => normalizeIconInput(runtime, raw),
    updateIconPreview: raw => updateIconPreview(runtime, raw),
    loadIconFileToEditor: (file, size) => loadIconFileToEditor(runtime, file, size),
    fetchIconForSelectedBookmark: mode => fetchIconForSelectedBookmark(runtime, mode),
    fetchIconsForAllMissing: () => fetchIconsForAllMissing(runtime),
  };
}
