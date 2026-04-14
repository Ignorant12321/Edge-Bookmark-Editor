import { state } from "./state.js";

function nowUnix(){
  return String(Math.floor(Date.now()/1000));
}

export function touchLastModified(node){
  if (!node || node.type !== "folder" && node.type !== "bookmark") return;
  node.lastModified = nowUnix();
}

export function walk(node, parent=null, list=[]){
  if (!node) return list;
  list.push({node,parent});
  if (node.type === "folder") node.children.forEach(child => walk(child, node, list));
  return list;
}

export function findById(id){
  if (!state.root) return null;
  return walk(state.root).find(x => x.node.id === id) || null;
}

export function findParentOf(id){
  if (!state.root) return null;
  return walk(state.root).find(x => x.node.type === "folder" && x.node.children.some(c => c.id === id))?.node || null;
}

export function pathToNode(id){
  const path = [];
  function dfs(node){
    if (node.id === id){
      path.push(node);
      return true;
    }
    if (node.type === "folder"){
      for (const child of node.children){
        if (dfs(child)){
          path.unshift(node);
          return true;
        }
      }
    }
    return false;
  }
  if (state.root) dfs(state.root);
  return path;
}

export function getCurrentFolder(){
  return findById(state.selectedFolderId)?.node || state.root;
}

export function expandPath(id){
  pathToNode(id).forEach(n => state.expanded.add(n.id));
}

export function countDirectBookmarkCount(folder){
  return folder.children.filter(x => x.type === "bookmark").length;
}

export function countCurrentItems(folder){
  const folders = folder.children.filter(x => x.type === "folder").length;
  const bookmarks = folder.children.filter(x => x.type === "bookmark").length;
  return {folders, bookmarks};
}

export function countStats(){
  const all = walk(state.root);
  return {
    folders: Math.max(0, all.filter(x => x.node.type === "folder").length - 1),
    bookmarks: all.filter(x => x.node.type === "bookmark").length,
  };
}

function matchText(item, q){
  if (!q) return true;
  const text = [item.title || "", item.href || "", item.type].join(" ").toLowerCase();
  return text.includes(q);
}

function matchType(item){
  return state.typeFilter === "all" ? true : item.type === state.typeFilter;
}

function folderDescendants(folder, includeSelf=false, list=[]){
  if (includeSelf) list.push(folder);
  for (const child of folder.children){
    if (child.type === "folder"){
      list.push(child);
      folderDescendants(child, false, list);
    }
  }
  return list;
}

function getSearchBaseFolders(){
  const current = getCurrentFolder();
  if (!current) return [];
  if (state.searchScope === "current") return [current];
  if (state.searchScope === "subtree") return [current, ...folderDescendants(current)];
  return [state.root, ...folderDescendants(state.root)];
}

export function getVisibleItems(){
  const current = getCurrentFolder();
  if (!current) return [];
  const q = state.search.trim().toLowerCase();
  if (!q) return current.children.filter(matchType);

  const items = [];
  const seen = new Set();
  for (const folder of getSearchBaseFolders()){
    for (const child of folder.children){
      if (matchText(child, q) && matchType(child) && !seen.has(child.id)){
        items.push(child);
        seen.add(child.id);
      }
    }
  }
  return items;
}

export function canMoveToTarget(itemId, targetFolderId){
  const item = findById(itemId)?.node;
  const target = findById(targetFolderId)?.node;
  if (!item || !target || target.type !== "folder") return false;
  if (item.id === target.id) return false;
  if (item.type === "folder"){
    const desc = walk(item).map(x => x.node.id);
    if (desc.includes(targetFolderId)) return false;
  }
  return true;
}

export function moveItemToFolder(itemId, targetFolderId, targetIndex=null){
  const owner = findParentOf(itemId);
  const target = findById(targetFolderId)?.node;
  const item = findById(itemId)?.node;
  if (!owner || !target || target.type !== "folder" || !item) return;
  if (item.type === "folder"){
    const desc = walk(item).map(x => x.node.id);
    if (desc.includes(targetFolderId)) return;
  }
  owner.children = owner.children.filter(c => c.id !== itemId);
  if (targetIndex == null || targetIndex > target.children.length) target.children.push(item);
  else target.children.splice(targetIndex, 0, item);
  touchLastModified(owner);
  touchLastModified(target);
}

export function moveItemRelativeToTarget(itemId, targetId, place){
  const itemOwner = findParentOf(itemId);
  const targetOwner = findParentOf(targetId);
  const target = findById(targetId)?.node;
  if (!itemOwner || !targetOwner || !target) return;
  if (place === "inside"){
    if (target.type !== "folder") return;
    moveItemToFolder(itemId, targetId);
    return;
  }
  const targetIndex = targetOwner.children.findIndex(x => x.id === targetId);
  if (targetIndex === -1) return;
  const item = findById(itemId)?.node;
  if (!item) return;
  if (item.type === "folder"){
    const desc = walk(item).map(x => x.node.id);
    if (desc.includes(targetId)) return;
  }
  itemOwner.children = itemOwner.children.filter(c => c.id !== itemId);
  const freshIndex = targetOwner.children.findIndex(x => x.id === targetId);
  const insertIndex = place === "before" ? freshIndex : freshIndex + 1;
  targetOwner.children.splice(insertIndex, 0, item);
  touchLastModified(itemOwner);
  touchLastModified(targetOwner);
}

export function reorderWithinFolder(folderId, itemId, targetIndex){
  const folder = findById(folderId)?.node;
  if (!folder || folder.type !== "folder") return;
  const idx = folder.children.findIndex(x => x.id === itemId);
  if (idx === -1) return;
  const [item] = folder.children.splice(idx, 1);
  if (targetIndex > idx) targetIndex--;
  folder.children.splice(targetIndex, 0, item);
  touchLastModified(folder);
}
