import { state, createFolder } from "./state.js";
import { downloadText } from "./utils.js";
import { serializeBookmarkHtml } from "./bookmark-format.js";
import { createActions } from "./actions.js";
import { renderTree, renderMoveTree } from "./render-tree.js";
import { renderList, renderStats } from "./render-list.js";
import { renderEditor } from "./render-editor.js";
import { initI18n, toggleLanguage, t } from "../i18n/index.js";

function formatExportTimestamp(date=new Date()){
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function collectDom(){
  return {
    importMenuBtn: document.getElementById("importMenuBtn"),
    importMenuWrap: document.getElementById("importMenuWrap"),
    exportMenuBtn: document.getElementById("exportMenuBtn"),
    exportMenuWrap: document.getElementById("exportMenuWrap"),

    actionImportHtml: document.getElementById("actionImportHtml"),
    actionImportJson: document.getElementById("actionImportJson"),
    actionLoadSample: document.getElementById("actionLoadSample"),
    actionExportHtml: document.getElementById("actionExportHtml"),
    actionExportJson: document.getElementById("actionExportJson"),

    fileHtml: document.getElementById("fileHtml"),
    fileJson: document.getElementById("fileJson"),
    fileIcon: document.getElementById("fileIcon"),

    searchInput: document.getElementById("searchInput"),
    btnClearSearch: document.getElementById("btnClearSearch"),
    searchScope: document.getElementById("searchScope"),
    typeFilter: document.getElementById("typeFilter"),
    btnResetFilters: document.getElementById("btnResetFilters"),
    btnFetchMissingIcons: document.getElementById("btnFetchMissingIcons"),
    langToggleBtn: document.getElementById("langToggleBtn"),
    themeToggleBtn: document.getElementById("themeToggleBtn"),

    btnAddFolderCenter: document.getElementById("btnAddFolderCenter"),
    btnAddBookmark: document.getElementById("btnAddBookmark"),
    btnDelete: document.getElementById("btnDelete"),
    btnMove: document.getElementById("btnMove"),

    moveModalMask: document.getElementById("moveModalMask"),
    btnCloseMoveModal: document.getElementById("btnCloseMoveModal"),
    btnCancelMove: document.getElementById("btnCancelMove"),
    btnConfirmMove: document.getElementById("btnConfirmMove"),

    splitterLeft: document.getElementById("splitterLeft"),
    splitterRight: document.getElementById("splitterRight"),

    tree: document.getElementById("tree"),
    moveTree: document.getElementById("moveTree"),
    list: document.getElementById("list"),
    listTitle: document.getElementById("listTitle"),
    listStats: document.getElementById("listStats"),
    breadcrumbs: document.getElementById("breadcrumbs"),
    stats: document.getElementById("stats"),

    editorEmpty: document.getElementById("editorEmpty"),
    editorForm: document.getElementById("editorForm"),
    editorType: document.getElementById("editorType"),
    fieldUrl: document.getElementById("fieldUrl"),
    fieldIcon: document.getElementById("fieldIcon"),
    editTitle: document.getElementById("editTitle"),
    editHref: document.getElementById("editHref"),
    editIcon: document.getElementById("editIcon"),
    btnFetchIcon: document.getElementById("btnFetchIcon"),
    btnPickIconFile: document.getElementById("btnPickIconFile"),
    iconPreview: document.getElementById("iconPreview"),
    toast: document.getElementById("toast"),
  };
}

function setupMenu(btn, wrap){
  btn.onclick = e => {
    e.stopPropagation();
    document.querySelectorAll(".menu-wrap").forEach(x => x !== wrap && x.classList.remove("open"));
    wrap.classList.toggle("open");
  };
}

function setupSplitter(splitter, side){
  let startX = 0;
  let startVal = 0;
  splitter.addEventListener("mousedown", e => {
    if (window.innerWidth <= 860) return;
    startX = e.clientX;
    startVal = parseInt(getComputedStyle(document.documentElement).getPropertyValue(side === "left" ? "--left" : "--right"), 10);
    splitter.classList.add("dragging");

    const onMove = ev => {
      const delta = ev.clientX - startX;
      const val = side === "left" ? startVal + delta : startVal - delta;
      const clamped = Math.max(220, Math.min(560, val));
      document.documentElement.style.setProperty(side === "left" ? "--left" : "--right", clamped + "px");
    };

    const onUp = () => {
      splitter.classList.remove("dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

export function bootstrapApp(){
  const dom = collectDom();
  const runtime = { state, dom };

  const actions = createActions(runtime);
  runtime.actions = actions;

  runtime.renderTree = () => renderTree(runtime);
  runtime.renderMoveTree = () => renderMoveTree(runtime);
  runtime.renderStats = () => renderStats(runtime);
  runtime.renderList = () => renderList(runtime);
  runtime.renderEditor = () => renderEditor(runtime);
  runtime.render = () => {
    runtime.renderStats();
    runtime.renderTree();
    runtime.renderList();
    runtime.renderEditor();
    dom.btnClearSearch.classList.toggle("show", !!state.search);
  };

  setupMenu(dom.importMenuBtn, dom.importMenuWrap);
  setupMenu(dom.exportMenuBtn, dom.exportMenuWrap);
  document.addEventListener("click", () => document.querySelectorAll(".menu-wrap").forEach(x => x.classList.remove("open")));

  dom.actionImportHtml.onclick = () => dom.fileHtml.click();
  dom.actionImportJson.onclick = () => dom.fileJson.click();
  dom.actionLoadSample.onclick = actions.loadPreloaded;

  dom.actionExportHtml.onclick = () => {
    if (!state.root) return alert(t("alerts.importFirst"));
    downloadText(`bookmarks_edited_${formatExportTimestamp()}.html`, serializeBookmarkHtml(state.root), "text/html;charset=utf-8");
  };

  dom.actionExportJson.onclick = () => {
    if (!state.root) return alert(t("alerts.importFirst"));
    downloadText("bookmarks_backup.json", JSON.stringify(state.root, null, 2), "application/json;charset=utf-8");
  };

  dom.btnAddFolderCenter.onclick = actions.addFolder;
  dom.btnAddBookmark.onclick = actions.addBookmark;
  dom.btnDelete.onclick = actions.deleteSelected;
  dom.btnMove.onclick = actions.openMoveModal;
  dom.btnCloseMoveModal.onclick = actions.closeMoveModal;
  dom.btnCancelMove.onclick = actions.closeMoveModal;
  dom.btnConfirmMove.onclick = actions.confirmMove;
  dom.moveModalMask.addEventListener("click", e => {
    if (e.target.id === "moveModalMask") actions.closeMoveModal();
  });

  dom.searchInput.addEventListener("input", e => {
    state.search = e.target.value;
    runtime.render();
  });
  dom.btnClearSearch.addEventListener("click", () => {
    state.search = "";
    dom.searchInput.value = "";
    runtime.render();
  });
  dom.searchScope.addEventListener("change", e => {
    state.searchScope = e.target.value;
    runtime.render();
  });
  dom.typeFilter.addEventListener("change", e => {
    state.typeFilter = e.target.value;
    runtime.render();
  });
  dom.btnResetFilters.addEventListener("click", () => {
    actions.restoreOriginalData();
    state.search = "";
    state.searchScope = "all";
    state.typeFilter = "all";
    dom.searchInput.value = "";
    dom.searchScope.value = "all";
    dom.typeFilter.value = "all";
    runtime.render();
  });
  dom.btnFetchMissingIcons.addEventListener("click", async () => {
    await actions.fetchIconsForAllMissing();
  });
  dom.langToggleBtn.addEventListener("click", () => {
    toggleLanguage(runtime);
  });
  dom.themeToggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    actions.applyTheme(current === "dark" ? "light" : "dark");
  });

  dom.fileHtml.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    actions.importHtmlText(await file.text());
    e.target.value = "";
  });

  dom.fileJson.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    actions.importJsonText(await file.text());
    e.target.value = "";
  });
  dom.btnFetchIcon.addEventListener("click", async () => {
    await actions.fetchIconForSelectedBookmark();
  });
  dom.btnPickIconFile.addEventListener("click", () => dom.fileIcon.click());
  dom.fileIcon.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    await actions.loadIconFileToEditor(file);
    actions.autosaveEditor();
    e.target.value = "";
  });
  dom.editIcon.addEventListener("input", () => {
    actions.updateIconPreview(dom.editIcon.value);
    actions.autosaveEditor();
  });
  [dom.editTitle, dom.editHref].forEach(input => {
    input.addEventListener("input", () => {
      actions.autosaveEditor();
    });
  });

  setupSplitter(dom.splitterLeft, "left");
  setupSplitter(dom.splitterRight, "right");

  actions.initTheme();
  initI18n(runtime);
  actions.setRoot(createFolder(t("defaults.rootTitle")));
}
