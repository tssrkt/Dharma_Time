const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("  function eventSupplementaryInfo(event) {");
const end = source.indexOf("  function renderDayEvents() {", start);
assert.ok(start >= 0 && end > start, "eventSupplementaryInfo function is present");
const getInfo = new Function("locale", `${source.slice(start, end)}; return eventSupplementaryInfo;`);
const format = getInfo("ru");

test("month and day calendar requests are sequenced after successful month loading", () => {
  const start = source.indexOf("  function loadCalendarData() {");
  const end = source.indexOf("  function setLocale(", start);
  assert.ok(start >= 0 && end > start, "calendar load coordinator is present");
  const coordinator = source.slice(start, end);
  assert.match(coordinator, /loadMonthEvents\(\)/);
  assert.match(coordinator, /monthLoaded && monthRequestId === state\.monthRequestId/);
  assert.match(coordinator, /return loadDayEvents\(\)/);
  assert.match(source, /if \(getSelectedModules\(\)\.length\) \{\s*loadCalendarData\(\);/);
});

test("Thai uposatha shows city but not Buddhist year or raw lunar fields", () => {
  const text = format({ module: "thailand", id: "thailand_thailand_uposatha_first_quarter_2026-11-21", extra: { display_city: "Бангкок (Таиланд)", be_year: 2569 }, lunar_info: { thai_month: "Kartika", thai_lunar_day: 8 } });
  assert.equal(text, "Город: Бангкок (Таиланд)");
});

test("Thai Songkran shows Buddhist year", () => {
  const text = format({ module: "thailand", id: "thailand_thailand_songkran_2026-04-13", extra: { display_city: "Бангкок (Таиланд)", be_year: 2569 } });
  assert.equal(text, "Город: Бангкок (Таиланд)\nБуддийский год: 2569 BE");
});

test("Myanmar uposatha shows only city; New Year also shows Myanmar year", () => {
  const common = { module: "myanmar", extra: { display_city: "Янгон (Бирма)", myanmar_year: 1388 }, lunar_info: { myanmar_month: "Tagu", myanmar_year: 1388 } };
  assert.equal(format({ ...common, id: "myanmar_myanmar_uposatha_new_moon_2026-11-21" }), "Город: Янгон (Бирма)");
  assert.equal(format({ ...common, id: "myanmar_myanmar_new_year_2026-04-17" }), "Город: Янгон (Бирма)\nБирманский год: 1388 ME");
});

test("Sri Lanka Buddhist year is restricted to Vesak", () => {
  const common = { module: "sri_lanka", extra: { display_city: "Коломбо (Шри-Ланка)", buddhist_year: 2569 } };
  assert.equal(format({ ...common, id: "sri_lanka_sri_lanka_vesak_poya_2026-05-01" }), "Город: Коломбо (Шри-Ланка)\nБуддийский год: 2569 BE");
  assert.equal(format({ ...common, id: "sri_lanka_sri_lanka_uposatha_2026-05-02" }), "Город: Коломбо (Шри-Ланка)");
});

test("Name-day modules map to localized tradition labels and one shared heading", () => {
  const start = source.indexOf("  const NAME_DAY_MODULES = new Set([");
  const end = source.indexOf("  function eventDescription(event) {", start);
  assert.ok(start >= 0 && end > start, "name-day helpers are present");
  const helpers = source.slice(start, end);
  assert.match(helpers, /name_days_orthodox_old/);
  assert.match(helpers, /name_days_orthodox_new/);
  assert.match(helpers, /name_days_catholic/);
  assert.match(source, /NAME DAYS!.*ИМЕНИНЫ!/s);
  assert.match(source, /nameDayTradition\(event\).*name \+ "\."/);
  assert.match(source, /replace\(\/\^\[\^:\]\+:\\s\*\/u, ""\)/);
  assert.match(source, /filtered\.filter\(event => !isNameDayEvent\(event\)\)/);
});

test("Catholicism is listed before Orthodoxy in Christian and name-day settings", () => {
  const start = source.indexOf("  function renderMiscModuleOptions(container) {");
  assert.ok(start >= 0, "misc settings renderer is present");
  const settings = source.slice(start);
  assert.ok(settings.indexOf('makeRadioControl("Католицизм"') < settings.indexOf('makeRadioControl("Православие"'));
  assert.ok(settings.indexOf('makeCheckboxControl("Католицизм"') < settings.indexOf('makeCheckboxControl("Православие"'));
});

test("Calendar name days use a plain-text Именины label and all tooltip text is regular weight", () => {
  assert.match(source, /button\.classList\.toggle\("has-name-days", hasNameDays\)/);
  assert.match(source, /button\.classList\.toggle\("has-regular-events", hasRegularEvents\)/);
  assert.match(source, /const hasRegularEvents = dayEvents\.some\(event => !isNameDayEvent\(event\)\)/);
  assert.doesNotMatch(source, /name-day-marker/);
  assert.match(source, /const names = Array\.from\(new Set\(dayEvents/);
  assert.match(source, /if \(hasNameDays \|\| regularEvents\.length\)/);
  assert.match(source, /const item = document\.createElement\("li"\);\s*item\.textContent = \(locale === "en" \? "Name days: " : "Именины: "\) \+ names\.join\(", "\);\s*list\.append\(item\);/);
  assert.match(source, /names\.join\(", "\)/);
  assert.match(source, /dayEvents\.filter\(event => !isNameDayEvent\(event\)\)/);
  assert.doesNotMatch(source, /event-tooltip-name-days/);
  assert.doesNotMatch(source, /Сегодня именины|Name days today|createElement\("strong"\)/);
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(css, /\.event-tooltip, \.event-tooltip \* \{ font-weight: 400; \}/);
  assert.match(css, /\.event-tooltip-list \{[^}]*list-style: disc;/);
  assert.match(css, /calendar-day\.has-regular-events::before/);
  assert.match(css, /\.calendar-day\.is-moon-phase::after \{[^}]*border-radius: 50%/);
  assert.doesNotMatch(css, /\.calendar-day\.is-moon-phase:not\(\.has-name-days\)::after/);
  assert.doesNotMatch(css, /name-day-marker/);
  assert.doesNotMatch(css, /calendar-day\.has-events:not\(\.has-name-days\)::before/);
});

test("All day-detail card headings, including Panchanga and Phugpa, are rendered uppercase", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(css, /\.event-title\s*\{[^}]*text-transform:\s*uppercase/s);
  assert.match(source, /title\.className = "event-title"/);
});

test("All event titles, including Ekadashi, use uppercase formatting", () => {
  assert.match(source, /eventTitle\.toLocaleUpperCase\(locale\)/);
  assert.doesNotMatch(source, /preserveTitleCase/);
});

test("Calendar loading status is out of flow and error text uses a single line break", () => {
  assert.ok(source.includes('return tr("Не удалось загрузить календарь.\\nПроверьте подключение и попробуйте позже.")'));
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(css, /\.settings-panel \{ position: relative;/);
  assert.match(css, /#calendar-status \{ position: absolute;[^}]*white-space: pre-line;/);
  assert.match(css, /#calendar-status \{[^}]*line-height: calc\(1\.04em \+ 2px\);/);
});

test("Event descriptions preserve paragraph breaks across modules and normalize spacing", () => {
  const start = source.indexOf("  function formatDescription(value, module) {");
  const end = source.indexOf("  function iconForCategory(", start);
  assert.ok(start >= 0 && end > start, "formatDescription function is present");
  const getFormatter = new Function(`${source.slice(start, end)}; return formatDescription;`);
  const formatDescription = getFormatter();
  const description = "First sentence.\n\n🎉 Second paragraph.\n\n❤️ Third paragraph.";
  for (const module of ["sun", "moon", "north_india", "christian_catholic", "tibet", "government_russia"]) {
    assert.equal(formatDescription(description, module), description, module);
  }
  assert.equal(formatDescription("  One line.\r\n  Another line.  ", "sun"), "One line.\nAnother line.");
  assert.equal(formatDescription("First.\n\n\nSecond.", "moon"), "First.\n\nSecond.");
});

test("City-only supplementary text follows description without a blank paragraph", () => {
  const separatorStart = source.indexOf("  function eventDescriptionSeparator(supplementaryText, locale) {");
  const separatorEnd = source.indexOf("  function renderDayEvents() {", separatorStart);
  assert.ok(separatorStart >= 0 && separatorEnd > separatorStart, "eventDescriptionSeparator function is present");
  const getSeparator = new Function("locale", `${source.slice(separatorStart, separatorEnd)}; return eventDescriptionSeparator;`);
  const separator = getSeparator("ru");
  assert.equal(separator("Город: Винники", "ru"), "\n");
  assert.equal(separator("Город: Винники\nТитхи: Шукла Шашти (6)\nНачало: 19:54", "ru"), "\n\n");
  assert.equal(separator("Город: Винники\nТитхи: Шукла Шашти (6)\nНачало: 19:54\nКонец: 22:31", "ru"), "\n\n");
  assert.equal(separator("Other information", "ru"), "\n\n");
  assert.ok(source.includes("join(eventDescriptionSeparator(supplementaryText, locale))"));
});

test("Selecting a calendar module preserves existing events until the new response arrives", () => {
  const selectionStart = source.indexOf("  function moduleSelectionChanged() {");
  const selectionEnd = source.indexOf("  function makeModuleOption(", selectionStart);
  assert.ok(selectionStart >= 0 && selectionEnd > selectionStart, "moduleSelectionChanged function is present");
  const selection = source.slice(selectionStart, selectionEnd);
  assert.ok(selection.indexOf("if (!getSelectedModules().length)") < selection.indexOf("state.monthEvents = []"), "month events clear only when all modules are disabled");
  assert.doesNotMatch(selection.slice(0, selection.indexOf("if (!getSelectedModules().length)")), /state\.(?:monthEvents|dayEvents)\s*=\s*\[\]/);
  const monthStart = source.indexOf("  async function loadMonthEvents() {");
  const dayStart = source.indexOf("  async function loadDayEvents() {");
  const monthLoader = source.slice(monthStart, dayStart);
  const dayLoader = source.slice(dayStart, source.indexOf("  function changeMonth(", dayStart));
  assert.match(monthLoader, /catch \(error\) \{\s*if \(requestId !== state\.monthRequestId \|\| error\.name === "AbortError"\) return false;\s*calendarStatus\.textContent/);
  assert.match(dayLoader, /catch \(error\) \{\s*if \(requestId !== state\.dayRequestId \|\| error\.name === "AbortError"\) return;\s*dayStatus\.textContent/);
  assert.doesNotMatch(monthLoader, /catch \(error\) \{[^}]*state\.monthEvents\s*=\s*\[\]/s);
  assert.doesNotMatch(dayLoader, /catch \(error\) \{[^}]*state\.dayEvents\s*=\s*\[\]/s);
});

test("Dark theme is available from the day menu and persisted locally", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(html, /id="theme-toggle"[^>]*aria-pressed="false">DARK THEME/);
  assert.doesNotMatch(html, /id="theme-toggle"[^>]*disabled/);
  assert.match(source, /function setupThemeToggle\(\)/);
  assert.match(source, /localStorage\.getItem\("dharma-time-theme-v1"\)/);
  assert.match(source, /localStorage\.setItem\("dharma-time-theme-v1", nextTheme\)/);
  assert.match(source, /document\.documentElement\.dataset\.theme = isDark \? "dark" : "light"/);
  assert.match(source, /button\.textContent = isDark \? \(locale === "en" \? "LIGHT THEME" : "СВЕТЛАЯ ТЕМА"\) : \(locale === "en" \? "DARK THEME" : "ТЁМНАЯ ТЕМА"\)/);
  assert.match(css, /:root\[data-theme="dark"\]\s*\{[^}]*color-scheme: dark;/s);
  assert.match(css, /:root\[data-theme="dark"\] \.event-card/);
  assert.match(css, /:root\[data-theme="dark"\] \.day-menu/);
});

test("Calendar month/day API responses use a five-minute session cache with a 24-hour stale fallback", () => {
  assert.match(source, /const API_CACHE_PREFIX = "dharma-time-api-cache-v1:"/);
  assert.match(source, /const API_CACHE_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(source, /const API_CACHE_STALE_TTL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(source, /function readApiCache\(url, allowStale = false\)/);
  assert.match(source, /function writeApiCache\(url, payload\)/);
  assert.match(source, /API_CACHE_PREFIX \+ url/);
  assert.match(source, /const stale = entry\.expiresAt <= now/);
  assert.match(source, /if \(cached && cached\.hit\) return cached\.payload/);
  assert.match(source, /if \(response\.ok\) \{\s*const payload = await response\.json\(\);\s*writeApiCache\(url, payload\);\s*return payload;/);
  assert.match(source, /url\.includes\("\/api\/calendar\/month\?"\).*url\.includes\("\/api\/calendar\/day\?"/s);
  assert.match(source, /catch \(_\) \{\s*\/\/ Caching is optional; the calendar must work when sessionStorage is unavailable or full\./);
});

test("Calendar cache separates request URLs, expires fresh entries, preserves stale entries for fallback, and tolerates storage errors", () => {
  const start = source.indexOf("  function readApiCache(url, allowStale = false) {");
  const end = source.indexOf("  function waitForApiIdle()", start);
  assert.ok(start >= 0 && end > start, "cache helpers are present");
  let now = 1000;
  const values = new Map();
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const helpers = new Function("sessionStorage", "API_CACHE_PREFIX", "API_CACHE_TTL_MS", "API_CACHE_STALE_TTL_MS", "Date",
    source.slice(start, end) + "; return { readApiCache, writeApiCache };"
  )(storage, "test-cache:", 300000, 86400000, { now: () => now });
  const monthUrl = "https://example.test/api/calendar/month?modules=moon&month=11";
  const otherMonthUrl = "https://example.test/api/calendar/month?modules=moon&month=12";
  const payload = { events: [{ id: "moon-1" }] };
  helpers.writeApiCache(monthUrl, payload);
  assert.deepEqual(helpers.readApiCache(monthUrl), { hit: true, payload, stale: false });
  assert.equal(helpers.readApiCache(otherMonthUrl), null);
  now += 300001;
  assert.equal(helpers.readApiCache(monthUrl), null);
  assert.deepEqual(helpers.readApiCache(monthUrl, true), { hit: true, payload, stale: true });
  assert.equal(values.size, 1);
  now += 86400000;
  assert.equal(helpers.readApiCache(monthUrl, true), null);
  assert.equal(values.size, 0);

  const brokenStorage = {
    getItem() { throw new Error("storage unavailable"); },
    setItem() { throw new Error("storage unavailable"); },
    removeItem() { throw new Error("storage unavailable"); }
  };
  const safeHelpers = new Function("sessionStorage", "API_CACHE_PREFIX", "API_CACHE_TTL_MS", "API_CACHE_STALE_TTL_MS", "Date",
    source.slice(start, end) + "; return { readApiCache, writeApiCache };"
  )(brokenStorage, "test-cache:", 300000, 86400000, { now: () => now });
  assert.equal(safeHelpers.readApiCache(monthUrl), null);
  assert.doesNotThrow(() => safeHelpers.writeApiCache(monthUrl, payload));
});

test("Calendar requests retry transient HTTP/network failures and use stale calendar data when API is unavailable", async () => {
  const start = source.indexOf("  async function fetchJson(url, signal) {");
  const end = source.indexOf("  function safeErrorMessage(error) {", start);
  assert.ok(start >= 0 && end > start, "fetchJson is present");
  const makeFetcher = (fetchImpl, readCache = () => null) => {
    const state = { apiRequestsInFlight: 0, apiIdleWaiters: [] };
    const fetchJson = new Function(
      "state", "readApiCache", "writeApiCache", "RETRY_LIMIT", "RETRY_DELAY_CAP_MS",
      "fetch", "wait", "retryDelay", "DOMException",
      source.slice(start, end) + "; return fetchJson;"
    )(state, readCache, () => {}, 2, 15000, fetchImpl, async () => {}, () => 0, DOMException);
    return { fetchJson, state };
  };
  let calls = 0;
  const retrying = makeFetcher(async () => {
    calls++;
    if (calls < 3) return { ok: false, status: 502, headers: { get: () => null } };
    return { ok: true, json: async () => ({ events: [{ id: "recovered" }] }) };
  });
  assert.deepEqual(await retrying.fetchJson("https://example.test/api/calendar/month?year=2026"), { events: [{ id: "recovered" }] });
  assert.equal(calls, 3);
  assert.equal(retrying.state.apiRequestsInFlight, 0);

  const cachedPayload = { events: [{ id: "stale" }] };
  const unavailable = makeFetcher(async () => { throw new TypeError("network unavailable"); }, (url, allowStale) =>
    allowStale ? { hit: true, payload: cachedPayload, stale: true } : null
  );
  const fallback = await unavailable.fetchJson("https://example.test/api/calendar/month?year=2026");
  assert.deepEqual(fallback, { events: [{ id: "stale" }], __staleCache: true });
  assert.equal(unavailable.state.apiRequestsInFlight, 0);

  let serverFailures = 0;
  const serverUnavailable = makeFetcher(async () => {
    serverFailures++;
    return { ok: false, status: 503, headers: { get: () => null } };
  }, (url, allowStale) => allowStale ? { hit: true, payload: cachedPayload, stale: true } : null);
  const serverFallback = await serverUnavailable.fetchJson("https://example.test/api/calendar/month?year=2026");
  assert.deepEqual(serverFallback, { events: [{ id: "stale" }], __staleCache: true });
  assert.equal(serverFailures, 3);
  assert.equal(serverUnavailable.state.apiRequestsInFlight, 0);

  let timeoutAttempts = 0;
  const calculationTimeout = makeFetcher(async () => {
    timeoutAttempts++;
    return {
      ok: false,
      status: 503,
      headers: { get: () => "5" },
      clone: () => ({ json: async () => ({ error: { code: "calculation_timeout" } }) })
    };
  }, (url, allowStale) => allowStale ? { hit: true, payload: cachedPayload, stale: true } : null);
  const timeoutFallback = await calculationTimeout.fetchJson("https://example.test/api/calendar/month?year=2026");
  assert.deepEqual(timeoutFallback, { events: [{ id: "stale" }], __staleCache: true });
  assert.equal(timeoutAttempts, 1, "an exhausted server calculation must not be restarted automatically");
  assert.equal(calculationTimeout.state.apiRequestsInFlight, 0);
});


test("Language switch waits for in-flight calendar requests before reloading in the new locale", () => {
  assert.match(source, /apiRequestsInFlight: 0/);
  assert.match(source, /apiIdleWaiters: \[\]/);
  assert.match(source, /function waitForApiIdle\(\)/);
  assert.match(source, /function reloadLocaleEvents\(requestedLocale\)/);
  assert.match(source, /function loadCalendarData\(\)/);
  assert.match(source, /if \(locale === requestedLocale\) loadCalendarData\(\)/);
  assert.match(source, /state\.apiRequestsInFlight\+\+/);
  assert.match(source, /state\.apiRequestsInFlight--/);
  assert.match(source, /const previousRequestsPending = state\.apiRequestsInFlight > 0/);
  assert.match(source, /waitForApiIdle\(\)\.then\(\(\) => \{/);
  const start = source.indexOf("  function setLocale(nextLocale) {");
  const end = source.indexOf("  function applyStaticTranslations()", start);
  const setter = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(setter, /Do not abort an in-progress locale request/);
  assert.doesNotMatch(setter, /monthController\.abort\(\)|dayController\.abort\(\)/);
});

test("Event description toggle appears only when the description reaches five rendered lines", () => {
  assert.match(source, /function hasAtLeastFiveLines\(text, card, className = "event-description"\)/);
  assert.match(source, /probe\.scrollHeight >= lineHeight \* 5 - 1/);
  assert.match(source, /const needsToggle = hasAtLeastFiveLines\(fullText, card/);
  assert.match(source, /summary\.classList\.toggle\("event-collapsed", needsToggle && !isExpanded\)/);
  assert.match(source, /if \(needsToggle\) \{/);
  assert.doesNotMatch(source, /hasMoreThanThreeLines|hasMoreThanThree/);
});

test("Language menu tooltip follows the target language in Russian and English", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /id="language-toggle"[^>]*title="Switch to English"/);
  assert.match(source, /const languageTooltip = locale === "en"/);
  assert.match(source, /\\u041f\\u0435/);
  assert.match(source, /menuLanguage\.title = languageTooltip/);
  assert.match(source, /menuLanguage\.setAttribute\("aria-label", languageTooltip\)/);
});

test("Language switcher enables RU/EN, persists locale, and rerenders the current page", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.includes('id="language-toggle"'));
  assert.doesNotMatch(html, /id="language-toggle"[^>]*disabled/);
  assert.ok(source.includes('let locale = "ru"'));
  assert.ok(source.includes('locale = stored.locale === "en" ? "en" : "ru"'));
  assert.ok(source.includes('state.settings.locale = locale'));
  assert.ok(source.includes('params.set("locale", state.settings.locale || locale)'));
  assert.ok(source.includes('new URLSearchParams({ q: query, locale: requestLocale })'));
  assert.ok(source.includes('document.documentElement.lang = locale'));
  assert.ok(source.includes('function setLocale(nextLocale)'));
  assert.ok(source.includes('languageToggle.addEventListener("click", () => setLocale'));
  assert.ok(source.includes('function tr(text)'));
  assert.ok(source.includes('text.textContent = tr(label)'));
  assert.ok(source.includes('function resetSettings()'));
  assert.ok(source.includes('state.settings = { ...DEFAULTS, locale }'));
  const about = fs.readFileSync(path.join(__dirname, "..", "about.js"), "utf8");
  assert.ok(about.includes('settings.locale === "en"'));
  assert.ok(about.includes('document.documentElement.lang = locale'));
});


test("About page body text uses the approved 20px font size in both locales", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "..", "about.html"), "utf8");
  assert.match(css, /\.event-summary, \.event-description\s*\{[^}]*font-size:\s*17px/);
  assert.match(css, /\.about-panel\s*\{[^}]*font-size:\s*20px/);
  assert.equal((html.match(/class="about-content" data-locale="/g) || []).length, 2);
  assert.match(css, /\.about-panel \.about-content\s*\{\s*text-align:\s*justify/);
  assert.match(css, /\.about-panel h1\s*\{[^}]*font-size:\s*24px/);
  assert.match(css, /\.about-panel \.about-content h2\s*\{[^}]*margin:\s*30px 0 10px;[^}]*font-size:\s*24px/);
});


test("About page donation values copy on click and the support heading matches the page heading style", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "about.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "..", "about.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.equal((html.match(/data-copy-value="UQCu1fb6WFRd1KdHt3SCbS0BhOYHrveCYZU97EJWLXDUPPIh"/g) || []).length, 2);
  assert.equal((html.match(/data-copy-value="4100116004998786"/g) || []).length, 2);
  assert.match(html, /id="copy-toast"[^>]*aria-live="polite"/);
  assert.match(js, /navigator\.clipboard\.writeText\(value\)/);
  assert.match(js, /Адрес скопирован\./);
  assert.match(js, /Номер ЮMoney скопирован\./);
  assert.match(css, /\.copy-value:hover[^}]*font-weight:\s*700/);
  assert.match(css, /\.copy-toast\s*\{[^}]*position:\s*fixed;[^}]*pointer-events:\s*none/);
  assert.match(js, /function positionCopyToast\(clientX, clientY\)/);
  assert.match(js, /document\.addEventListener\("pointermove"/);
  assert.match(js, /positionCopyToast\(event\.clientX, event\.clientY\)/);
  assert.match(js, /navigator\.clipboard\.writeText\(value\)/);
  assert.equal((html.match(/<p aria-hidden="true">&nbsp;<\/p>\s*<h2>(?:Поддержать Dharma Time|Support Dharma Time)<\/h2>/g) || []).length, 2);
  for (const locale of ["ru", "en"]) {
    const start = html.indexOf('data-locale="' + locale + '"');
    const end = html.indexOf("</div>", start);
    const section = html.slice(start, end);
    assert.equal((section.match(/class="copy-value"/g) || []).length, 2, locale + " has both copy controls");
    assert.equal((section.match(/data-copy-kind="address"/g) || []).length, 1, locale + " has address copy");
    assert.equal((section.match(/data-copy-kind="number"/g) || []).length, 1, locale + " has ЮMoney copy");
  }
});

test("Lotus logo is white only in dark theme", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(css, /:root\[data-theme="dark"\] \.brand-mark\s*\{\s*filter:\s*brightness\(0\) invert\(1\);\s*\}/);
});


test("About page applies the persisted theme and matching browser theme color", () => {
  const about = fs.readFileSync(path.join(__dirname, "..", "about.js"), "utf8");
  assert.match(about, /localStorage\.getItem\("dharma-time-theme-v1"\) === "dark" \? "dark" : "light"/);
  assert.match(about, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(about, /themeColor\.content = theme === "dark" \? "#171c19" : "#f6f2e9"/);
});


test("Calendar event and moon markers use the approved smaller sizes at widths up to 550px", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const start = css.indexOf("@media (max-width: 550px)");
  assert.ok(start >= 0, "550px responsive rules are present");
  const responsive = css.slice(start, css.indexOf("\n}", start) + 2);
  assert.match(responsive, /calendar-day\.has-regular-events::before \{ width: 34px; height: 34px; \}/);
  assert.match(responsive, /calendar-day\.is-moon-phase::before \{ font-size: 38px; \}/);
  assert.match(responsive, /calendar-day\.is-moon-phase::after \{ width: 38px; height: 38px; \}/);
  assert.ok(start > css.indexOf("@media (max-width: 420px)"), "550px rules override the older mobile sizes");
});


test("Moon phase emoji stays centered independently of its responsive font size", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(css, /\.calendar-day\.is-moon-phase::before \{[^}]*left: 50%;[^}]*display: flex; align-items: center; justify-content: center; width: 1\.2em; height: 1\.2em/);
  assert.match(css, /\.calendar-day\.is-moon-phase::before \{[^}]*transform: translate\(-50%, -50%\)/);
});

test("Calendar markers and date numbers shrink further at widths up to 500px", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const start = css.indexOf("@media (max-width: 500px)");
  assert.ok(start >= 0, "500px responsive rules are present");
  const responsive = css.slice(start, css.indexOf("\n}", start) + 2);
  assert.match(responsive, /\.calendar-day \{ font-size: 13px; \}/);
  assert.match(responsive, /calendar-day\.has-regular-events::before \{ width: 30px; height: 30px; \}/);
  assert.match(responsive, /calendar-day\.is-moon-phase::before \{ font-size: 34px; \}/);
  assert.match(responsive, /calendar-day\.is-moon-phase::after \{ width: 34px; height: 34px; \}/);
});


test("Calendar markers and date numbers shrink further at widths up to 380px", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const start = css.indexOf("@media (max-width: 380px)");
  assert.ok(start >= 0, "380px responsive rules are present");
  const responsive = css.slice(start, css.indexOf("\n}", start) + 2);
  assert.match(responsive, /\.calendar-day \{ font-size: 12px; \}/);
  assert.match(responsive, /calendar-day\.has-regular-events::before \{ width: 26px; height: 26px; \}/);
  assert.match(responsive, /calendar-day\.is-moon-phase::before \{ font-size: 30px; \}/);
  assert.match(responsive, /calendar-day\.is-moon-phase::after \{ width: 30px; height: 30px; \}/);
});


test("At widths up to 450px, brand is centered above the centered city picker", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const start = css.indexOf("@media (max-width: 450px)");
  assert.ok(start >= 0, "450px responsive rules are present");
  const responsive = css.slice(start, css.indexOf("\n}", start) + 2);
  assert.match(responsive, /\.site-header \{ flex-direction: column; align-items: center; gap: 15px; \}/);
  assert.match(responsive, /\.brand \{ justify-content: center; \}/);
  assert.match(responsive, /\.city-picker \{ margin-left: 0; justify-content: center; flex-wrap: nowrap; \}/);
  assert.match(responsive, /#city-search \{ text-align: left; \}/);
});


test("Brand text and logo keep their desktop sizes at every responsive width", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(css, /\.brand \{[^}]*font-size: 25px;/);
  assert.match(css, /\.brand-mark \{[^}]*width: 38px; height: 38px;/);
  const mobile = css.match(/@media \(max-width: 420px\) \{([\s\S]*?)\n\}/);
  assert.ok(mobile, "420px responsive rules are present");
  assert.doesNotMatch(mobile[1], /\.brand(?:-mark)?\s*\{[^}]*?(?:font-size|width|height)\s*:/);
});


test("Day details use the month response as the sole source of event identity and date assignment", () => {
  const start = source.indexOf("  function eventOccursOn(event, date) {");
  const end = source.indexOf("  function categoryForEvent(event) {", start);
  assert.ok(start >= 0 && end > start, "canonical day-event helpers are present");
  const helpers = new Function(
    "state", "dateKey", "parseDate",
    source.slice(start, end) + "; return { eventOccursOn, syncDayEventsFromMonth };"
  );
  const state = {
    selectedDate: new Date("2026-11-21T12:00:00Z"),
    monthEvents: [
      { id: "canonical-1", title: "Canonical title", display_dates: ["2026-11-21"], extra: { source: "month" } },
      { id: "canonical-2", title: "Other date", display_dates: ["2026-11-22"] },
      { id: "canonical-3", title: "Must not fall back to range", start_date: "2026-11-21", end_date: "2026-11-21", display_dates: [] }
    ],
    daySupplementaryEvents: [
      { id: "canonical-1", title: "Conflicting day title", display_dates: ["2026-11-21"], extra: { display_info_block: "Day-only supplementary text" } },
      { id: "day-only", title: "Must not be added as an event", display_dates: ["2026-11-21"] }
    ],
    dayEvents: []
  };
  const { syncDayEventsFromMonth } = helpers(
    state,
    date => date.toISOString().slice(0, 10),
    value => {
      if (!value) return null;
      const text = String(value).slice(0, 10);
      return text.length === 10 ? new Date(text + "T00:00:00Z") : null;
    }
  );
  syncDayEventsFromMonth();
  assert.deepEqual(state.dayEvents.map(event => event.id), ["canonical-1"]);
  assert.equal(state.dayEvents[0].title, "Canonical title");
  assert.equal(state.dayEvents[0].extra.source, "month");
  assert.equal(state.dayEvents[0].extra.display_info_block, "Day-only supplementary text");
});

test("Selecting a date in an adjacent calendar cell loads that date's month as the canonical event source", () => {
  assert.match(source, /const selectedMonth = new Date\(date\.getFullYear\(\), date\.getMonth\(\), 1\)/);
  assert.match(source, /if \(monthChanged\) loadCalendarData\(\);\s*else loadDayEvents\(\);/);
});


test("Month filtering honors display_dates even when the raw event interval overlaps the month", () => {
  const start = source.indexOf("  function eventsForMonth(events, month) {");
  const end = source.indexOf("  function eventOccursOn(event, date) {", start);
  assert.ok(start >= 0 && end > start, "month event filter is present");
  const getFilter = new Function(
    "parseDate",
    source.slice(start, end) + "; return eventsForMonth;"
  );
  const filter = getFilter(value => {
    if (!value) return null;
    const text = String(value).slice(0, 10);
    return text.length === 10 ? new Date(text + "T00:00:00Z") : null;
  });
  const events = [
    { id: "visible", display_dates: ["2026-11-21"], start_date: "2026-11-01", end_date: "2026-11-30" },
    { id: "not-assigned", display_dates: [], start_date: "2026-11-21", end_date: "2026-11-21" },
    { id: "legacy", start_date: "2026-11-21", end_date: "2026-11-21" }
  ];
  assert.deepEqual(
    filter(events, new Date(2026, 10, 1)).map(event => event.id),
    ["visible", "legacy"]
  );
});


test("Moon phase tooltip labels come from the canonical event title and respect display_dates", () => {
  assert.match(source, /label: String\(event\.title \|\| phaseDefinition\.label\)/);
  assert.match(source, /const phaseDates = Array\.isArray\(event\.display_dates\) \? event\.display_dates : \[event\.start_date \|\| event\.start\]/);
});


test("City search runs immediately on Enter, selects a visible result, and uses a short debounce plus bounded cache", () => {
  const start = source.indexOf("    const resultsCache = new Map();", source.indexOf("  function setupCityPicker() {"));
  const end = source.indexOf('    document.addEventListener("click", event => { if (!event.target.closest(".city-picker")) closeResults(); });', start);
  assert.ok(start >= 0 && end > start, "city search handlers are present");
  const cityPicker = source.slice(start, end);
  assert.match(cityPicker, /const resultsCache = new Map\(\)/);
  assert.match(cityPicker, /resultsCache\.size > 30/);
  assert.match(cityPicker, /\}, 120\)/);
  assert.match(cityPicker, /event\.key !== "Enter"/);
  assert.match(cityPicker, /event\.preventDefault\(\)/);
  assert.match(cityPicker, /clearTimeout\(searchTimer\)[\s\S]*runCitySearch\(query\)/);
  assert.match(cityPicker, /firstResult\.click\(\)/);
});


test("About page city picker also supports immediate Enter search and bounded result caching", () => {
  const aboutSource = fs.readFileSync(path.join(__dirname, "..", "about.js"), "utf8");
  assert.match(aboutSource, /const resultsCache = new Map\(\)/);
  assert.match(aboutSource, /resultsCache\.size > 30/);
  assert.match(aboutSource, /\}, 120\)/);
  assert.match(aboutSource, /event\.key !== "Enter"/);
  assert.match(aboutSource, /event\.preventDefault\(\)/);
  assert.match(aboutSource, /firstResult\.click\(\)/);
});
