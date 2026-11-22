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
  assert.match(monthLoader, /catch \(error\) \{\s*if \(requestId !== state\.monthRequestId \|\| error\.name === "AbortError"\) return;\s*calendarStatus\.textContent/);
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

test("Calendar month/day API responses use a five-minute session cache keyed by full request URL", () => {
  assert.match(source, /const API_CACHE_PREFIX = "dharma-time-api-cache-v1:"/);
  assert.match(source, /const API_CACHE_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(source, /function readApiCache\(url\)/);
  assert.match(source, /function writeApiCache\(url, payload\)/);
  assert.match(source, /API_CACHE_PREFIX \+ url/);
  assert.match(source, /entry\.expiresAt <= Date\.now\(\)/);
  assert.match(source, /if \(cached && cached\.hit\) return cached\.payload/);
  assert.match(source, /if \(response\.ok\) \{\s*const payload = await response\.json\(\);\s*writeApiCache\(url, payload\);\s*return payload;/);
  assert.match(source, /url\.includes\("\/api\/calendar\/month\?"\).*url\.includes\("\/api\/calendar\/day\?"/s);
  assert.match(source, /catch \(_\) \{\s*\/\/ Caching is optional; the calendar must work when sessionStorage is unavailable or full\./);
});

test("Calendar cache returns valid entries, separates request URLs, expires entries, and tolerates storage errors", () => {
  const start = source.indexOf("  function readApiCache(url) {");
  const end = source.indexOf("  async function fetchJson(url, signal) {", start);
  assert.ok(start >= 0 && end > start, "cache helpers are present");
  let now = 1000;
  const values = new Map();
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const helpers = new Function("sessionStorage", "API_CACHE_PREFIX", "API_CACHE_TTL_MS", "Date",
    source.slice(start, end) + "; return { readApiCache, writeApiCache };"
  )(storage, "test-cache:", 300000, { now: () => now });
  const monthUrl = "https://example.test/api/calendar/month?modules=moon&month=11";
  const otherMonthUrl = "https://example.test/api/calendar/month?modules=moon&month=12";
  const payload = { events: [{ id: "moon-1" }] };
  helpers.writeApiCache(monthUrl, payload);
  assert.deepEqual(helpers.readApiCache(monthUrl), { hit: true, payload });
  assert.equal(helpers.readApiCache(otherMonthUrl), null);
  now += 300001;
  assert.equal(helpers.readApiCache(monthUrl), null);
  assert.equal(values.size, 0);

  const brokenStorage = {
    getItem() { throw new Error("storage unavailable"); },
    setItem() { throw new Error("storage unavailable"); },
    removeItem() { throw new Error("storage unavailable"); }
  };
  const safeHelpers = new Function("sessionStorage", "API_CACHE_PREFIX", "API_CACHE_TTL_MS", "Date",
    source.slice(start, end) + "; return { readApiCache, writeApiCache };"
  )(brokenStorage, "test-cache:", 300000, { now: () => now });
  assert.equal(safeHelpers.readApiCache(monthUrl), null);
  assert.doesNotThrow(() => safeHelpers.writeApiCache(monthUrl, payload));
});


test("Language switch waits for in-flight calendar requests before reloading in the new locale", () => {
  assert.match(source, /apiRequestsInFlight: 0/);
  assert.match(source, /apiIdleWaiters: \[\]/);
  assert.match(source, /function waitForApiIdle\(\)/);
  assert.match(source, /function reloadLocaleEvents\(requestedLocale\)/);
  assert.match(source, /loadMonthEvents\(\)\.finally\(\(\) => \{/);
  assert.match(source, /if \(locale === requestedLocale && getSelectedModules\(\)\.length\) loadDayEvents\(\)/);
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
  assert.ok(source.includes('new URLSearchParams({ q: query, locale: state.settings.locale || locale })'));
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
