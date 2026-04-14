import { zh } from "./locales/zh.js";
import { en } from "./locales/en.js";

const STORAGE_KEY = "bookmark_editor_lang";
const SUPPORTED_LANGS = ["zh", "en"];
let currentLang = "zh";

const MESSAGES = { zh, en };

function escapeHtml(value){
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getNestedValue(obj, key){
  return String(key || "").split(".").reduce((acc, segment) => {
    if (!acc || typeof acc !== "object") return undefined;
    return acc[segment];
  }, obj);
}

function formatValue(value, vars={}){
  if (typeof value !== "string") return value;
  return value.replace(/\{(\w+)\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match;
  });
}

function normalizeLang(raw){
  const value = String(raw || "").toLowerCase();
  if (SUPPORTED_LANGS.includes(value)) return value;
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("en")) return "en";
  return "zh";
}

function updateLangAttr(){
  document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
}

function resolveInitialLang(){
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return normalizeLang(saved);
  const browser = typeof navigator !== "undefined" ? navigator.language : "zh";
  return normalizeLang(browser);
}

export function getCurrentLang(){
  return currentLang;
}

export function t(key, vars={}){
  const primary = getNestedValue(MESSAGES[currentLang], key);
  const fallback = getNestedValue(MESSAGES.zh, key);
  const value = primary ?? fallback ?? key;
  if (Array.isArray(value)) return value.map(item => formatValue(item, vars));
  return formatValue(value, vars);
}

function applyTextMappings(root=document){
  root.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = String(t(el.dataset.i18n));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.setAttribute("placeholder", String(t(el.dataset.i18nPlaceholder)));
  });
  root.querySelectorAll("[data-i18n-title]").forEach(el => {
    el.setAttribute("title", String(t(el.dataset.i18nTitle)));
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
    el.setAttribute("aria-label", String(t(el.dataset.i18nAriaLabel)));
  });
  root.querySelectorAll("[data-i18n-alt]").forEach(el => {
    el.setAttribute("alt", String(t(el.dataset.i18nAlt)));
  });
  root.querySelectorAll("[data-i18n-list]").forEach(el => {
    const lines = t(el.dataset.i18nList);
    const items = Array.isArray(lines) ? lines : [String(lines)];
    el.innerHTML = items.map(line => `<li>${escapeHtml(line)}</li>`).join("");
  });
}

function updateLangButton(runtime){
  if (!runtime?.dom?.langToggleBtn) return;
  const glyph = runtime.dom.langToggleBtn.querySelector(".lang-glyph");
  if (glyph) glyph.textContent = currentLang === "zh" ? "中文" : "EN";
}

export function applyI18n(runtime, lang){
  currentLang = normalizeLang(lang);
  localStorage.setItem(STORAGE_KEY, currentLang);
  updateLangAttr();
  applyTextMappings(document);
  updateLangButton(runtime);
  if (runtime?.render) runtime.render();
}

export function toggleLanguage(runtime){
  applyI18n(runtime, currentLang === "zh" ? "en" : "zh");
}

export function initI18n(runtime){
  currentLang = resolveInitialLang();
  updateLangAttr();
  applyTextMappings(document);
  updateLangButton(runtime);
}
