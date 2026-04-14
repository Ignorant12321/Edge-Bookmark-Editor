import { state } from "./state.js";
import { escapeHtml } from "./utils.js";
import {
  countDirectBookmarkCount,
  findById,
  walk,
  canMoveToTarget,
  moveItemToFolder,
  moveItemRelativeToTarget,
} from "./tree-model.js";

export function clearTreeDragMarkers(scope=document){
  scope.querySelectorAll(".tree-row").forEach(el => {
    el.classList.remove("drag-over-inside", "drag-over-before", "drag-over-after");
    delete el.dataset.dropPlace;
  });
}

function buildTree(runtime, container, opts={}){
  const {forMove=false, activeId=null} = opts;
  const { actions } = runtime;
  container.innerHTML = "";
  if (!state.root) return;

  function renderNode(node, depth=0){
    const wrap = document.createElement("div");
    wrap.className = "tree-node";
    const row = document.createElement("div");
    row.className = "tree-row" + (node.id === activeId ? " active" : "") + (node.type === "bookmark" ? " tree-bookmark" : "");
    row.style.setProperty("--depth", depth);

    const indent = document.createElement("span");
    indent.className = "tree-indent";

    const toggle = document.createElement("button");
    toggle.className = "tree-toggle";
    if (node.type === "folder"){
      toggle.textContent = state.expanded.has(node.id) ? "▾" : "▸";
      toggle.onclick = e => {
        e.stopPropagation();
        state.expanded.has(node.id) ? state.expanded.delete(node.id) : state.expanded.add(node.id);
        forMove ? runtime.renderMoveTree() : runtime.renderTree();
      };
    } else {
      toggle.textContent = "";
      toggle.disabled = true;
      toggle.style.visibility = "hidden";
    }

    const label = document.createElement("div");
    label.className = "tree-label";
    const bookmarkIconHtml = node.icon
      ? `<img class="tree-favicon" src="${escapeHtml(node.icon)}" alt="" />`
      : `<span class="tree-icon">🔗</span>`;
    const title = node.type === "folder"
      ? `<span class="tree-icon">📁</span><span class="tree-title">${escapeHtml(node.title)}</span><span class="tree-count">${countDirectBookmarkCount(node)}</span>`
      : `${bookmarkIconHtml}<span class="tree-title">${escapeHtml(node.title)}</span>`;
    label.innerHTML = title;

    row.append(indent, toggle, label);

    row.addEventListener("click", () => {
      if (forMove){
        if (node.type === "folder"){
          state.moveTargetFolderId = node.id;
          runtime.renderMoveTree();
        }
      } else {
        if (node.type === "folder"){
          state.selectedFolderId = node.id;
          state.selectedItemId = node.id;
        } else {
          state.selectedItemId = node.id;
        }
        runtime.render();
      }
    });

    row.addEventListener("dblclick", () => {
      if (!forMove && node.type === "folder") actions.selectFolder(node.id);
    });

    if (!forMove && node.id !== state.root.id){
      row.draggable = true;
      row.addEventListener("dragstart", e => {
        state.draggingId = node.id;
        row.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        state.draggingId = null;
        clearTreeDragMarkers();
      });
      row.addEventListener("dragover", e => {
        if (!state.draggingId) return;
        const draggingId = state.draggingId;
        const draggingNode = findById(draggingId)?.node;
        if (!draggingNode) return;

        let place = "after";
        const rect = row.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        if (node.type === "folder" && offsetY > rect.height * 0.28 && offsetY < rect.height * 0.72){
          if (!canMoveToTarget(draggingId, node.id)) return;
          place = "inside";
        } else {
          if (draggingNode.type === "folder"){
            const desc = walk(draggingNode).map(x => x.node.id);
            if (desc.includes(node.id)) return;
          }
          place = offsetY < rect.height / 2 ? "before" : "after";
        }
        e.preventDefault();
        clearTreeDragMarkers();
        row.classList.add(place === "inside" ? "drag-over-inside" : (place === "before" ? "drag-over-before" : "drag-over-after"));
        row.dataset.dropPlace = place;
      });
      row.addEventListener("dragleave", e => {
        if (!row.contains(e.relatedTarget)){
          row.classList.remove("drag-over-inside", "drag-over-before", "drag-over-after");
          delete row.dataset.dropPlace;
        }
      });
      row.addEventListener("drop", e => {
        if (!state.draggingId) return;
        const place = row.dataset.dropPlace || "after";
        e.preventDefault();
        if (place === "inside"){
          moveItemToFolder(state.draggingId, node.id);
          state.expanded.add(node.id);
        } else {
          moveItemRelativeToTarget(state.draggingId, node.id, place);
        }
        state.draggingId = null;
        clearTreeDragMarkers();
        delete row.dataset.dropPlace;
        runtime.render();
      });
    }

    wrap.appendChild(row);
    if (node.type === "folder" && state.expanded.has(node.id)){
      const childrenWrap = document.createElement("div");
      childrenWrap.className = "tree-children";
      node.children.forEach(child => childrenWrap.appendChild(renderNode(child, depth + 1)));
      wrap.appendChild(childrenWrap);
    }
    return wrap;
  }

  container.appendChild(renderNode(state.root, 0));
}

export function renderTree(runtime){
  buildTree(runtime, runtime.dom.tree, {activeId: state.selectedItemId || state.selectedFolderId});
}

export function renderMoveTree(runtime){
  buildTree(runtime, runtime.dom.moveTree, {forMove:true, activeId: state.moveTargetFolderId});
}
