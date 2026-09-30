// Воркер сайту МРТ ПЛЮС.
//
// Статику (сторінки, стилі, фото) віддає Cloudflare напряму, код сюди не
// потрапляє. Воркер запускається лише на /api/*, на сторінках з даними з ІС
// (див. run_worker_first у wrangler.jsonc) і за розкладом раз на годину.
//
// Приймач довідників з ІС (план ІС, розділ 4.3):
//   POST /api/is-sync – сигнал від ІС «є нова версія довідників».
//     Тіло {"version","changedAt"}, заголовки X-MRT-Timestamp і
//     X-MRT-Signature = hex(HMAC-SHA256(SITE_WEBHOOK_SECRET, "<ts>.<тіло>")).
//     Перевіряємо підпис, забираємо знімок з ІС, кладемо в KV і лише тоді
//     відповідаємо 200: «надіслана версія» в ІС = версія на сайті.
//   GET /api/is-sync – службовий стан: яка версія довідників збережена.
//   Щогодини – страховка: якщо кнопку в ІС забули, воркер сам питає версію.
//
// Підстановка даних у сторінки (план ІС, 4.3, п. 5): на сторінках центрів
// і контактів графіки, плашка «Зараз працює» і характеристики апаратів,
// на сторінках цін (/<місто>/tsiny/) – увесь прайс центру беруться зі
// знімка в KV. Місця позначені в HTML атрибутами data-is-*.
// Знімка немає або він зламаний – сторінка йде як є, із зашитими даними.
//
// Лікарі, відгуки і статті (контракт – claude/sait-kontent-z-is.md):
//   /likari/, /vidhuky/, /statti/ – списки зі знімка замість запасного
//     тексту «Список оновлюється» (атрибут data-is-list);
//   /likari/<slug>/, /statti/<slug>/ – сторінки, зібрані на шаблонах
//     likari/zrazok/ і statti/zrazok/ (самі шаблони віддають 404);
//   сторінки центрів – відгуки центру в секції data-is-reviews (без
//     відгуків секція лишається прихованою);
//   /sitemap.xml – постійні сторінки + лікарі й статті зі знімка.
// Тексти статей у знімку немає: воркер забирає їх окремо
// (/api/v1/public/articles/<slug>) і кладе в KV під article:<slug>.
//
// Доступу до бази ІС у сайту немає: лише публічний API.

import { hoursSetHtml, badgeHours, machineFields, priceListHtml } from './render.js';
import {
  doctorListHtml, doctorPage, reviewListHtml, centerVoicesHtml,
  articleListHtml, articlePage, sitemapXml,
} from './content.js';

const KEY_SNAPSHOT = 'snapshot';   // повний знімок довідників (JSON-текст)
const KEY_META = 'meta';           // {version, changedAt, savedAt, source}
const MAX_AGE_SEC = 300;           // сигнал, старший за 5 хвилин, відкидаємо
const MAX_BODY = 2048;             // тіло сигналу – кілька байтів
const IS_TIMEOUT_MS = 15000;
const MEMO_MS = 60000;             // знімок у пам'яті воркера – хвилину
const ARTICLE_PREFIX = 'article:'; // повний текст статті (JSON), metadata {updatedAt}
const ARTICLES_PER_RUN = 40;       // скільки текстів забирати за один прогін

// Сторінки з даними з ІС. Той самий список – у run_worker_first (wrangler.jsonc).
const DATA_PAGES = /^\/(?:(?:kyiv|zhytomyr|rivne|lutsk|kovel|sheptytskyi)\/(?:tsiny\/)?|kontakty\/|likari\/|vidhuky\/|statti\/)$/;
const DOCTOR = /^\/likari\/([a-z0-9-]+)(\/?)$/;
const ARTICLE = /^\/statti\/([a-z0-9-]+)(\/?)$/;
const TEMPLATE_DOCTOR = '/likari/zrazok/';
const TEMPLATE_ARTICLE = '/statti/zrazok/';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/is-sync') {
      if (request.method === 'POST') return receiveSignal(request, env);
      if (request.method === 'GET') return syncStatus(env);
      return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, POST' });
    }
    if (url.pathname === '/sitemap.xml') return sitemap(env);

    const doc = url.pathname.match(DOCTOR);
    if (doc && doc[1] !== 'zrazok') return doctorRoute(request, env, url, doc);
    const art = url.pathname.match(ARTICLE);
    if (art && art[1] !== 'zrazok') return articleRoute(request, env, url, art);
    // Шаблони – не сторінки сайту.
    if (url.pathname.startsWith(TEMPLATE_DOCTOR) || url.pathname.startsWith(TEMPLATE_ARTICLE)) {
      return errorPage(request, env, 404);
    }

    const res = await env.ASSETS.fetch(request);
    if (DATA_PAGES.test(url.pathname)) return withIsData(res, env);
    return res;
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(hourlyCheck(env));
  },
};

// ---------- сигнал від ІС ----------

async function receiveSignal(request, env) {
  if (!env.SITE_WEBHOOK_SECRET) return json({ error: 'secret_not_configured' }, 503);

  const ts = request.headers.get('X-MRT-Timestamp') || '';
  const sig = (request.headers.get('X-MRT-Signature') || '').toLowerCase();
  if (!/^\d{9,11}$/.test(ts) || !/^[0-9a-f]{64}$/.test(sig)) {
    return json({ error: 'bad_signature' }, 401);
  }
  const age = Math.floor(Date.now() / 1000) - Number(ts);
  if (Math.abs(age) > MAX_AGE_SEC) return json({ error: 'stale_timestamp' }, 401);

  const body = await request.text();
  if (body.length > MAX_BODY) return json({ error: 'body_too_large' }, 413);

  const expected = await hmacHex(env.SITE_WEBHOOK_SECRET, `${ts}.${body}`);
  if (!safeEqual(expected, sig)) return json({ error: 'bad_signature' }, 401);

  let signal;
  try { signal = JSON.parse(body); } catch { return json({ error: 'bad_body' }, 400); }
  const version = Number(signal.version);
  if (!Number.isInteger(version) || version < 1) return json({ error: 'bad_version' }, 400);

  const meta = await env.DOVIDNYKY.get(KEY_META, 'json');
  if (meta && meta.version >= version) {
    return json({ status: 'up_to_date', version: meta.version });
  }

  try {
    const saved = await pullSnapshot(env, version, 'signal');
    return json({ status: 'saved', version: saved.version });
  } catch (err) {
    // Не 200: ІС покаже причину червоним і лишить плашку.
    return json({ error: 'snapshot_failed', reason: String(err.message || err) }, 502);
  }
}

// ---------- страховка щогодини ----------

async function hourlyCheck(env) {
  const meta = await env.DOVIDNYKY.get(KEY_META, 'json');
  const headers = { Accept: 'application/json' };
  if (meta) headers['If-None-Match'] = `"v${meta.version}"`;

  const res = await isFetch(env, '/api/v1/public/version', headers);
  let fresh = false;
  if (res.status !== 304) {
    if (!res.ok) throw new Error(`version: HTTP ${res.status}`);
    const { version } = await res.json();
    if (!Number.isInteger(version)) throw new Error('version: bad body');
    if (!meta || meta.version < version) {
      await pullSnapshot(env, version, 'hourly');
      fresh = true;
    }
  }
  // Тексти статей, які не встигли забрати при синхронізації, – дозабрати.
  if (!fresh && meta) {
    const snap = await env.DOVIDNYKY.get(KEY_SNAPSHOT, 'json');
    if (snap) await syncArticles(env, snap, false);
  }
}

// ---------- знімок ----------

async function pullSnapshot(env, minVersion, source) {
  const res = await isFetch(env, '/api/v1/public/snapshot', { Accept: 'application/json' });
  if (!res.ok) throw new Error(`snapshot: HTTP ${res.status}`);
  const text = await res.text();

  let snap;
  try { snap = JSON.parse(text); } catch { throw new Error('snapshot: not JSON'); }
  if (!Number.isInteger(snap.version) || snap.version < minVersion) {
    throw new Error(`snapshot: version ${snap.version} < ${minVersion}`);
  }
  if (!Array.isArray(snap.centers) || !Array.isArray(snap.categories) || snap.centers.length === 0) {
    throw new Error('snapshot: missing centers or categories');
  }

  // Тексти статей – до знімка: сторінка статті зі знімка вже не шукатиме
  // текст в ІС. Помилка тут – як помилка знімка: ІС покаже її червоним.
  await syncArticles(env, snap, true);

  // Спершу дані, потім мітка версії: якщо запис перерветься посередині,
  // мітка лишиться старою і наступна спроба повторить завантаження.
  await env.DOVIDNYKY.put(KEY_SNAPSHOT, text);
  const meta = {
    version: snap.version,
    changedAt: snap.changedAt || null,
    savedAt: new Date().toISOString(),
    source,
  };
  await env.DOVIDNYKY.put(KEY_META, JSON.stringify(meta));
  return meta;
}

// Тексти статей у KV: змінені (за updatedAt) – забрати, зняті й
// видалені – прибрати. За прогін – не більше ARTICLES_PER_RUN запитів;
// решту дозабере щогодинна перевірка або сама сторінка статті.
async function syncArticles(env, snap, strict) {
  const list = Array.isArray(snap.articles) ? snap.articles : [];
  const want = new Map(list.map((a) => [a.slug, a.updatedAt]));

  const have = new Map();
  let cursor;
  do {
    const page = await env.DOVIDNYKY.list({ prefix: ARTICLE_PREFIX, cursor });
    for (const k of page.keys) have.set(k.name.slice(ARTICLE_PREFIX.length), k.metadata && k.metadata.updatedAt);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);

  for (const slug of have.keys()) {
    if (!want.has(slug)) await env.DOVIDNYKY.delete(ARTICLE_PREFIX + slug);
  }

  let budget = ARTICLES_PER_RUN;
  for (const [slug, updatedAt] of want) {
    if (have.get(slug) === updatedAt) continue;
    if (budget-- <= 0) break;
    try {
      await pullArticle(env, slug);
    } catch (err) {
      if (strict) throw err;
    }
  }
}

async function pullArticle(env, slug) {
  const res = await isFetch(env, `/api/v1/public/articles/${encodeURIComponent(slug)}`, { Accept: 'application/json' });
  if (res.status === 404 || res.status === 410) {
    await env.DOVIDNYKY.delete(ARTICLE_PREFIX + slug);
    return null;
  }
  if (!res.ok) throw new Error(`article ${slug}: HTTP ${res.status}`);
  const text = await res.text();
  let art;
  try { art = JSON.parse(text); } catch { throw new Error(`article ${slug}: not JSON`); }
  if (art.slug !== slug || typeof art.html !== 'string') throw new Error(`article ${slug}: bad body`);
  await env.DOVIDNYKY.put(ARTICLE_PREFIX + slug, text, { metadata: { updatedAt: art.updatedAt || null } });
  return art;
}

function isFetch(env, path, headers) {
  const base = (env.IS_API_BASE || '').replace(/\/+$/, '');
  if (!base) throw new Error('IS_API_BASE not configured');
  return fetch(base + path, {
    headers: { 'User-Agent': 'mrt-plus-site/1', ...headers },
    signal: AbortSignal.timeout(IS_TIMEOUT_MS),
  });
}

// ---------- підстановка в сторінки ----------

let memo = { at: 0, snap: null };

async function loadSnapshot(env) {
  if (memo.snap && Date.now() - memo.at < MEMO_MS) return memo.snap;
  try {
    const snap = await env.DOVIDNYKY.get(KEY_SNAPSHOT, { type: 'json', cacheTtl: 60 });
    memo = { at: Date.now(), snap: snap && Array.isArray(snap.centers) ? snap : null };
  } catch {
    memo = { at: Date.now(), snap: null };
  }
  return memo.snap;
}

async function withIsData(res, env) {
  const type = res.headers.get('Content-Type') || '';
  if (res.status !== 200 || !type.includes('text/html')) return res;
  const snap = await loadSnapshot(env);
  if (!snap) return res;

  const bySlug = new Map(snap.centers.map((c) => [c.slug, c]));
  const center = (el, attr) => bySlug.get(el.getAttribute(attr));
  let card = null;
  let voices = null;

  const lists = {
    doctors: () => { const h = doctorListHtml(snap); return h && `<ul class="doc-grid">${h}</ul>`; },
    reviews: () => { const h = reviewListHtml(snap); return h && `<div class="rev-grid">${h}</div>`; },
    articles: () => { const h = articleListHtml(snap); return h && `<ul class="art-grid">${h}</ul>`; },
  };

  return new HTMLRewriter()
    .on('[data-is-list]', {
      element(el) {
        const make = lists[el.getAttribute('data-is-list')];
        const html = make && make();
        if (html) el.setInnerContent(html, { html: true });
      },
    })
    // Відгуки центру: секція в HTML прихована, відкривається лише з даними.
    .on('[data-is-reviews]', {
      element(el) {
        voices = centerVoicesHtml(snap, el.getAttribute('data-is-reviews'));
        if (voices) el.removeAttribute('hidden');
        el.onEndTag(() => { voices = null; });
      },
    })
    .on('[data-is-reviews] .voices', {
      element(el) {
        if (voices) el.setInnerContent(voices, { html: true });
      },
    })
    .on('[data-is-hours]', {
      element(el) {
        const c = center(el, 'data-is-hours');
        if (c && c.machines.length) el.setInnerContent(hoursSetHtml(c), { html: true });
      },
    })
    .on('[data-is-pricelist]', {
      element(el) {
        const html = priceListHtml(snap, el.getAttribute('data-is-pricelist'));
        if (html) el.setInnerContent(html, { html: true });
      },
    })
    .on('[data-is-badge]', {
      element(el) {
        const c = center(el, 'data-is-badge');
        if (!c || !c.machines.length) return;
        const h = badgeHours(c);
        const set = (name, v) => (v ? el.setAttribute(name, v) : el.removeAttribute(name));
        set('data-pn-pt', h.mon_fri);
        set('data-sb', h.sat);
        set('data-nd', h.sun);
      },
    })
    // Картка апарата: data-is-machine="slug:CLASS" на <article>, поля – dd
    // з data-is-f усередині. HTMLRewriter іде документом по черзі, тож поле
    // належить останній відкритій картці. Стан – свій для кожного запиту.
    .on('[data-is-machine]', {
      element(el) {
        const [slug, cls] = (el.getAttribute('data-is-machine') || '').split(':');
        const c = bySlug.get(slug);
        const m = c && c.machines.find((x) => x.class === cls);
        card = m ? machineFields(m) : null;
        el.onEndTag(() => { card = null; });
      },
    })
    .on('[data-is-f]', {
      element(el) {
        const v = card && card[el.getAttribute('data-is-f')];
        if (v) el.setInnerContent(v);
      },
    })
    .transform(res);
}

// ---------- лікарі й статті ----------

async function doctorRoute(request, env, url, m) {
  if (!m[2]) return Response.redirect(`${url.origin}/likari/${m[1]}/${url.search}`, 301);
  const snap = await loadSnapshot(env);
  const page = snap && doctorPage(snap, m[1]);
  if (!page) return errorPage(request, env, 404);
  return fromTemplate(request, env, TEMPLATE_DOCTOR, page);
}

async function articleRoute(request, env, url, m) {
  if (!m[2]) return Response.redirect(`${url.origin}/statti/${m[1]}/${url.search}`, 301);
  const slug = m[1];
  const snap = await loadSnapshot(env);
  if (!snap) return errorPage(request, env, 404);
  if ((snap.articlesArchived || []).includes(slug)) return errorPage(request, env, 410);
  const item = (snap.articles || []).find((a) => a.slug === slug);
  if (!item) return errorPage(request, env, 404);

  // Текст – з KV; немає чи застарів – з ІС одразу (і в KV на наступний раз).
  const { value, metadata } = await env.DOVIDNYKY.getWithMetadata(ARTICLE_PREFIX + slug, { type: 'json', cacheTtl: 60 });
  let art = value;
  if (!art || !metadata || metadata.updatedAt !== item.updatedAt) {
    try {
      art = (await pullArticle(env, slug)) || null;
    } catch {
      // ІС недоступна – лишаємо те, що є в KV, навіть якщо застаріле.
    }
  }
  if (!art) return errorPage(request, env, 503);
  return fromTemplate(request, env, TEMPLATE_ARTICLE, articlePage(snap, art));
}

// Сторінка на шаблоні: шапка й підвал – з шаблону, <main>, title,
// description і JSON-LD – зі знімка.
async function fromTemplate(request, env, path, page) {
  const tpl = await env.ASSETS.fetch(new Request(new URL(path, request.url), { method: 'GET' }));
  if (tpl.status !== 200) return errorPage(request, env, 503);
  const headers = new Headers(tpl.headers);
  headers.delete('ETag');
  headers.delete('Last-Modified');
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  const out = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(page.title); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute('content', page.description); } })
    .on('head', {
      element(el) {
        if (page.jsonLd) el.append(`<script type="application/ld+json">${page.jsonLd}</script>`, { html: true });
      },
    })
    .on('main', { element(el) { el.setInnerContent(page.main, { html: true }); } })
    .transform(tpl);
  return new Response(request.method === 'HEAD' ? null : out.body, { status: 200, headers });
}

// 404 / 410 / 503 – сторінка 404.html з потрібним статусом.
async function errorPage(request, env, status) {
  const res = await env.ASSETS.fetch(new Request(new URL('/404.html', request.url), { method: 'GET' }));
  const headers = new Headers(res.headers);
  headers.delete('ETag');
  headers.delete('Last-Modified');
  headers.set('Cache-Control', 'no-store');
  if (status === 503) headers.set('Retry-After', '120');
  return new Response(request.method === 'HEAD' ? null : res.body, { status, headers });
}

async function sitemap(env) {
  const snap = await loadSnapshot(env);
  return new Response(sitemapXml(snap), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

// ---------- службовий стан ----------

async function syncStatus(env) {
  const meta = await env.DOVIDNYKY.get(KEY_META, 'json');
  return json(meta || { version: null });
}

// ---------- допоміжне ----------

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Порівняння за сталий час: не видає, на якому символі підпис розійшовся.
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...extra,
    },
  });
}
