import { state } from "./state.js";
import { findById } from "./tree-model.js";
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
}
