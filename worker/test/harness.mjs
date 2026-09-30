// Стенд воркера сайту: Miniflare + статика з репозиторію + підроблена ІС.
import { Miniflare } from 'miniflare';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json',
  '.txt': 'text/plain', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.xml': 'application/xml' };

// ASSETS: html_handling auto-trailing-slash, not_found_handling 404-page.
function assets(request) {
  const url = new URL(request.url);
  let p = decodeURIComponent(url.pathname);
  const file = (rel) => { const f = path.join(ROOT, rel); return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null; };
  let f = null;
  if (p.endsWith('/')) f = file(p + 'index.html');
  else if (file(p + '/index.html')) return new Response(null, { status: 307, headers: { Location: p + '/' } });
  else f = file(p);
  const status = f ? 200 : 404;
  f = f || file('/404.html');
  return new Response(fs.readFileSync(f), { status, headers: { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', ETag: '"asset"', 'X-Robots-Tag': 'noindex, nofollow' } });
}

export const state = { snap: null, texts: null, log: [], down: false };

function isApi(request) {
  const url = new URL(request.url);
  state.log.push(url.pathname);
  if (url.hostname !== 'is.mrtplus.ua') return new Response('blocked', { status: 599 });
  if (state.down) return new Response('down', { status: 502 });
  if (url.pathname === '/api/v1/public/version') {
    const tag = `"v${state.snap.version}"`;
    if (request.headers.get('If-None-Match') === tag) return new Response(null, { status: 304 });
    return Response.json({ version: state.snap.version }, { headers: { ETag: tag } });
  }
  if (url.pathname === '/api/v1/public/snapshot') return Response.json(state.snap);
  const m = url.pathname.match(/^\/api\/v1\/public\/articles\/([^/]+)$/);
  if (m) {
    const slug = decodeURIComponent(m[1]);
    if ((state.snap.articlesArchived || []).includes(slug)) return new Response('gone', { status: 410 });
    const t = state.texts[slug];
    if (!t || !state.snap.articles.some((a) => a.slug === slug)) return new Response('nf', { status: 404 });
    return Response.json(t);
  }
  return new Response('nf', { status: 404 });
}

export async function start() {
  state.snap = JSON.parse(fs.readFileSync(new URL('./snapshot.json', import.meta.url)));
  state.texts = JSON.parse(fs.readFileSync(new URL('./articles.json', import.meta.url)));
  const mf = new Miniflare({
    modules: true,
    scriptPath: path.join(ROOT, 'worker/index.js'),
    modulesRoot: ROOT,
    modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
    compatibilityDate: '2026-08-06', // найновіша дата, яку знає локальний workerd; у wrangler.jsonc – своя,
    kvNamespaces: ['DOVIDNYKY'],
    bindings: { IS_API_BASE: 'https://is.mrtplus.ua', SITE_WEBHOOK_SECRET: 'test-secret' },
    serviceBindings: { ASSETS: assets },
    outboundService: isApi,
  });
  await mf.ready;
  return mf;
}
