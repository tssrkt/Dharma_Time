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

test("All event titles, including Ekadashi, use uppercase formatting", () => {
  assert.match(source, /eventTitle\.toLocaleUpperCase\(locale\)/);
  assert.doesNotMatch(source, /preserveTitleCase/);
});

test("Calendar loading status is out of flow and error text uses a single line break", () => {
  assert.ok(source.includes('return "Не удалось загрузить календарь.\\nПроверьте подключение и попробуйте позже."'));
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
  assert.match(source, /button\.textContent = isDark \? "LIGHT THEME" : "DARK THEME"/);
  assert.match(css, /:root\[data-theme="dark"\]\s*\{[^}]*color-scheme: dark;/s);
  assert.match(css, /:root\[data-theme="dark"\] \.event-card/);
  assert.match(css, /:root\[data-theme="dark"\] \.day-menu/);
});
