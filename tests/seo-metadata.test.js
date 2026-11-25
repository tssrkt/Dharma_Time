const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const pages = [
  { file: "index.html", url: "https://tssrkt.github.io/Dharma_Time/", title: /Dharma Time — астрономический и духовный календарь/, description: /календарь астрономических явлений, лунных циклов и дат духовных традиций/i },
  { file: "about.html", url: "https://tssrkt.github.io/Dharma_Time/about.html", title: /О проекте Dharma Time — описание календаря/, description: /назначение календаря.*духовных традиций.*ограничения информационных материалов/i }
];

test("Each public page has a unique descriptive title and meta description", () => {
  const titles = [];
  const descriptions = [];
  for (const page of pages) {
    const html = read(page.file);
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1];
    assert.ok(title, page.file + " has a title");
    assert.ok(description, page.file + " has a description");
    assert.match(title, page.title);
    assert.match(description, page.description);
    titles.push(title);
    descriptions.push(description);
  }
  assert.notEqual(titles[0], titles[1]);
  assert.notEqual(descriptions[0], descriptions[1]);
});

test("Canonical URLs match public URLs without inventing language URLs", () => {
  for (const page of pages) {
    const html = read(page.file);
    assert.ok(html.includes('<link rel="canonical" href="' + page.url + '">'));
    assert.doesNotMatch(html, /rel="alternate"\s+hreflang=/i);
  }
});

test("Both pages define Open Graph and Twitter preview metadata", () => {
  for (const page of pages) {
    const html = read(page.file);
    assert.match(html, /<meta\s+property="og:type"\s+content="website"/i);
    assert.match(html, /<meta\s+property="og:title"\s+content="[^"]+"/i);
    assert.match(html, /<meta\s+property="og:description"\s+content="[^"]+"/i);
    assert.ok(html.includes('<meta property="og:url" content="' + page.url + '">'));
    assert.match(html, /<meta\s+property="og:image"\s+content="https:\/\/tssrkt\.github\.io\/Dharma_Time\/img\/lotus\.png"/i);
    assert.match(html, /<meta\s+name="twitter:card"\s+content="summary"/i);
    assert.match(html, /<meta\s+name="twitter:title"\s+content="[^"]+"/i);
    assert.match(html, /<meta\s+name="twitter:description"\s+content="[^"]+"/i);
  }
});

test("Home SEO metadata and social locale follow RU/EN interface", () => {
  const js = read("app.js");
  assert.match(js, /document\.documentElement\.lang = locale/);
  assert.match(js, /Dharma Time — Astronomy and Spiritual Calendar/);
  assert.match(js, /Explore astronomical events, lunar cycles, and dates from spiritual traditions/);
  assert.match(js, /setSeoMeta\('meta\[property="og:title"\]', seoTitle\)/);
  assert.match(js, /setSeoMeta\('meta\[property="og:description"\]', seoDescription\)/);
  assert.match(js, /locale === "en" \? "en_US" : "ru_RU"/);
});

test("About SEO metadata and social locale follow stored RU/EN interface", () => {
  const js = read("about.js");
  assert.match(js, /document\.documentElement\.lang = locale/);
  assert.match(js, /About Dharma Time — Calendar and Traditions/);
  assert.match(js, /Learn about Dharma Time, how dates from different spiritual traditions are presented/);
  assert.match(js, /setSeoMeta\('meta\[property="og:title"\]', seoTitle\)/);
  assert.match(js, /setSeoMeta\('meta\[property="og:description"\]', seoDescription\)/);
  assert.match(js, /locale === "en" \? "en_US" : "ru_RU"/);
});
