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

test("All event titles, including Ekadashi, use uppercase formatting", () => {
  assert.match(source, /eventTitle\.toLocaleUpperCase\(locale\)/);
  assert.doesNotMatch(source, /preserveTitleCase/);
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
