import { t } from "../i18n/index.js";

export const state = {
  root: null,
  originalRoot: null,
  selectedFolderId: null,
  selectedItemId: null,
  search: "",
  searchScope: "all",
  typeFilter: "all",
  nextId: 1,
  expanded: new Set(),
  moveTargetFolderId: null,
  draggingId: null,
};

export function uid(){ return "n" + (state.nextId++); }

export function cloneDeep(obj){ return JSON.parse(JSON.stringify(obj)); }

export function reseedIds(root){
  state.nextId = 1;
  function renew(node){
    node.id = uid();
    if (node.type === "folder"){
      node.children = node.children || [];
      node.children.forEach(renew);
    }
  }
  renew(root);
  return root;
}

export function createFolder(title=t("defaults.newFolder")){
  const now = String(Math.floor(Date.now()/1000));
  return {id:uid(), type:"folder", title, addDate:now, lastModified:now, children:[]};
}

export function createBookmark(title=t("defaults.newBookmark"), href="https://"){
  return {id:uid(), type:"bookmark", title, href, addDate:String(Math.floor(Date.now()/1000)), lastModified:""};
}
