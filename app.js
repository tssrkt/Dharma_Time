(() => {
  "use strict";

  const API_BASE = "https://dharma-time.enzonic.dev";
  const STORAGE_KEY = "dharma-time-settings-v1";
  const RETRY_LIMIT = 1;
  const RETRY_DELAY_CAP_MS = 8000;
  const CATEGORIES = {
    astronomy: { label: "Астрономия", modules: [
      ["moon", "Луна"], ["sun", "Солнце"], ["eclipses", "Затмения"], ["meteors", "Метеоры"],
      ["comets", "Кометы"], ["planets", "Планеты"], ["earth", "Земля"]
    ]},
    theravada: { label: "Тхеравада", modules: [
      ["sri_lanka", "Шри-Ланка"], ["thai", "Таиланд"], ["myanmar", "Мьянма"]
    ]},
    mahayana: { label: "Махаяна", modules: [
      ["tibet", "Тибет"], ["china", "Китай"], ["nepal", "Непал"], ["japan", "Япония"], ["vietnam", "Вьетнам"]
    ]},
    hindu: { label: "Индуизм", modules: [
      ["north_india", "Северная Индия"], ["south_india", "Южная Индия"], ["indonesia", "Индонезия и Бали"]
    ]},
    misc: { label: "Другое", modules: [
      ["christian_orthodox_old", "Православный календарь (старый стиль)"],
      ["christian_orthodox_new", "Православный календарь (новый стиль)"],
      ["christian_catholic", "Католический календарь"],
      ["name_days_orthodox_old", "Именины (православные, старый стиль)"],
      ["name_days_orthodox_new", "Именины (православные, новый стиль)"],
      ["name_days_catholic", "Именины (католические)"],
      ["government_russia", "Государственные праздники России"],
      ["government_ukraine", "Государственные праздники Украины"],
      ["international", "Международные даты"],
      ["professional", "Профессиональные праздники"],
      ["fun_dates", "Забавные даты"]
    ]}
  };
  const CATEGORY_ORDER = ["astronomy", "buddhism", "hindu", "misc"];
  const MODULE_CATEGORY = {};
  Object.entries(CATEGORIES).forEach(([key, group]) => group.modules.forEach(([id]) => MODULE_CATEGORY[id] = key));
  MODULE_CATEGORY.sri_lanka = "buddhism";
  MODULE_CATEGORY.thai = "buddhism";
  MODULE_CATEGORY.myanmar = "buddhism";
  MODULE_CATEGORY.tibet = "buddhism";
  MODULE_CATEGORY.china = "buddhism";
  MODULE_CATEGORY.nepal = "buddhism";
  MODULE_CATEGORY.japan = "buddhism";
  MODULE_CATEGORY.vietnam = "buddhism";

  const DEFAULTS = {
    activeSettingsCategory: "astronomy",
    selectedModules: ["moon", "sun"],
    locale: "ru",
    cityName: "",
    latitude: "",
    longitude: ""
  };
  const state = {
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    selectedDate: new Date(),
    activeSettingsCategory: DEFAULTS.activeSettingsCategory,
    activeEventCategory: "astronomy",
    selectedModules: new Set(DEFAULTS.selectedModules),
    monthEvents: [],
    dayEvents: [],
    moonInfo: null,
    phugpaInfo: null,
    phugpaDaily: false,
    socVong: false,
    monthRequestId: 0,
    dayRequestId: 0,
    monthController: null,
    dayController: null,
    expandedEvents: new Set(),
    nameDaysOpen: false,
    chaturthiOpen: false,
    amavasyaOpen: false,
    hinduOptions: {
      panchanga: false, vaishnava: false, vaishnavaTradition: "gaudiya",
      ekadashi: false, ekadashiMode: "gaudiya", sankashtiChaturthi: false,
      vinayakaChaturthi: false, pradosh: false, purnima: false,
      shivaratri: false, dashavatara: false, sankranti: false, indiaLunarMonthMode: "purnimanta"
    },
    panchangaInfo: null,
    settings: { ...DEFAULTS }
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const monthTitle = $("#month-title");
  const calendarGrid = $("#calendar-grid");
  const calendarStatus = $("#calendar-status");
  const dayTitle = $("#day-title");
  const dayWeekday = $("#day-weekday");
  const dayEvents = $("#day-events");
  const dayEmpty = $("#day-empty");
  const dayStatus = $("#day-status");
  const moduleList = $("#module-list");
  const today = new Date();
  const locale = "ru";
  state.settings.locale = locale;
  let selectedDayKey = dateKey(state.selectedDate);

  function dateKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }
  function parseDate(value) {
    const parts = String(value || "").slice(0, 10).split("-").map(Number);
    if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
    const result = new Date(parts[0], parts[1] - 1, parts[2]);
    return result.getFullYear() === parts[0] && result.getMonth() === parts[1] - 1 && result.getDate() === parts[2] ? result : null;
  }
  function sameDay(a, b) { return dateKey(a) === dateKey(b); }
  function monthName(date) { return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date); }
  function longDate(date) { return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date); }
  function titleCase(value) { return value ? value.charAt(0).toLocaleUpperCase(locale) + value.slice(1) : ""; }
  function escapeText(value) { return String(value == null ? "" : value); }

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!stored || typeof stored !== "object") return;
      state.activeSettingsCategory = CATEGORY_ORDER.includes(stored.activeSettingsCategory) ? stored.activeSettingsCategory : DEFAULTS.activeSettingsCategory;
      const validIds = new Set(Object.values(CATEGORIES).flatMap(group => group.modules.map(([id]) => id)));
      const selected = Array.isArray(stored.selectedModules) ? stored.selectedModules.filter(id => validIds.has(id)) : DEFAULTS.selectedModules;
      state.selectedModules = new Set(selected);
      state.phugpaDaily = Boolean(stored.phugpaDaily) && state.selectedModules.has("tibet");
      state.socVong = Boolean(stored.socVong) && state.selectedModules.has("vietnam");
      const savedHindu = stored.hinduOptions && typeof stored.hinduOptions === "object" ? stored.hinduOptions : {};
      state.hinduOptions = {
        panchanga: Boolean(savedHindu.panchanga),
        vaishnava: Boolean(savedHindu.vaishnava),
        vaishnavaTradition: ["gaudiya", "sri", "madhva"].includes(savedHindu.vaishnavaTradition) ? savedHindu.vaishnavaTradition : "gaudiya",
        ekadashi: Boolean(savedHindu.ekadashi),
        ekadashiMode: ["gaudiya", "smarta"].includes(savedHindu.ekadashiMode) ? savedHindu.ekadashiMode : "gaudiya",
        sankashtiChaturthi: Boolean(savedHindu.sankashtiChaturthi),
        vinayakaChaturthi: Boolean(savedHindu.vinayakaChaturthi),
        pradosh: Boolean(savedHindu.pradosh), purnima: Boolean(savedHindu.purnima),
        shivaratri: Boolean(savedHindu.shivaratri), dashavatara: Boolean(savedHindu.dashavatara),
        sankranti: Boolean(savedHindu.sankranti),
        indiaLunarMonthMode: ["purnimanta", "amanta"].includes(savedHindu.indiaLunarMonthMode) ? savedHindu.indiaLunarMonthMode : "purnimanta"
      };
      if (!state.selectedModules.has("north_india") && !state.selectedModules.has("south_india")) resetHinduOptions();
      normalizeExclusiveModuleGroups();
      state.settings = { ...DEFAULTS, ...stored, locale };
      state.settings.selectedModules = Array.from(state.selectedModules);
    } catch (_) {
      state.settings = { ...DEFAULTS };
      state.selectedModules = new Set(DEFAULTS.selectedModules);
    }
  }
  function saveSettings() {
    state.settings.activeSettingsCategory = state.activeSettingsCategory;
    state.settings.selectedModules = Array.from(state.selectedModules);
    state.settings.phugpaDaily = state.phugpaDaily && state.selectedModules.has("tibet");
    state.settings.socVong = state.socVong && state.selectedModules.has("vietnam");
    state.settings.hinduOptions = { ...state.hinduOptions };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); } catch (_) { /* Storage can be unavailable in private browsing. */ }
  }
  function getSelectedModules() { return Array.from(state.selectedModules).sort(); }
  function currentTimezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (_) { return "UTC"; }
  }
  function requestParams(date) {
    const params = new URLSearchParams();
    const modules = getSelectedModules();
    if (!modules.length) return null;
    params.set("modules", modules.join(","));
    params.set("locale", state.settings.locale || locale);
    params.set("user_timezone", currentTimezone());
    if (state.selectedModules.has("tibet") && state.phugpaDaily) params.set("phugpa_daily", "true");
    if (state.selectedModules.has("vietnam") && state.socVong) params.set("soc_vong", "true");
    if (state.selectedModules.has("north_india") || state.selectedModules.has("south_india")) {
      const h = state.hinduOptions;
      if (date && h.panchanga) params.set("panchanga", "true");
      if (h.vaishnava) params.set("vaishnava", "true");
      if (h.ekadashi) params.set("ekadashi", "true");
      if (h.sankashtiChaturthi) params.set("sankashti_chaturthi", "true");
      if (h.vinayakaChaturthi) params.set("vinayaka_chaturthi", "true");
      if (h.pradosh) params.set("pradosh", "true");
      if (h.purnima) params.set("purnima", "true");
      if (h.shivaratri) params.set("shivaratri", "true");
      if (h.dashavatara) params.set("dashavatara", "true");
      if (h.sankranti) params.set("sankranti", "true");
      params.set("vaishnava_tradition", h.vaishnavaTradition);
      params.set("ekadashi_mode", h.ekadashiMode);
      params.set("india_lunar_month_mode", h.indiaLunarMonthMode);
    }
    if (state.settings.cityName && state.settings.latitude !== "" && state.settings.longitude !== "") {
      const lat = Number(state.settings.latitude), lon = Number(state.settings.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        params.set("city_name", state.settings.cityName.trim());
        params.set("latitude", String(lat));
        params.set("longitude", String(lon));
      }
    }
    // Each government calendar is selected explicitly by its module ID.
    // A global countries filter would incorrectly hide unrelated events.
    if (date) params.set("date", dateKey(date));
    return params;
  }
  function retryDelay(response, attempt) {
    const value = response && response.headers ? response.headers.get("Retry-After") : null;
    if (value) {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) return Math.min(RETRY_DELAY_CAP_MS, Math.max(0, seconds * 1000));
      const target = Date.parse(value);
      if (Number.isFinite(target)) return Math.min(RETRY_DELAY_CAP_MS, Math.max(0, target - Date.now()));
    }
    return Math.min(RETRY_DELAY_CAP_MS, 600 * (attempt + 1));
  }
  function wait(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
      const timer = setTimeout(resolve, ms);
      if (signal) signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    });
  }
  async function fetchJson(url, signal) {
    for (let attempt = 0; ; attempt++) {
      let response;
      try { response = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal, cache: "no-store" }); }
      catch (error) { throw error; }
      if (response.ok) return response.json();
      if ((response.status === 429 || response.status === 503) && attempt < RETRY_LIMIT) {
        await wait(retryDelay(response, attempt), signal);
        continue;
      }
      const error = new Error(response.status === 429 ? "rate_limit" : response.status === 503 ? "temporarily_unavailable" : "request_failed");
      error.status = response.status;
      throw error;
    }
  }
  function safeErrorMessage(error) {
    if (error && error.name === "AbortError") return "";
    if (error && error.status === 429) return "Сервис временно ограничил частоту запросов. Попробуйте немного позже.";
    return "Не удалось загрузить календарь. Проверьте подключение и попробуйте позже.";
  }
  function normalizeEvents(payload) {
    if (Array.isArray(payload)) return payload;
    return payload && Array.isArray(payload.events) ? payload.events : [];
  }
  function eventDate(event) {
    return parseDate(event.start_date || event.start || event.display_dates && event.display_dates[0]);
  }
  function eventsForMonth(events, month) {
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    return events.filter(event => {
      if (Array.isArray(event.display_dates) && event.display_dates.some(value => {
        const date = parseDate(value);
        return date && date >= monthStart && date <= monthEnd;
      })) return true;
      const start = parseDate(event.start_date || event.start);
      const end = parseDate(event.end_date || event.end) || start;
      return Boolean(start && end && start <= monthEnd && end >= monthStart);
    });
  }
  function eventOccursOn(event, date) {
    const key = dateKey(date);
    if (Array.isArray(event.display_dates) && event.display_dates.some(item => String(item).slice(0, 10) === key)) return true;
    const start = parseDate(event.start_date || event.start);
    const end = parseDate(event.end_date || event.end) || start;
    return Boolean(start && end && start <= date && end >= date);
  }
  function categoryForEvent(event) {
    const module = String(event.module || "");
    if (MODULE_CATEGORY[module]) return MODULE_CATEGORY[module];
    const tradition = String(event.tradition || "").toLowerCase();
    if (["theravada", "mahayana"].includes(tradition)) return "buddhism";
    if (tradition.includes("hindu")) return "hindu";
    if (["astronomy", "astronomical"].includes(tradition)) return "astronomy";
    return "misc";
  }
  function eventDescription(event) {
    const supplied = String(event.description || event.short_description || "").trim();
    if (supplied) return supplied;

    const extra = event.extra && typeof event.extra === "object" ? event.extra : {};
    const module = String(event.module || "");
    const phaseAliases = {
      phase_new_moon: "new_moon",
      phase_first_quarter: "first_quarter",
      phase_full_moon: "full_moon",
      phase_last_quarter: "last_quarter"
    };
    const kind = String(extra.kind || phaseAliases[extra.phase_key] || "");
    if (module === "moon") {
      const phaseDescriptions = {
        new_moon: "Новолуние: освещённая сторона Луны обращена от Земли, поэтому Луна обычно почти не видна на ночном небе.",
        first_quarter: "Первая четверть: Луна растёт, и с Земли видна примерно половина её освещённого диска.",
        full_moon: "Полнолуние: видимый с Земли диск Луны освещён почти полностью.",
        last_quarter: "Последняя четверть: Луна убывает, и с Земли видна примерно половина её освещённого диска."
      };
      if (phaseDescriptions[kind]) return phaseDescriptions[kind];
    }
    if (module === "sun" && kind === "solar_sign_ingress") {
      return "Дата перехода Солнца в следующий знак тропического зодиака по выбранному календарю.";
    }
    if (module.startsWith("name_days_") && Array.isArray(extra.names) && extra.names.length) {
      return "Именины по выбранному календарю. Имена: " + extra.names.join(", ") + ".";
    }

    return "";
  }
  function formatDescription(value, module) {
    const text = String(value || "").replace(/\r\n?/g, "\n").trim();
    if (!text) return text;
    if (module === "tibet") {
      return text.replace(/[\t ]*\n+[\t ]*(?=Празднуется)/giu, " ");
    }
    if (/\n/.test(text) || text.length < 220) return text;

    const sentences = text.split(/(?<=[.!?]) +/u);
    if (sentences.length < 4) return text;
    const paragraphs = [];
    for (let i = 0; i < sentences.length; i += 2) {
      paragraphs.push(sentences.slice(i, i + 2).join(" "));
    }
    return paragraphs.join("\n\n");
  }
  function iconForCategory(category) { return ({ astronomy: "☾", buddhism: "☸", hindu: "ॐ", misc: "✿" })[category] || "✿"; }
  function renderCalendar() {
    monthTitle.textContent = titleCase(monthName(state.month));
    calendarGrid.replaceChildren();
    const year = state.month.getFullYear(), month = state.month.getMonth();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const previousDays = new Date(year, month, 0).getDate();
    const cells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const monthEventKeys = new Set();
    const moonPhasesByDate = new Map();
    const moonPhaseDefinitions = [
      { tag: "full_moon", emoji: "🌕", label: "Полнолуние" },
      { tag: "last_quarter", emoji: "🌗", label: "Последняя четверть" },
      { tag: "new_moon", emoji: "🌑", label: "Новолуние" },
      { tag: "first_quarter", emoji: "🌓", label: "Первая четверть" }
    ];
    state.monthEvents.forEach(event => {
      const tags = Array.isArray(event.tags) ? event.tags : [];
      const phase = moonPhaseDefinitions.find(item => tags.includes("astronomy." + item.tag) || tags.includes(item.tag) || String(event.id || "").includes(item.tag));
      if (phase && event.module === "moon") {
        const phaseDates = Array.isArray(event.display_dates) && event.display_dates.length ? event.display_dates : [event.start_date || event.start];
        phaseDates.forEach(value => {
          const date = parseDate(value);
          if (date && date.getFullYear() === year && date.getMonth() === month) moonPhasesByDate.set(dateKey(date), phase);
        });
      }
      if (Array.isArray(event.display_dates)) event.display_dates.forEach(value => {
        const date = parseDate(value);
        if (date && date.getFullYear() === year && date.getMonth() === month) monthEventKeys.add(dateKey(date));
      });
      const start = parseDate(event.start_date || event.start);
      const end = parseDate(event.end_date || event.end) || start;
      if (!start || !end) return;
      for (let d = new Date(Math.max(start.getTime(), new Date(year, month, 1).getTime())); d <= end && d.getMonth() === month; d.setDate(d.getDate() + 1)) monthEventKeys.add(dateKey(d));
    });
    for (let i = 0; i < cells; i++) {
      let date, outside = false;
      if (i < firstWeekday) { date = new Date(year, month - 1, previousDays - firstWeekday + i + 1); outside = true; }
      else if (i >= firstWeekday + daysInMonth) { date = new Date(year, month + 1, i - firstWeekday - daysInMonth + 1); outside = true; }
      else date = new Date(year, month, i - firstWeekday + 1);
      const key = dateKey(date);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-day";
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-pressed", String(sameDay(date, state.selectedDate)));
      const moonPhase = moonPhasesByDate.get(key);
      const dayNumber = document.createElement("span");
      dayNumber.className = "day-number";
      dayNumber.textContent = String(date.getDate());
      button.append(dayNumber);
      if (moonPhase) {
        button.classList.add("is-moon-phase");
        button.dataset.moonPhaseEmoji = moonPhase.emoji;
      }
      if (outside) button.classList.add("is-outside");
      if (sameDay(date, today)) button.classList.add("is-today");
      if (sameDay(date, state.selectedDate)) button.classList.add("is-selected");
      if (monthEventKeys.has(key)) {
        const dayEvents = state.monthEvents.filter(event => eventOccursOn(event, date));
        button.classList.add("has-events");
        const phaseLabel = moonPhase ? " Фаза Луны: " + moonPhase.label + "." : "";
        button.setAttribute("aria-label", longDate(date) + "." + phaseLabel + " События: " + dayEvents.map(event => String(event.title || "Событие")).join("; "));
        const tooltip = document.createElement("span");
        tooltip.className = "event-tooltip";
        tooltip.setAttribute("aria-hidden", "true");
        const list = document.createElement("ul");
        list.className = "event-tooltip-list";
        dayEvents.forEach(event => {
          const item = document.createElement("li");
          item.textContent = String(event.title || "Событие");
          list.append(item);
        });
        tooltip.append(list);
        button.append(tooltip);
      } else {
        button.setAttribute("aria-label", longDate(date));
      }
      button.addEventListener("click", () => {
        state.selectedDate = date;
        selectedDayKey = dateKey(date);
        state.expandedEvents.clear();
        renderCalendar();
        renderDayHeading();
        loadDayEvents();
      });
      calendarGrid.append(button);
    }
  }
  function renderModuleList() {
    moduleList.replaceChildren();
    const active = state.activeSettingsCategory;
    moduleList.classList.toggle("is-buddhism", active === "buddhism");
    moduleList.classList.toggle("is-astronomy", active === "astronomy");
    moduleList.classList.toggle("is-misc", active === "misc");
    moduleList.classList.toggle("is-hindu", active === "hindu");
    const groupKeys = active === "buddhism" ? ["mahayana", "theravada"] : [active];
    groupKeys.forEach(key => {
      const group = CATEGORIES[key];
      if (!group) return;
      const container = document.createElement("div");
      container.className = "module-group";
      if (active === "buddhism") {
        const details = document.createElement("details");
        details.open = true;
        const summary = document.createElement("summary");
        summary.textContent = group.label;
        details.append(summary);
        group.modules.forEach(([id, label]) => {
          const parentOption = makeModuleOption(id, label);
          if (id !== "tibet" && id !== "vietnam") {
            details.append(parentOption);
            return;
          }
          details.append(parentOption);
          if (state.selectedModules.has(id)) {
            const child = makeCheckboxControl(id === "tibet" ? "\u041f\u0443\u0433\u043f\u0430" : "\u0421\u043e\u043a-\u0412\u043e\u043d\u0433", id === "tibet" ? state.phugpaDaily : state.socVong, checked => {
              if (id === "tibet") state.phugpaDaily = checked;
              else state.socVong = checked;
              moduleSelectionChanged();
            });
            child.classList.add("module-option-child");
            const childRow = document.createElement("div");
            childRow.className = "module-children module-option-child-row";
            childRow.append(child);
            details.append(childRow);
          }
        });
        container.append(details);
      } else if (active === "astronomy") {
        const columns = document.createElement("div");
        columns.className = "astronomy-module-columns";
        const left = document.createElement("div");
        const right = document.createElement("div");
        left.className = right.className = "astronomy-module-column";
        group.modules.forEach(([id, label], index) => (index < 3 ? left : right).append(makeModuleOption(id, label)));
        columns.append(left, right);
        container.append(columns);
      } else if (active === "misc") {
        renderMiscModuleOptions(container);
      } else if (active === "hindu") {
        renderHinduModuleOptions(container);
      } else {
        group.modules.forEach(([id, label]) => container.append(makeModuleOption(id, label)));
      }
      moduleList.append(container);
    });
    $$("#settings-categories .image-tab").forEach(button => {
      const isActive = button.dataset.category === active;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }
  function resetHinduOptions() {
    state.hinduOptions = {
      panchanga: false, vaishnava: false, vaishnavaTradition: "gaudiya",
      ekadashi: false, ekadashiMode: "gaudiya", sankashtiChaturthi: false,
      vinayakaChaturthi: false, pradosh: false, purnima: false,
      shivaratri: false, dashavatara: false, sankranti: false, indiaLunarMonthMode: "purnimanta"
    };
    state.panchangaInfo = null;
  }
  function renderHinduModuleOptions(container) {
    const columns = document.createElement("div");
    columns.className = "hindu-module-columns";
    const left = document.createElement("div");
    left.className = "hindu-module-column";
    const right = document.createElement("div");
    right.className = "hindu-module-column hindu-dependent-options";
    columns.append(left, right);
    container.append(columns);
    left.append(makeModuleOption("north_india", "\u0421\u0435\u0432\u0435\u0440\u043d\u0430\u044f \u0418\u043d\u0434\u0438\u044f"));
    left.append(makeModuleOption("south_india", "\u042e\u0436\u043d\u0430\u044f \u0418\u043d\u0434\u0438\u044f"));
    left.append(makeModuleOption("indonesia", "\u0418\u043d\u0434\u043e\u043d\u0435\u0437\u0438\u044f \u0438 \u0411\u0430\u043b\u0438"));
    if (!state.selectedModules.has("north_india") && !state.selectedModules.has("south_india")) {
      columns.classList.add("hindu-no-dependent");
      right.hidden = true;
      return;
    }

    const h = state.hinduOptions;
    if (state.selectedModules.has("north_india") && state.selectedModules.has("south_india")) {
      const lunarMode = document.createElement("div");
      lunarMode.className = "module-children hindu-lunar-month-mode";
      [["purnimanta", "\u041f\u0443\u0440\u043d\u0438\u043c\u0430\u043d\u0442\u0430"], ["amanta", "\u0410\u043c\u0430\u043d\u0442\u0430"]].forEach(([value, label]) => {
        lunarMode.append(makeRadioControl(label, "hindu-lunar-month-mode", h.indiaLunarMonthMode === value, () => {
          h.indiaLunarMonthMode = value;
          moduleSelectionChanged();
        }));
      });
      right.append(lunarMode);
    }
    const addToggle = (label, key) => right.append(makeCheckboxControl(label, h[key], checked => {
      h[key] = checked;
      state.panchangaInfo = null;
      moduleSelectionChanged();
    }));
    addToggle("\u041f\u0430\u043d\u0447\u0430\u043d\u0433\u0430", "panchanga");

    addToggle("\u0412\u0430\u0439\u0448\u043d\u0430\u0432\u0430", "vaishnava");
    if (h.vaishnava) {
      const children = document.createElement("div"); children.className = "module-children";
      [["gaudiya", "\u0413\u0430\u0443\u0434\u0438\u044f"], ["sri", "\u0428\u0440\u0438"], ["madhva", "\u041c\u0430\u0434\u0445\u0432\u0430"]].forEach(([value, label]) => children.append(makeRadioControl(label, "hindu-vaishnava-tradition", h.vaishnavaTradition === value, () => {
        h.vaishnavaTradition = value; moduleSelectionChanged();
      })));
      right.append(children);
    }

    addToggle("\u042d\u043a\u0430\u0434\u0430\u0448\u0438", "ekadashi");
    if (h.ekadashi) {
      const children = document.createElement("div"); children.className = "module-children";
      [["gaudiya", "\u0413\u0430\u0443\u0434\u0438\u044f"], ["smarta", "\u0421\u043c\u0430\u0440\u0442\u0430"]].forEach(([value, label]) => children.append(makeRadioControl(label, "hindu-ekadashi-mode", h.ekadashiMode === value, () => {
        h.ekadashiMode = value; moduleSelectionChanged();
      })));
      right.append(children);
    }

    const folder = (label, open, onToggle, children) => {
      const details = document.createElement("details"); details.className = "module-folder"; details.open = open;
      details.addEventListener("toggle", () => onToggle(details.open));
      const summary = document.createElement("summary"); summary.textContent = label; details.append(summary);
      const childBox = document.createElement("div"); childBox.className = "module-children";
      children.forEach(([childLabel, key]) => childBox.append(makeCheckboxControl(childLabel, h[key], checked => {
        h[key] = checked; moduleSelectionChanged();
      })));
      details.append(childBox); right.append(details);
    };
    folder("\u0427\u0430\u0442\u0443\u0440\u0442\u0445\u0438", state.chaturthiOpen, value => { state.chaturthiOpen = value; }, [["\u0421\u0430\u043d\u043a\u0430\u0448\u0442\u0438", "sankashtiChaturthi"], ["\u0412\u0438\u043d\u0430\u044f\u043a\u0430", "vinayakaChaturthi"]]);
    folder("\u0410\u043c\u0430\u0432\u0430\u0441\u044c\u044f", state.amavasyaOpen, value => { state.amavasyaOpen = value; }, [["\u041f\u0440\u0430\u0434\u043e\u0448", "pradosh"], ["\u041f\u0443\u0440\u043d\u0438\u043c\u0430", "purnima"], ["\u0428\u0438\u0432\u0430\u0440\u0430\u0442\u0440\u0438", "shivaratri"], ["\u0414\u0430\u0448\u0430\u0432\u0430\u0442\u0430\u0440\u0430", "dashavatara"]]);
    addToggle("\u0421\u0430\u043d\u043a\u0440\u0430\u043d\u0442\u0438", "sankranti");
  }

  const CHRISTIAN_MODULES = ["christian_orthodox_old", "christian_orthodox_new", "christian_catholic"];
  const ORTHODOX_NAME_DAY_MODULES = ["name_days_orthodox_old", "name_days_orthodox_new"];
  const GOVERNMENT_MODULES = ["government_russia", "government_ukraine"];

  function replaceModuleSelection(group, selectedId) {
    group.forEach(id => state.selectedModules.delete(id));
    if (selectedId) state.selectedModules.add(selectedId);
  }
  function normalizeExclusiveModuleGroups() {
    [CHRISTIAN_MODULES, ORTHODOX_NAME_DAY_MODULES, GOVERNMENT_MODULES].forEach(group => {
      const selected = Array.from(state.selectedModules).filter(id => group.includes(id));
      if (selected.length > 1) replaceModuleSelection(group, selected[selected.length - 1]);
    });
  }
  function anyModuleSelected(ids) {
    return ids.some(id => state.selectedModules.has(id));
  }
  function renderMiscModuleOptions(container) {
    const columns = document.createElement("div");
    columns.className = "misc-module-columns";
    const leftColumn = document.createElement("div");
    leftColumn.className = "misc-module-column misc-module-column-left";
    const rightColumn = document.createElement("div");
    rightColumn.className = "misc-module-column misc-module-column-right";
    columns.append(leftColumn, rightColumn);
    container.append(columns);

    const christianSelected = anyModuleSelected(CHRISTIAN_MODULES);
    rightColumn.append(makeCheckboxControl("Христианство", christianSelected, checked => {
      if (checked) {
        if (!anyModuleSelected(CHRISTIAN_MODULES)) state.selectedModules.add("christian_orthodox_new");
      } else {
        replaceModuleSelection(CHRISTIAN_MODULES, null);
      }
      moduleSelectionChanged();
    }));
    if (christianSelected) {
      const children = document.createElement("div");
      children.className = "module-children";
      const orthodoxSelected = anyModuleSelected(["christian_orthodox_old", "christian_orthodox_new"]);
      children.append(makeRadioControl("Православие", "christian-tradition", orthodoxSelected, () => {
        const oldStyle = state.selectedModules.has("christian_orthodox_old");
        replaceModuleSelection(CHRISTIAN_MODULES, oldStyle ? "christian_orthodox_old" : "christian_orthodox_new");
        moduleSelectionChanged();
      }));
      if (orthodoxSelected) {
        const styles = document.createElement("div");
        styles.className = "module-children module-subchildren";
        styles.append(makeRadioControl("Старое", "christian-style", state.selectedModules.has("christian_orthodox_old"), () => {
          replaceModuleSelection(CHRISTIAN_MODULES, "christian_orthodox_old");
          moduleSelectionChanged();
        }));
        styles.append(makeRadioControl("Новое", "christian-style", state.selectedModules.has("christian_orthodox_new"), () => {
          replaceModuleSelection(CHRISTIAN_MODULES, "christian_orthodox_new");
          moduleSelectionChanged();
        }));
        children.append(styles);
      }
      children.append(makeRadioControl("Католицизм", "christian-tradition", state.selectedModules.has("christian_catholic"), () => {
        replaceModuleSelection(CHRISTIAN_MODULES, "christian_catholic");
        moduleSelectionChanged();
      }));
      rightColumn.append(children);
    }

    const nameDays = document.createElement("details");
    nameDays.className = "module-folder";
    nameDays.open = state.nameDaysOpen;
    nameDays.addEventListener("toggle", () => { state.nameDaysOpen = nameDays.open; });
    const nameDaysSummary = document.createElement("summary");
    nameDaysSummary.textContent = "Именины";
    nameDays.append(nameDaysSummary);
    const nameDayChildren = document.createElement("div");
    nameDayChildren.className = "module-children";
    const orthodoxNamesSelected = anyModuleSelected(ORTHODOX_NAME_DAY_MODULES);
    nameDayChildren.append(makeCheckboxControl("Православие", orthodoxNamesSelected, checked => {
      if (checked) {
        const oldStyle = state.selectedModules.has("name_days_orthodox_old");
        replaceModuleSelection(ORTHODOX_NAME_DAY_MODULES, oldStyle ? "name_days_orthodox_old" : "name_days_orthodox_new");
      } else {
        replaceModuleSelection(ORTHODOX_NAME_DAY_MODULES, null);
      }
      moduleSelectionChanged();
    }));
    if (orthodoxNamesSelected) {
      const styles = document.createElement("div");
      styles.className = "module-children module-subchildren";
      styles.append(makeRadioControl("Старое", "name-days-style", state.selectedModules.has("name_days_orthodox_old"), () => {
        replaceModuleSelection(ORTHODOX_NAME_DAY_MODULES, "name_days_orthodox_old");
        moduleSelectionChanged();
      }));
      styles.append(makeRadioControl("Новое", "name-days-style", state.selectedModules.has("name_days_orthodox_new"), () => {
        replaceModuleSelection(ORTHODOX_NAME_DAY_MODULES, "name_days_orthodox_new");
        moduleSelectionChanged();
      }));
      nameDayChildren.append(styles);
    }
    nameDayChildren.append(makeCheckboxControl("Католицизм", state.selectedModules.has("name_days_catholic"), checked => {
      if (checked) state.selectedModules.add("name_days_catholic");
      else state.selectedModules.delete("name_days_catholic");
      moduleSelectionChanged();
    }));
    nameDays.append(nameDayChildren);
    rightColumn.append(nameDays);

    const governmentSelected = anyModuleSelected(GOVERNMENT_MODULES);
    leftColumn.append(makeCheckboxControl("Государственные", governmentSelected, checked => {
      if (checked) {
        if (!anyModuleSelected(GOVERNMENT_MODULES)) state.selectedModules.add("government_russia");
      } else {
        replaceModuleSelection(GOVERNMENT_MODULES, null);
      }
      moduleSelectionChanged();
    }));
    if (governmentSelected) {
      const children = document.createElement("div");
      children.className = "module-children";
      children.append(makeRadioControl("Россия", "government-country", state.selectedModules.has("government_russia"), () => {
        replaceModuleSelection(GOVERNMENT_MODULES, "government_russia");
        moduleSelectionChanged();
      }));
      children.append(makeRadioControl("Украина", "government-country", state.selectedModules.has("government_ukraine"), () => {
        replaceModuleSelection(GOVERNMENT_MODULES, "government_ukraine");
        moduleSelectionChanged();
      }));
      leftColumn.append(children);
    }

    leftColumn.append(makeModuleOption("international", "Международные"));
    leftColumn.append(makeModuleOption("professional", "Профессиональные"));
    leftColumn.append(makeModuleOption("fun_dates", "Забавные даты"));
  }
  function makeCheckboxControl(label, checked, onChange) {
    return makeControl(label, "checkbox", checked, "", onChange);
  }
  function makeRadioControl(label, name, checked, onChange) {
    return makeControl(label, "radio", checked, name, onChange);
  }
  function makeControl(label, type, checked, name, onChange) {
    const row = document.createElement("label");
    row.className = "module-option";
    const input = document.createElement("input");
    input.type = type;
    input.checked = checked;
    if (name) input.name = name;
    input.addEventListener("change", () => {
      if (type === "checkbox" || input.checked) onChange(input.checked);
    });
    const text = document.createElement("span");
    text.textContent = label;
    row.append(input, text);
    return row;
  }
  function moduleSelectionChanged() {
    saveSettings();
    renderModuleList();
    state.monthEvents = [];
    renderCalendar();
    if (!getSelectedModules().length) {
      state.monthRequestId++;
      state.dayRequestId++;
      if (state.monthController) state.monthController.abort();
      if (state.dayController) state.dayController.abort();
      calendarStatus.textContent = "";
      dayStatus.textContent = "";
      state.dayEvents = [];
      renderDayEvents();
      renderCalendar();
      return;
    }
    loadMonthEvents();
    loadDayEvents();
  }
  function makeModuleOption(id, label) {
    return makeCheckboxControl(label, state.selectedModules.has(id), checked => {
      if (checked) state.selectedModules.add(id);
      else {
        state.selectedModules.delete(id);
        if (id === "tibet") state.phugpaDaily = false;
        if (id === "vietnam") state.socVong = false;
        if ((id === "north_india" || id === "south_india") && !state.selectedModules.has(id === "north_india" ? "south_india" : "north_india")) resetHinduOptions();
      }
      moduleSelectionChanged();
    });
  }
  function renderDayHeading() {
    const date = state.selectedDate;
    dayWeekday.textContent = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date).toLocaleUpperCase(locale);
    dayTitle.textContent = titleCase(new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(date)) + (sameDay(date, today) ? " (сегодня)" : "");
  }
  function hasMoreThanThreeLines(text, card, className = "event-description") {
    if (!text) return false;
    const probe = document.createElement("p");
    probe.className = className.split(/\s+/).filter(name => name !== "event-collapsed").join(" ");
    probe.textContent = text;
    Object.assign(probe.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: Math.max(0, card.clientWidth
        - parseFloat(getComputedStyle(card).paddingLeft)
        - parseFloat(getComputedStyle(card).paddingRight)) + "px",
      margin: "0",
      visibility: "hidden",
      pointerEvents: "none"
    });
    document.body.append(probe);
    const lineHeight = parseFloat(getComputedStyle(probe).lineHeight);
    const hasMore = lineHeight > 0 && probe.scrollHeight > lineHeight * 3 + 1;
    probe.remove();
    return hasMore;
  }

  function appendDailySummaryToggle(card, details, fullText, id) {
    const isExpanded = state.expandedEvents.has(id);
    details.classList.toggle("event-collapsed", !isExpanded);
    details.textContent = fullText;
    dayEvents.append(card);

    const hasMoreThanThree = hasMoreThanThreeLines(fullText, card, details.className);
    if (hasMoreThanThree || isExpanded) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "event-toggle";
      toggle.textContent = isExpanded ? "Свернуть" : "Подробнее";
      toggle.addEventListener("click", () => {
        if (state.expandedEvents.has(id)) state.expandedEvents.delete(id);
        else state.expandedEvents.add(id);
        renderDayEvents();
      });
      card.append(toggle);
    }
  }
  function renderDayEvents() {
    const filtered = state.dayEvents.filter(event => categoryForEvent(event) === state.activeEventCategory && !(state.moonInfo && state.activeEventCategory === "astronomy" && String(event.module || "") === "moon"));
    dayEvents.replaceChildren();
    const hasAny = state.dayEvents.length > 0;
    const showMoonInfo = state.selectedModules.has("moon") && Boolean(state.moonInfo) && state.activeEventCategory === "astronomy";
    const showPhugpaInfo = state.activeEventCategory === "buddhism" && state.selectedModules.has("tibet") && state.phugpaDaily && Boolean(state.phugpaInfo);
    const showPanchangaInfo = state.activeEventCategory === "hindu" && (state.selectedModules.has("north_india") || state.selectedModules.has("south_india")) && state.hinduOptions.panchanga && Boolean(state.panchangaInfo);
    $$("#event-categories .image-tab").forEach(button => {
      const category = button.dataset.category;
      const enabled = state.dayEvents.some(event => categoryForEvent(event) === category) || (category === "astronomy" && state.selectedModules.has("moon") && Boolean(state.moonInfo)) || (category === "buddhism" && state.selectedModules.has("tibet") && state.phugpaDaily && Boolean(state.phugpaInfo)) || (category === "hindu" && (state.selectedModules.has("north_india") || state.selectedModules.has("south_india")) && state.hinduOptions.panchanga && Boolean(state.panchangaInfo));
      const active = category === state.activeEventCategory;
      button.disabled = !enabled;
      button.classList.toggle("is-active", active && enabled);
      button.setAttribute("aria-pressed", String(active && enabled));
    });
    dayEmpty.hidden = filtered.length > 0 || showMoonInfo || showPhugpaInfo || showPanchangaInfo;
    if (!hasAny) {
      if (!getSelectedModules().length) dayEmpty.textContent = "Включите хотя бы один календарь в настройках.";
      else if (showPhugpaInfo || showPanchangaInfo) dayEmpty.textContent = "";
      else if (state.monthEvents.length) dayEmpty.textContent = "На выбранную дату событий нет. Выберите в календаре дату с точкой — там есть события.";
      else dayEmpty.textContent = "На выбранную дату событий не найдено.";
    } else if (!filtered.length) dayEmpty.textContent = "";
    if (showPhugpaInfo) {
      const info = state.phugpaInfo;
      const card = document.createElement("article");
      card.className = "event-card phugpa-info-card";
      const title = document.createElement("h3");
      title.className = "event-title";
      title.textContent = "\u{1F538} \u041f\u0423\u0413\u041f\u0410 (\u0421\u0412\u041e\u0414\u041a\u0410 \u0414\u041d\u042f)";
      const details = document.createElement("p");
      details.className = "event-description phugpa-summary";
      details.textContent = String(info.description || "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u041f\u0443\u0433\u043f\u0430 \u0434\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u0434\u043d\u044f \u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e.").replace(/^\u{1F538}\s*/u, "");
      const phugpaDescription = details.textContent;
      card.append(title, details);
      appendDailySummaryToggle(card, details, phugpaDescription, "phugpa-daily-" + dateKey(state.selectedDate));
    }
    if (showPanchangaInfo) {
      const card = document.createElement("article");
      card.className = "event-card panchanga-info-card";
      const title = document.createElement("h3"); title.className = "event-title";
      title.textContent = "\u{1F338} \u041f\u0410\u041d\u0427\u0410\u041d\u0413\u0410 (\u0421\u0412\u041e\u0414\u041a\u0410 \u0414\u041d\u042f)";
      const details = document.createElement("p"); details.className = "event-description panchanga-summary";
      const panchangaDescription = String(state.panchangaInfo.description || "").replace(/^\u{1F338}\s*/u, "").replace(/([^\n])\n(?=(?:Начало|Start):)/g, "$1\n\n");
      details.textContent = panchangaDescription || "\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u043f\u0430\u043d\u0447\u0430\u043d\u0433\u0438 \u0434\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u0434\u043d\u044f.";
      card.append(title, details);
      appendDailySummaryToggle(card, details, details.textContent, "panchanga-daily-" + dateKey(state.selectedDate));
    }
    if (showMoonInfo) {
      const card = document.createElement("article");
      card.className = "event-card moon-info-card";
      const lines = String(state.moonInfo.description || "").split("\n");
      const title = document.createElement("h3");
      title.className = "event-title";
      title.textContent = lines.shift() || String(state.moonInfo.title || "").toLocaleUpperCase(locale);
      const details = document.createElement("p");
      details.className = "event-summary moon-summary";
      details.textContent = lines.join("\n");
      card.append(title, details);
      dayEvents.append(card);
    }

    filtered.forEach((event, index) => {
      const card = document.createElement("article");
      card.className = "event-card";
      const title = document.createElement("h3");
      title.className = "event-title";
      const eventEmoji = String(event.emoji || "");
      title.textContent = (eventEmoji ? eventEmoji + " " : "") + String(event.title || "Событие").toLocaleUpperCase(locale);
      const dates = document.createElement("p");
      dates.className = "event-date";
      const start = event.start_date || event.start;
      const end = event.end_date || event.end;
      dates.textContent = start && end && String(start).slice(0, 10) !== String(end).slice(0, 10) ? String(start).slice(0, 10) + " — " + String(end).slice(0, 10) : "";
      if (!dates.textContent) dates.hidden = true;
      const rawDescription = eventDescription(event);
      const descriptionText = formatDescription(rawDescription, event.module);
      const summary = document.createElement("p");
      summary.className = "event-summary";
      summary.textContent = descriptionText;
      const eventId = String(event.id || index);
      const isExpanded = state.expandedEvents.has(eventId);
      summary.classList.toggle("event-collapsed", !isExpanded);
      card.append(title, dates);
      if (!isExpanded && descriptionText) card.append(summary);
      if (isExpanded && descriptionText) {
        const description = document.createElement("p");
        description.className = "event-description";
        description.textContent = descriptionText;
        card.append(description);
      }
      dayEvents.append(card);

      const hasMoreThanThree = hasMoreThanThreeLines(descriptionText, card, "event-description");
      if (hasMoreThanThree || isExpanded) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "event-toggle";
        toggle.textContent = isExpanded ? "Свернуть" : "Подробнее";
        toggle.addEventListener("click", () => {
          const id = String(event.id || index);
          if (state.expandedEvents.has(id)) state.expandedEvents.delete(id); else state.expandedEvents.add(id);
          renderDayEvents();
        });
        card.append(toggle);
      }
    });
  }
  async function loadMonthEvents() {
    const modules = getSelectedModules();
    if (!modules.length) return;
    const params = requestParams();
    if (!params) return;
    params.set("year", String(state.month.getFullYear()));
    params.set("month", String(state.month.getMonth() + 1));
    if (state.monthController) state.monthController.abort();
    const controller = new AbortController();
    state.monthController = controller;
    const requestId = ++state.monthRequestId;
    calendarStatus.textContent = "Загружаем события…";
    try {
      const payload = await fetchJson(API_BASE + "/api/calendar/month?" + params.toString(), controller.signal);
      if (requestId !== state.monthRequestId) return;
      state.monthEvents = eventsForMonth(normalizeEvents(payload), state.month);
      calendarStatus.textContent = "";
      renderCalendar();
      if (!state.dayEvents.length) renderDayEvents();
    } catch (error) {
      if (requestId !== state.monthRequestId || error.name === "AbortError") return;
      state.monthEvents = [];
      calendarStatus.textContent = safeErrorMessage(error);
      renderCalendar();
    }
  }
  async function loadDayEvents() {
    const modules = getSelectedModules();
    if (!modules.length) {
      state.moonInfo = null;
      state.phugpaInfo = null;
      state.panchangaInfo = null;
      state.dayEvents = [];
      dayStatus.textContent = "";
      renderDayEvents();
      return;
    }
    const params = requestParams(state.selectedDate);
    if (!params) return;
    if (state.dayController) state.dayController.abort();
    const controller = new AbortController();
    state.dayController = controller;
    const requestId = ++state.dayRequestId;
    const keyAtRequest = dateKey(state.selectedDate);
    dayStatus.textContent = "Загружаем события…";
    dayEmpty.hidden = true;
    try {
      const payload = await fetchJson(API_BASE + "/api/calendar/day?" + params.toString(), controller.signal);
      if (requestId !== state.dayRequestId || keyAtRequest !== dateKey(state.selectedDate)) return;
      state.moonInfo = state.selectedModules.has("moon") && payload && payload.moon_phase ? payload.moon_phase : null;
      state.phugpaInfo = state.selectedModules.has("tibet") && state.phugpaDaily && payload && payload.phugpa_daily ? payload.phugpa_daily : null;
      state.panchangaInfo = (state.selectedModules.has("north_india") || state.selectedModules.has("south_india")) && state.hinduOptions.panchanga && payload && payload.panchanga ? payload.panchanga : null;
      state.dayEvents = normalizeEvents(payload).filter(event => eventOccursOn(event, state.selectedDate));
      const available = new Set(state.dayEvents.map(categoryForEvent));
      if (state.selectedModules.has("moon") && state.moonInfo) available.add("astronomy");
      if (state.selectedModules.has("tibet") && state.phugpaDaily && state.phugpaInfo) available.add("buddhism");
      if ((state.selectedModules.has("north_india") || state.selectedModules.has("south_india")) && state.hinduOptions.panchanga && state.panchangaInfo) available.add("hindu");
      if (!available.has(state.activeEventCategory)) state.activeEventCategory = CATEGORY_ORDER.find(key => available.has(key)) || "astronomy";
      dayStatus.textContent = "";
      renderDayEvents();
    } catch (error) {
      if (requestId !== state.dayRequestId || error.name === "AbortError") return;
      state.dayEvents = [];
      state.moonInfo = null;
      state.phugpaInfo = null;
      state.panchangaInfo = null;
      dayStatus.textContent = safeErrorMessage(error);
      renderDayEvents();
    }
  }
  function changeMonth(offset) {
    const oldDate = state.selectedDate;
    const nextMonth = new Date(state.month.getFullYear(), state.month.getMonth() + offset, 1);
    state.month = nextMonth;
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    state.selectedDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(oldDate.getDate(), lastDay));
    selectedDayKey = dateKey(state.selectedDate);
    state.expandedEvents.clear();
    renderCalendar();
    renderDayHeading();
    if (getSelectedModules().length) {
      loadMonthEvents();
      loadDayEvents();
    } else {
      state.monthEvents = [];
      state.dayEvents = [];
      renderCalendar();
      renderDayEvents();
    }
  }
  function resetSettings() {
    state.activeSettingsCategory = DEFAULTS.activeSettingsCategory;
    state.selectedModules = new Set(DEFAULTS.selectedModules);
    state.phugpaDaily = false;
    state.socVong = false;
    resetHinduOptions();
    state.phugpaInfo = null;
    state.settings = { ...DEFAULTS, locale };
    saveSettings();
    renderModuleList();
    state.monthEvents = [];
    renderCalendar();
    if (state.monthController) state.monthController.abort();
    if (state.dayController) state.dayController.abort();
    loadMonthEvents();
    loadDayEvents();
  }
  function wireEvents() {
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderDayEvents, 120);
    });
    $("#previous-month").addEventListener("click", () => changeMonth(-1));
    $("#next-month").addEventListener("click", () => changeMonth(1));
    $("#settings-categories").addEventListener("click", event => {
      const button = event.target.closest("button[data-category]");
      if (!button) return;
      state.activeSettingsCategory = button.dataset.category;
      saveSettings();
      renderModuleList();
    });
    $("#event-categories").addEventListener("click", event => {
      const button = event.target.closest("button[data-category]");
      if (!button || button.disabled) return;
      state.activeEventCategory = button.dataset.category;
      renderDayEvents();
    });
    $("#reset-settings").addEventListener("click", resetSettings);
  }
  function init() {
    loadSettings();
    selectedDayKey = dateKey(state.selectedDate);
    renderCalendar();
    renderModuleList();
    renderDayHeading();
    renderDayEvents();
    wireEvents();
    if (getSelectedModules().length) {
      loadMonthEvents();
      loadDayEvents();
    } else {
      calendarStatus.textContent = "";
      dayStatus.textContent = "";
      renderDayEvents();
    }
  }
  init();
})();
