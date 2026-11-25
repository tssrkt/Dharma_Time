(() => {
  "use strict";

  const API_BASE = "https://dharma-time.enzonic.dev";
  const STORAGE_KEY = "dharma-time-settings-v1";
  const theme = (() => {
    try { return localStorage.getItem("dharma-time-theme-v1") === "dark" ? "dark" : "light"; }
    catch (_) { return "light"; }
  })();
  document.documentElement.dataset.theme = theme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === "dark" ? "#171c19" : "#f6f2e9";

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
  const seoTitle = locale === "en"
    ? "About Dharma Time — Calendar and Traditions"
    : "О проекте Dharma Time — описание календаря";
  const seoDescription = locale === "en"
    ? "Learn about Dharma Time, how dates from different spiritual traditions are presented, and the informational limits of the calendar."
    : "О проекте Dharma Time: назначение календаря, принципы представления дат разных духовных традиций и ограничения информационных материалов.";
  document.title = seoTitle;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = seoDescription;
  const setSeoMeta = (selector, value) => {
    const meta = document.querySelector(selector);
    if (meta) meta.setAttribute("content", value);
  };
  setSeoMeta('meta[property="og:title"]', seoTitle);
  setSeoMeta('meta[property="og:description"]', seoDescription);
  setSeoMeta('meta[name="twitter:title"]', seoTitle);
  setSeoMeta('meta[name="twitter:description"]', seoDescription);
  setSeoMeta('meta[property="og:locale"]', locale === "en" ? "en_US" : "ru_RU");
  const aboutTitle = document.querySelector("#about-title");
  if (aboutTitle) aboutTitle.textContent = locale === "en" ? "About" : "О проекте";
  document.querySelectorAll(".about-content").forEach(content => {
    content.hidden = content.dataset.locale !== locale;
  });

  const copyToast = document.querySelector("#copy-toast");
  let copyToastTimer;

  function positionCopyToast(clientX, clientY) {
    if (!copyToast || copyToast.hidden) return;
    const gap = 14;
    const edge = 8;
    const rect = copyToast.getBoundingClientRect();
    let left = clientX + gap;
    let top = clientY + gap;
    if (left + rect.width > window.innerWidth - edge) left = clientX - rect.width - gap;
    if (top + rect.height > window.innerHeight - edge) top = clientY - rect.height - gap;
    left = Math.max(edge, Math.min(left, window.innerWidth - rect.width - edge));
    top = Math.max(edge, Math.min(top, window.innerHeight - rect.height - edge));
    copyToast.style.left = left + "px";
    copyToast.style.top = top + "px";
  }

  document.addEventListener("pointermove", event => {
    if (!copyToast || copyToast.hidden) return;
    positionCopyToast(event.clientX, event.clientY);
  });

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch (_) { /* Try the compatibility fallback below. */ }
    }
    const temporaryInput = document.createElement("textarea");
    temporaryInput.value = value;
    temporaryInput.setAttribute("readonly", "");
    temporaryInput.style.position = "fixed";
    temporaryInput.style.opacity = "0";
    document.body.appendChild(temporaryInput);
    temporaryInput.select();
    const copied = document.execCommand("copy");
    temporaryInput.remove();
    if (!copied) throw new Error("Clipboard copy failed");
  }

  document.querySelectorAll(".copy-value").forEach(button => {
    button.addEventListener("click", async event => {
      try {
        await copyText(button.dataset.copyValue || button.textContent.trim());
        if (!copyToast) return;
        copyToast.textContent = locale === "en"
          ? (button.dataset.copyKind === "address" ? "Address copied." : "ЮMoney number copied.")
          : (button.dataset.copyKind === "address" ? "Адрес скопирован." : "Номер ЮMoney скопирован.");
      } catch (_) {
        if (!copyToast) return;
        copyToast.textContent = locale === "en"
          ? "Copy failed. Please copy the value manually."
          : "Не удалось скопировать. Скопируйте значение вручную.";
      }
      copyToast.hidden = false;
      positionCopyToast(event.clientX, event.clientY);
      clearTimeout(copyToastTimer);
      copyToastTimer = setTimeout(() => { copyToast.hidden = true; }, 2600);
    });
  });
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
  let pendingQuery = "";
  let sequence = 0;
  const resultsCache = new Map();
  async function runSearch(query) {
    if (query.length < 2 || input.value.trim() !== query) return;
    const requestLocale = settings.locale || "ru";
    const cacheKey = requestLocale + ":" + query;
    if (resultsCache.has(cacheKey)) { showResults(resultsCache.get(cacheKey)); return; }
    if (pendingQuery === query && controller) return;
    if (controller) controller.abort();
    const requestController = new AbortController();
    controller = requestController;
    pendingQuery = query;
    const current = ++sequence;
    try {
      const params = new URLSearchParams({ q: query, locale: requestLocale });
      const response = await fetch(API_BASE + "/api/cities/search?" + params, { signal: requestController.signal });
      if (!response.ok) throw new Error("City search failed");
      const payload = await response.json();
      const results = payload.results || [];
      if (current === sequence && input.value.trim() === query && (settings.locale || "ru") === requestLocale) {
        resultsCache.set(cacheKey, results);
        if (resultsCache.size > 30) resultsCache.delete(resultsCache.keys().next().value);
        showResults(results);
      }
    } catch (error) {
      if (error.name !== "AbortError" && current === sequence) closeResults();
    } finally {
      if (controller === requestController) {
        controller = null;
        pendingQuery = "";
      }
    }
  }
  input.addEventListener("input", () => {
    resizeInput();
    if (timer) clearTimeout(timer);
    if (controller) controller.abort();
    controller = null;
    pendingQuery = "";
    sequence += 1;
    closeResults();
    const query = input.value.trim();
    if (query.length < 2) return;
    timer = setTimeout(() => {
      timer = null;
      runSearch(query);
    }, 120);
  });
  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 2 && input.value !== (settings.cityDisplayName || displayName)) {
      input.dispatchEvent(new Event("input"));
    }
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") { closeResults(); return; }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!list.hidden) {
      const firstResult = list.querySelector("button.city-result");
      if (firstResult) { firstResult.click(); return; }
    }
    const query = input.value.trim();
    if (timer) {
      clearTimeout(timer);
      timer = null;
      runSearch(query);
    } else if (pendingQuery !== query) {
      runSearch(query);
    }
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".city-picker")) closeResults();
  });
  resizeInput();
})();
