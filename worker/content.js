// Лікарі, відгуки і статті зі знімка ІС – фрагменти HTML сторінок.
// Розмітка – та сама, що в шаблонах likari/zrazok/, statti/zrazok/,
// likari/, vidhuky/, statti/ і в блоці відгуків сторінки центру: шаблони
// лишаються зразком вигляду, дані підставляє воркер.
// Контракт даних – claude/sait-kontent-z-is.md у проєкті.

import { esc, priceCategories } from './render.js';

const SITE = 'https://mrtplus.ua';

const CITY = {
  kyiv: 'Київ', zhytomyr: 'Житомир', rivne: 'Рівне',
  lutsk: 'Луцьк', kovel: 'Ковель', sheptytskyi: 'Шептицький',
};

const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];

const CATEGORY = { highest: 'Вища', first: 'Перша', second: 'Друга' };

const SOURCE = {
  google: 'Відгук з Google Карт',
  facebook: 'Відгук з Facebook',
  instagram: 'Відгук з Instagram',
  other: 'Відгук пацієнта',
};

const ENTRY_BLOCKS = [
  ['education', 'Освіта'],
  ['experience', 'Досвід роботи'],
  ['internship', 'Стажування'],
  ['training', 'Підвищення кваліфікації, наукова та освітня діяльність'],
  ['membership', 'Членство'],
];

// ---------- дрібниці ----------

// 1 рік, 2 роки, 5 років, 21 рік, 112 років
export function years(n) {
  const a = n % 10;
  const b = n % 100;
  const w = a === 1 && b !== 11 ? 'рік' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'роки' : 'років';
  return `${n}&#160;${w}`;
}

export function practiceYears(d, now = new Date()) {
  if (!Number.isInteger(d.practiceSince)) return null;
  const n = now.getUTCFullYear() - d.practiceSince;
  return n >= 1 ? n : null;
}

export function fullName(d) {
  return [d.lastName, d.firstName, d.middleName].filter(Boolean).join(' ');
}

// «Коваленко О. В.»
function shortName(d) {
  const i = [d.firstName, d.middleName].filter(Boolean).map((s) => `${esc(s[0])}.`).join('&#160;');
  return i ? `${esc(d.lastName)} ${i}` : esc(d.lastName);
}

function lowerFirst(s) {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

function initials(d) {
  return ((d.lastName || '')[0] || '') + ((d.firstName || '')[0] || '');
}

// "2026-08-01" → «серпень 2026»
export function monthYear(iso) {
  const [y, m] = String(iso).split('-').map(Number);
  return m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${y}` : '';
}

// "2026-09-15" → «15.09.2026»
export function dateDots(iso) {
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
}

function cities(slugs) {
  return slugs.filter((s) => CITY[s]).map((s) => CITY[s]);
}

// ---------- лікарі ----------

function doctorPhoto(d, cls, sizes, eager) {
  if (!d.photo || !d.photo.large) {
    return `<span class="ph ph--portrait ph--initials" aria-hidden="true">${esc(initials(d))}</span>`;
  }
  const srcset = d.photo.small ? ` srcset="${esc(d.photo.small)} 400w, ${esc(d.photo.large)} 800w" sizes="${sizes}"` : '';
  return `<img class="${cls}" src="${esc(d.photo.large)}"${srcset} width="800" height="1000" alt="${esc(fullName(d))}"${eager ? '' : ' loading="lazy"'}>`;
}

export function doctorCardHtml(d) {
  const n = practiceYears(d);
  const meta = [n ? `Стаж ${years(n)}` : null, cities(d.centers).join(', ') || null].filter(Boolean).join(' · ');
  return `<li data-city="${esc(d.centers.join(' '))}"><a class="doc-card" href="/likari/${esc(d.slug)}/">`
    + doctorPhoto(d, 'doc-card__photo', '(max-width: 47.99em) 50vw, (max-width: 63.99em) 33vw, 18rem', false)
    + `<h3 class="doc-card__name">${esc(fullName(d))}</h3>`
    + `<p class="doc-card__role">${esc(d.position || 'Лікар-рентгенолог')}</p>`
    + (meta ? `<p class="doc-card__meta">${meta}</p>` : '')
    + `</a></li>`;
}

export function doctorListHtml(snap) {
  const list = (snap && snap.doctors) || [];
  if (!list.length) return null;
  return list.map(doctorCardHtml).join('');
}

// Категорія «Що описує» → адреса на сторінці цін першого центру лікаря,
// у прайсі якого вона є.
function categoryLinks(snap, d) {
  const byId = new Map((snap.categories || []).map((c) => [c.id, c]));
  const anchors = new Map(); // slug центру → Map(id категорії → якір)
  const anchorFor = (slug) => {
    if (!anchors.has(slug)) {
      anchors.set(slug, new Map(priceCategories(snap, slug).map((c) => [c.catId, c.id])));
    }
    return anchors.get(slug);
  };
  return (d.categories || []).map((id) => {
    const cat = byId.get(id);
    if (!cat) return null;
    const slug = d.centers.find((s) => anchorFor(s).has(id));
    return slug
      ? `<li><a class="chip" href="/${slug}/tsiny/#${anchorFor(slug).get(id)}">${esc(cat.name)}</a></li>`
      : `<li><span class="chip">${esc(cat.name)}</span></li>`;
  }).filter(Boolean).join('');
}

function entryHtml(e) {
  let when = '';
  if (Number.isInteger(e.yearFrom) && Number.isInteger(e.yearTo)) {
    when = e.yearFrom === e.yearTo ? `${e.yearFrom}` : `${e.yearFrom}–${e.yearTo}`;
  } else if (Number.isInteger(e.yearFrom)) {
    when = `з ${e.yearFrom}`;
  } else if (Number.isInteger(e.yearTo)) {
    when = `${e.yearTo}`;
  }
  return `<li><time>${when}</time><div><b>${esc(e.title)}</b>${e.detail ? `<span>${esc(e.detail)}</span>` : ''}</div></li>`;
}

function reviewHtml(r) {
  return `<figure class="rev" data-city="${esc(r.center)}">`
    + `<figcaption class="rev__head"><span class="rev__name">${esc(r.authorName)}</span><span class="rev__date">${monthYear(r.publishedOn)}</span></figcaption>`
    + `<blockquote>${esc(r.text)}</blockquote>`
    + `<p class="rev__foot"><span>${esc(CITY[r.center] || '')}</span><span>${SOURCE[r.source] || SOURCE.other}</span></p>`
    + `</figure>`;
}

// Секції під першим екраном чергуються: звичайна площина – блакитна.
function sections(list) {
  return list.filter(Boolean).map((inner, i) =>
    `<section class="pk-sec${i % 2 ? ' pk-sec--band' : ''}"><div class="container${inner.cls ? ` ${inner.cls}` : ''}">${inner.html}</div></section>`).join('');
}

const CTA = `<section class="pk-sec pk-sec--tight" id="zapys"><div class="container"><div class="pk-cta"><div>`
  + `<p class="pk-cta__lead">Турбота починається з точного діагнозу</p>`
  + `<h2>Потрібен запис на обстеження?</h2>`
  + `<p>Залиште заявку – ми підберемо зручний час і відповімо на всі питання.</p>`
  + `</div><a class="btn btn-primary btn-lg phone" href="tel:0800311058">0&#160;800&#160;311&#160;058</a></div></div></section>`;

export function doctorPage(snap, slug) {
  const d = (snap.doctors || []).find((x) => x.slug === slug);
  if (!d) return null;
  const name = fullName(d);
  const n = practiceYears(d);
  const facts = [
    n ? `<li><b>${years(n)}</b><span>стаж</span></li>` : null,
    CATEGORY[d.qualificationCategory] ? `<li><b>${CATEGORY[d.qualificationCategory]}</b><span>кваліфікаційна категорія</span></li>` : null,
    d.centers.length
      ? `<li><b>${d.centers.filter((s) => CITY[s]).map((s) => `<a href="/${s}/">${CITY[s]}</a>`).join(', ')}</b><span>${d.centers.length > 1 ? 'центри' : 'центр'}</span></li>`
      : null,
  ].filter(Boolean).join('');

  const hero = `<section class="pk-sec zm-head"><div class="container">`
    + `<ol class="crumbs"><li><a href="/">Головна</a></li><li><a href="/likari/">Лікарі</a></li><li>${esc(name)}</li></ol>`
    + `<div class="doc-hero">`
    + doctorPhoto(d, 'doc-hero__photo', '(max-width: 47.99em) 20rem, 40vw', true)
    + `<div><h1>${esc(name)}</h1>`
    + `<p class="doc-hero__role">${esc(d.position || 'Лікар-рентгенолог')}</p>`
    + (facts ? `<ul class="doc-facts">${facts}</ul>` : '')
    + (d.specialization ? `<p class="doc-hero__bio">${esc(d.specialization)}</p>` : '')
    + `</div></div></div></section>`;

  const blocks = ENTRY_BLOCKS
    .map(([key, title]) => {
      const list = (d.entries && d.entries[key]) || [];
      return list.length ? `<div><h2>${title}</h2><ol class="doc-time">${list.map(entryHtml).join('')}</ol></div>` : '';
    })
    .filter(Boolean).join('');

  const chips = categoryLinks(snap, d);
  const reviews = (snap.reviews || []).filter((r) => r.doctor === d.slug);
  const articles = (snap.articles || []).filter((a) => a.author === d.slug);
  const others = otherDoctors(snap, d, 4);

  const body = sections([
    blocks ? { html: `<div class="doc-cols">${blocks}</div>` } : null,
    chips ? { html: `<h2>Що <em>описує</em></h2><ul class="chip-row">${chips}</ul>` } : null,
    reviews.length ? { html: `<h2>Відгуки <em>пацієнтів</em></h2><div class="rev-grid">${reviews.map(reviewHtml).join('')}</div>` } : null,
    articles.length ? { cls: 'zm-related', html: `<h2>Статті <em>лікаря</em></h2><ul class="art-grid">${articles.map((a) => articleCardHtml(snap, a)).join('')}</ul>` } : null,
    others.length ? { cls: 'zm-related', html: `<h2>Інші <em>лікарі</em></h2><ul class="doc-grid">${others.map(doctorCardHtml).join('')}</ul>` } : null,
  ]);

  const role = lowerFirst(d.position || 'Лікар-рентгенолог');
  return {
    title: `${name}, ${role} – МРТ ПЛЮС`,
    description: `${name}, ${role} МРТ ПЛЮС${d.centers.length ? ` (${cities(d.centers).join(', ')})` : ''}: освіта, досвід${reviews.length ? ', відгуки пацієнтів' : ''}.`,
    main: hero + body + CTA,
  };
}

// Спершу колеги зі спільних центрів, далі решта – у порядку знімка.
function otherDoctors(snap, d, max) {
  const rest = (snap.doctors || []).filter((x) => x.slug !== d.slug);
  const near = rest.filter((x) => x.centers.some((s) => d.centers.includes(s)));
  const far = rest.filter((x) => !near.includes(x));
  return near.concat(far).slice(0, max);
}

// ---------- відгуки ----------

export function reviewListHtml(snap) {
  const list = (snap && snap.reviews) || [];
  if (!list.length) return null;
  return list.map(reviewHtml).join('');
}

// Блок «Що кажуть після обстеження» на сторінці центру: до трьох
// останніх відгуків центру. Немає – null, секція знімається.
export function centerVoicesHtml(snap, slug, max = 3) {
  const list = ((snap && snap.reviews) || []).filter((r) => r.center === slug).slice(0, max);
  if (!list.length) return null;
  return list.map((r) => `<figure class="voice"><blockquote>${esc(r.text)}</blockquote>`
    + `<figcaption>${esc(r.authorName)}, ${monthYear(r.publishedOn)}</figcaption></figure>`).join('');
}

// ---------- статті ----------

function coverImg(cover, cls, sizes, eager) {
  if (!cover || !cover.large) return '';
  const srcset = cover.medium ? ` srcset="${esc(cover.medium)} 800w, ${esc(cover.large)} ${Number(cover.width) || 1600}w" sizes="${sizes}"` : '';
  const wh = cover.width && cover.height ? ` width="${Number(cover.width)}" height="${Number(cover.height)}"` : '';
  return `<img class="${cls}" src="${esc(cover.large)}"${srcset}${wh} alt="${esc(cover.alt || '')}"${eager ? '' : ' loading="lazy"'}>`;
}

function authorOf(snap, a) {
  return a.author ? (snap.doctors || []).find((d) => d.slug === a.author) || null : null;
}

export function articleCardHtml(snap, a) {
  const d = authorOf(snap, a);
  return `<li><a class="art-card" href="/statti/${esc(a.slug)}/">`
    + `<span class="art-card__cover">${coverImg(a.cover, 'art-card__img', '(max-width: 47.99em) 100vw, (max-width: 63.99em) 50vw, 24rem', false)}</span>`
    + `<time class="art-card__date" datetime="${esc(a.publishedOn)}">${dateDots(a.publishedOn)}</time>`
    + `<h2 class="art-card__title">${esc(a.title)}</h2>`
    + (a.description ? `<p class="art-card__text">${esc(a.description)}</p>` : '')
    + (d ? `<p class="art-card__author">${shortName(d)}, ${esc(lowerFirst(d.position || 'Лікар-рентгенолог'))}</p>` : '')
    + `</a></li>`;
}

export function articleListHtml(snap) {
  const list = (snap && snap.articles) || [];
  if (!list.length) return null;
  return list.map((a) => articleCardHtml(snap, a)).join('');
}

// Інші статті: спершу зі спільними категоріями, далі новіші.
function relatedArticles(snap, a, max) {
  const cats = new Set(a.categories || []);
  const rest = (snap.articles || []).filter((x) => x.slug !== a.slug);
  const near = rest.filter((x) => (x.categories || []).some((c) => cats.has(c)));
  const far = rest.filter((x) => !near.includes(x));
  return near.concat(far).slice(0, max);
}

// art – повна стаття з /api/v1/public/articles/<slug> (html уже безпечний).
export function articlePage(snap, art) {
  const d = authorOf(snap, art);
  const updated = art.updatedOn ? ` · Оновлено <time datetime="${esc(art.updatedOn)}">${dateDots(art.updatedOn)}</time>` : '';
  const author = d
    ? `<a class="art__author" href="/likari/${esc(d.slug)}/">`
      + (d.photo && d.photo.small
        ? `<img class="art__author-photo" src="${esc(d.photo.small)}" width="400" height="500" alt="" loading="lazy">`
        : `<span class="ph ph--initials" aria-hidden="true">${esc(initials(d))}</span>`)
      + `<span><b>${esc(fullName(d))}</b><span>${esc(d.position || 'Лікар-рентгенолог')}, автор статті</span></span></a>`
    : '';
  const cover = `<figure class="art-hero__cover">${coverImg(art.cover, 'art-hero__img', '(max-width: 47.99em) 100vw, 40vw', true)}</figure>`;

  // Перший екран – як у лікаря: обкладинка 4:5 ліворуч, заголовок,
  // дата, автор і вступ праворуч; текст – під ним.
  const head = `<section class="pk-sec"><div class="container">`
    + `<ol class="crumbs"><li><a href="/">Головна</a></li><li><a href="/statti/">Статті</a></li><li>${esc(art.title)}</li></ol>`
    + `<div class="art-hero">`
    + cover
    + `<div><h1>${esc(art.title)}</h1>`
    + `<p class="art__meta"><time datetime="${esc(art.publishedOn)}">${dateDots(art.publishedOn)}</time>${updated}</p>`
    + author
    + (art.lead ? `<p class="lead">${esc(art.lead)}</p>` : '')
    + `</div></div>`
    + `<article class="art"><div class="prose">${art.html || ''}</div></article>`
    + `</div></section>`;

  const related = relatedArticles(snap, art, 3);
  const tail = related.length
    ? `<section class="pk-sec pk-sec--band"><div class="container zm-related"><h2>Інші <em>статті</em></h2><ul class="art-grid">${related.map((x) => articleCardHtml(snap, x)).join('')}</ul></div></section>`
    : '';

  return {
    title: `${art.seoTitle || art.title} | МРТ ПЛЮС`,
    description: art.description || '',
    main: head + tail + CTA,
    jsonLd: articleJsonLd(art, d),
  };
}

function articleJsonLd(art, d) {
  const url = `${SITE}/statti/${art.slug}/`;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    '@id': url,
    url,
    headline: art.title,
    name: art.title,
    description: art.description || undefined,
    inLanguage: 'uk',
    image: art.cover && art.cover.large ? art.cover.large : undefined,
    datePublished: art.publishedOn,
    dateModified: art.updatedOn || art.publishedOn,
    author: d ? {
      '@type': 'Person',
      name: fullName(d),
      jobTitle: d.position || 'Лікар-рентгенолог',
      url: `${SITE}/likari/${d.slug}/`,
      image: d.photo && d.photo.large ? d.photo.large : undefined,
    } : undefined,
    publisher: {
      '@type': 'MedicalOrganization',
      name: 'МРТ ПЛЮС',
      url: `${SITE}/`,
      logo: `${SITE}/assets/img/icon-512.png`,
    },
  };
  // «<» у JSON усередині <script> не лишаємо: текст не може закрити тег.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// ---------- sitemap.xml ----------

const STATIC_PAGES = [
  '/', '/kontakty/', '/pidhotovka-mrt/', '/pidhotovka-kt/', '/likari/', '/vidhuky/', '/statti/',
  ...Object.keys(CITY).flatMap((s) => [`/${s}/`, `/${s}/tsiny/`]),
];

export function sitemapXml(snap) {
  const urls = STATIC_PAGES.map((p) => ({ loc: p, lastmod: null }));
  for (const d of (snap && snap.doctors) || []) urls.push({ loc: `/likari/${d.slug}/`, lastmod: d.updatedAt });
  for (const a of (snap && snap.articles) || []) urls.push({ loc: `/statti/${a.slug}/`, lastmod: a.updatedAt });
  const body = urls.map((u) => `  <url><loc>${SITE}${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(String(u.lastmod).slice(0, 10))}</lastmod>` : ''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
