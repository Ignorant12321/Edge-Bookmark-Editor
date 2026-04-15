import { state } from "./state.js";
import { findById, findParentOf } from "./tree-model.js";
import { t } from "../i18n/index.js";

export function renderEditor(runtime){
  const { dom, actions } = runtime;
  const info = findById(state.selectedItemId);
  if (!info){
    dom.editorEmpty.classList.remove("hidden");
    dom.editorForm.classList.add("hidden");
    dom.editorType.textContent = t("editor.type.none");
    return;
  }

  const item = info.node;
  const isFolder = item.type === "folder";
  dom.editorEmpty.classList.add("hidden");
  dom.editorForm.classList.remove("hidden");
  dom.editorType.textContent = isFolder ? t("editor.type.folder") : t("editor.type.bookmark");
  dom.fieldUrl.classList.toggle("hidden", isFolder);
  dom.fieldIcon.classList.toggle("hidden", isFolder);
  dom.editTitle.value = item.title || "";
  dom.editHref.value = item.href || "";
  dom.editIcon.value = item.icon || "";
  actions.updateIconPreview(item.icon || "");

  const owner = findParentOf(item.id);
  const siblingIndex = owner ? owner.children.findIndex(x => x.id === item.id) : -1;
  const siblingCount = owner ? owner.children.length : 0;
  if (dom.btnMoveUp) dom.btnMoveUp.disabled = !owner || siblingIndex <= 0;
  if (dom.btnMoveDown) dom.btnMoveDown.disabled = !owner || siblingIndex === -1 || siblingIndex >= siblingCount - 1;
  if (dom.btnMove) dom.btnMove.disabled = !owner;
  if (dom.btnCopyAction) dom.btnCopyAction.disabled = !owner;
  if (dom.btnDissolve){
    dom.btnDissolve.classList.toggle("hidden", !isFolder);
    dom.btnDissolve.disabled = !isFolder || !owner;
  }
  if (dom.btnDelete) dom.btnDelete.disabled = !owner;
}
