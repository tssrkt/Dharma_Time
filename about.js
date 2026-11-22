(() => {
  "use strict";

  const API_BASE = "https://dharma-time.enzonic.dev";
  const STORAGE_KEY = "dharma-time-settings-v1";
  const input = document.querySelector("#city-search");
  const list = document.querySelector("#city-results");
  const wrap = input && input.closest(".city-search-wrap");
  if (!input || !list || !wrap) return;

  let settings = {};
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") settings = saved;
  } catch (_) { /* Use the default city when storage is unavailable. */ }

  const locale = settings.locale === "en" ? "en" : "ru";
  document.documentElement.lang = locale;
  document.title = locale === "en" ? "About · Dharma Time" : "О проекте · Dharma Time";
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = locale === "en" ? "About Dharma Time" : "О календаре Dharma Time";
  const aboutTitle = document.querySelector("#about-title");
  if (aboutTitle) aboutTitle.textContent = locale === "en" ? "About" : "О проекте";
  const placeholder = document.querySelector(".about-placeholder");
  if (placeholder) placeholder.textContent = locale === "en"
    ? "This page is under development. Text and links will be added later."
    : "Страница в разработке. Текст и ссылки будут добавлены позже.";
  const cityLabel = document.querySelector(".city-picker label");
  if (cityLabel) cityLabel.textContent = locale === "en" ? "Your city:" : "Ваш город:";
  const brand = document.querySelector(".brand");
  if (brand) brand.setAttribute("aria-label", locale === "en" ? "Dharma Time — home" : "Dharma Time — на главную");
  const defaultCity = "Москва";
  const displayName = settings.cityDisplayName ||
    ((settings.cityName || defaultCity) === defaultCity ? "Москва (Россия)" : settings.cityName);
  input.value = (settings.cityName || defaultCity) === defaultCity
    ? (locale === "en" ? "Moscow (Russia)" : "Москва (Россия)")
    : (settings.cityDisplayName || settings.cityName);
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");

  function resizeInput() {
    if (measureContext) measureContext.font = getComputedStyle(input).font;
    const width = measureContext ? measureContext.measureText(input.value).width : input.value.length * 9;
    input.style.width = Math.max(20, Math.ceil(width + 2)) + "px";
    wrap.style.width = input.style.width;
  }
  function closeResults() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    list.replaceChildren();
  }
  function showResults(results) {
    list.replaceChildren();
    results.forEach((city, index) => {
      const item = document.createElement("li");
      item.setAttribute("role", "option");
      item.id = "city-result-" + index;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "city-result";
      button.textContent = city.name;
      button.addEventListener("click", () => {
        const parts = String(city.name || "").split(",").map(part => part.trim()).filter(Boolean);
        const name = parts[0] || String(city.name || "").trim();
        const country = parts.length > 1 ? parts[parts.length - 1] : "";
        settings = {
          ...settings,
          cityName: name,
          cityDisplayName: country ? name + " (" + country + ")" : name,
          latitude: String(city.latitude),
          longitude: String(city.longitude),
          timezone: city.timezone
        };
        input.value = settings.cityDisplayName;
        resizeInput();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (_) { /* Selection remains visible for this visit. */ }
        closeResults();
      });
      item.append(button);
      list.append(item);
    });
    list.hidden = results.length === 0;
    input.setAttribute("aria-expanded", String(results.length > 0));
  }

  let timer = null;
  let controller = null;
  let sequence = 0;
  input.addEventListener("input", () => {
    resizeInput();
    if (timer) clearTimeout(timer);
    if (controller) controller.abort();
    const query = input.value.trim();
    if (query.length < 2) { closeResults(); return; }
    timer = setTimeout(async () => {
      controller = new AbortController();
      const current = ++sequence;
      try {
        const params = new URLSearchParams({ q: query, locale: settings.locale || "ru" });
        const response = await fetch(API_BASE + "/api/cities/search?" + params, { signal: controller.signal });
        if (!response.ok) throw new Error("City search failed");
        const payload = await response.json();
        if (current === sequence && input.value.trim() === query) showResults(payload.results || []);
      } catch (error) {
        if (error.name !== "AbortError") closeResults();
      }
    }, 250);
  });
  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 2 && input.value !== (settings.cityDisplayName || displayName)) {
      input.dispatchEvent(new Event("input"));
    }
  });
  input.addEventListener("keydown", event => { if (event.key === "Escape") closeResults(); });
  document.addEventListener("click", event => {
    if (!event.target.closest(".city-picker")) closeResults();
  });
  resizeInput();
})();
