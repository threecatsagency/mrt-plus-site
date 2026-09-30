// Перевірка воркера: списки, сторінки лікарів і статей, відгуки центрів,
// sitemap, синхронізація текстів статей. Дані – snapshot.json і articles.json
// (за контрактом claude/sait-kontent-z-is.md). Запуск: npm install && npm test
import crypto from 'node:crypto';
import { start, state } from './harness.mjs';

const mf = await start();
const B = 'https://mrtplus.ua';
let ok = 0, bad = 0;
const t = (name, cond, extra = '') => { if (cond) ok++; else { bad++; console.log('✗', name, extra); } };
const get = async (p, init) => { const r = await mf.dispatchFetch(B + p, { redirect: 'manual', ...init }); return { s: r.status, h: r.headers, b: await r.text() }; };
const count = (s, re) => (s.match(re) || []).length;
async function signal(version) {
  const body = JSON.stringify({ version, changedAt: new Date().toISOString() });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', 'test-secret').update(`${ts}.${body}`).digest('hex');
  const r = await mf.dispatchFetch(B + '/api/is-sync', { method: 'POST', body, headers: { 'X-MRT-Timestamp': ts, 'X-MRT-Signature': sig } });
  return { s: r.status, j: await r.json() };
}

// --- без знімка ---
let r = await get('/likari/');
t('без знімка: лікарі – запасний текст', r.s === 200 && r.b.includes('Список оновлюється'));
r = await get('/statti/');  t('без знімка: статті – запасний текст', r.b.includes('Список оновлюється'));
r = await get('/vidhuky/'); t('без знімка: відгуки – запасний текст', r.b.includes('Відгуки оновлюються'));
r = await get('/lutsk/');   t('без знімка: відгуки центру приховані', /data-is-reviews="lutsk" hidden/.test(r.b));
r = await get('/likari/demo-kovalenko-oksana/'); t('без знімка: сторінка лікаря 404', r.s === 404);
r = await get('/sitemap.xml'); t('без знімка: sitemap лише постійні', r.s === 200 && count(r.b, /<url>/g) === 19, count(r.b, /<url>/g));

// --- синхронізація ---
state.log = [];
let sg = await signal(42);
t('сигнал: знімок збережено', sg.s === 200 && sg.j.status === 'saved', JSON.stringify(sg.j));
t('сигнал: забрано 3 тексти статей', state.log.filter((p) => p.includes('/articles/')).length === 3, state.log.join(' '));

// --- списки ---
r = await get('/likari/');
t('лікарі: 4 картки', count(r.b, /class="doc-card"/g) === 4);
t('лікарі: фільтр міст', r.b.includes('data-city="zhytomyr sheptytskyi kovel"'));
t('лікарі: без фото – ініціали', r.b.includes('ph--portrait ph--initials" aria-hidden="true">МА<'));
t('лікарі: стаж 1 рік', r.b.includes('Стаж 1&#160;рік · Луцьк'));
t('лікарі: запасного тексту нема', !r.b.includes('Список оновлюється'));
r = await get('/vidhuky/'); t('відгуки: 9', count(r.b, /class="rev"/g) === 9);
t('відгуки: джерело', r.b.includes('Відгук з Google Карт') && r.b.includes('Відгук з Facebook') && r.b.includes('Відгук пацієнта'));
t('відгуки: місяць', r.b.includes('серпень 2026'));
r = await get('/statti/');
const order = [...r.b.matchAll(/href="\/statti\/([^/]+)\/"/g)].map((m) => m[1]);
t('статті: закріплена перша, далі новіші', order.join() === 'demo-yak-pidhotuvatysia-do-mrt,demo-kt-chy-mrt,demo-mrt-kolinnoho-suhloba', order.join());
t('статті: обкладинки 4:5', count(r.b, /width="1080" height="1350"/g) === 3);
t('статті: рамки 4:5', count(r.b, /class="art-card__cover"/g) === 3);

// --- сторінка лікаря ---
r = await get('/likari/demo-kovalenko-oksana/');
t('лікар: 200', r.s === 200);
t('лікар: title', r.b.includes('<title>Коваленко Оксана Василівна, лікар-рентгенолог, завідувачка відділення – МРТ ПЛЮС</title>'));
t('лікар: h1', r.b.includes('<h1>Коваленко Оксана Василівна</h1>'));
t('лікар: стаж 15 років', r.b.includes('<b>15&#160;років</b><span>стаж</span>'));
t('лікар: категорія', r.b.includes('<b>Вища</b><span>кваліфікаційна категорія</span>'));
t('лікар: центри', r.b.includes('<a href="/rivne/">Рівне</a>, <a href="/lutsk/">Луцьк</a></b><span>центри</span>'));
t('лікар: спеціалізація', r.b.includes('Нейрорадіологія: МРТ головного мозку'));
for (const h of ['Освіта', 'Досвід роботи', 'Стажування', 'Підвищення кваліфікації, наукова та освітня діяльність', 'Членство']) t(`лікар: блок ${h}`, r.b.includes(`<h2>${h}</h2>`));
t('лікар: «з 2019»', r.b.includes('<time>з 2019</time>'));
t('лікар: членство без років', r.b.includes('<time></time><div><b>Асоціація радіологів України</b>'));
t('лікар: чіп → ціни Рівного', r.b.includes('href="/rivne/tsiny/#mrt-holovy">МРТ голови</a>'));
t('лікар: демієлінізація → Луцьк', /href="\/lutsk\/tsiny\/#[^"]+">МРТ при демієлінізуючих/.test(r.b));
t('лікар: КТ голови → Рівне', /href="\/rivne\/tsiny\/#kt-holovy">КТ голови/.test(r.b));
t('лікар: 2 відгуки', count(r.b, /class="rev"/g) === 2);
t('лікар: статті лікаря', r.b.includes('Статті <em>лікаря</em>') && r.b.includes('/statti/demo-yak-pidhotuvatysia-do-mrt/'));
const others = [...r.b.split('Інші <em>лікарі</em>')[1].matchAll(/href="\/likari\/([^/]+)\/"/g)].map((m) => m[1]);
t('лікар: інші – спершу колега з Луцька', others[0] === 'demo-melnyk-andrii' && others.length === 3, others.join());
t('лікар: чергування площин', count(r.b, /pk-sec pk-sec--band/g) === 2);
t('лікар: шапка з шаблону', r.b.includes('class="site-header') && r.b.includes('aria-current="page">Лікарі'));
t('лікар: без ETag шаблону', !r.h.get('etag'));
r = await get('/likari/demo-melnyk-andrii/');
t('лікар 2: без категорії «none»', !r.b.includes('кваліфікаційна категорія'));
t('лікар 2: без порожніх блоків', !r.b.includes('<h2>Стажування</h2>') && r.b.includes('<h2>Освіта</h2>'));
t('лікар 2: ініціали в першому екрані', r.b.includes('doc-hero"><span class="ph ph--portrait ph--initials"'));
t('лікар 2: центр однина', r.b.includes('<span>центр</span>'));
r = await get('/likari/demo-kovalenko-oksana'); t('лікар: без слеша → 301', r.s === 301 && r.h.get('location') === B + '/likari/demo-kovalenko-oksana/');
r = await get('/likari/nemaie-takoho/'); t('лікар: невідомий → 404', r.s === 404 && r.b.includes('<html'));
r = await get('/likari/zrazok/'); t('шаблон лікаря → 404', r.s === 404);
r = await get('/statti/zrazok/'); t('шаблон статті → 404', r.s === 404);

// --- стаття ---
r = await get('/statti/demo-yak-pidhotuvatysia-do-mrt/');
t('стаття: 200', r.s === 200);
t('стаття: seoTitle', r.b.includes('<title>Підготовка до МРТ: що взяти, чого не робити | МРТ ПЛЮС</title>'));
t('стаття: опис', r.b.includes('content="Документи, одяг, їжа і ліки'));
t('стаття: оновлено', r.b.includes('Оновлено <time datetime="2026-09-28">28.09.2026</time>'));
t('стаття: автор', r.b.includes('href="/likari/demo-kovalenko-oksana/"') && r.b.includes('завідувачка відділення, автор статті'));
t('стаття: обкладинка 4:5', r.b.includes('class="art-hero__img"') && r.b.includes('width="1080" height="1350"'));
t('стаття: текст без вступу', !r.b.includes('<p class="lead">Вступ') && r.b.includes('article-note--warning'));
const ld = r.b.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
let j = null; try { j = JSON.parse(ld[1]); } catch {}
t('стаття: JSON-LD', j && j['@type'] === 'MedicalWebPage' && j.author.url === 'https://mrtplus.ua/likari/demo-kovalenko-oksana/' && j.dateModified === '2026-09-28');
t('стаття: інші статті', r.b.includes('Інші <em>статті</em>') && count(r.b.split('Інші <em>статті</em>')[1], /class="art-card"/g) === 2);
r = await get('/statti/demo-kt-chy-mrt/');
t('стаття 2: title без seoTitle', r.b.includes('<title>КТ чи МРТ: що обрати (демо) | МРТ ПЛЮС</title>'));
t('стаття 2: без «Оновлено»', !r.b.includes('Оновлено'));
r = await get('/statti/demo-znyata-stattia/'); t('знята стаття → 410', r.s === 410);
r = await get('/statti/nemaie/'); t('невідома стаття → 404', r.s === 404);
r = await get('/statti/demo-kt-chy-mrt/', { method: 'HEAD' }); t('HEAD статті', r.s === 200 && r.b === '');

// --- сторінки центрів ---
r = await get('/lutsk/');
t('Луцьк: секція відгуків відкрита', /data-is-reviews="lutsk">/.test(r.b));
t('Луцьк: 3 відгуки', count(r.b, /class="voice"/g) === 3);
t('Луцьк: четвертого нема', !r.b.includes('Ігор (демо)'));
t('Луцьк: підпис', r.b.includes('<figcaption>Марія (демо), серпень 2026</figcaption>'));
t('Луцьк: графіки на місці', r.b.includes('hours__kind'));
r = await get('/kyiv/'); t('Київ: 1 відгук', count(r.b, /class="voice"/g) === 1);
r = await get('/lutsk/tsiny/'); t('ціни: прайс на місці', r.b.includes('tsiny-nav') && r.b.includes('id="mrt-holovy"'));
r = await get('/sitemap.xml');
t('sitemap: 26 адрес', count(r.b, /<url>/g) === 26, count(r.b, /<url>/g));
t('sitemap: лікар з lastmod', r.b.includes('<loc>https://mrtplus.ua/likari/demo-bondar-taras/</loc><lastmod>2026-09-30</lastmod>'));
r = await get('/assets/css/zmist.css'); t('статика мимо коду', r.s === 200);

// --- повторна синхронізація: лише змінені тексти, прибирання ---
state.log = [];
sg = await signal(42); t('та сама версія → up_to_date', sg.j.status === 'up_to_date');
state.snap.version = 43;
state.snap.articles[1].updatedAt = '2026-09-30T12:00:00.000Z';
state.texts['demo-kt-chy-mrt'].updatedAt = '2026-09-30T12:00:00.000Z';
state.texts['demo-kt-chy-mrt'].title = 'КТ чи МРТ: нова назва (демо)';
state.snap.articles[1].title = 'КТ чи МРТ: нова назва (демо)';
state.log = [];
sg = await signal(43);
t('v43: збережено', sg.j.status === 'saved');
t('v43: забрано лише 1 текст', state.log.filter((p) => p.includes('/articles/')).join() === '/api/v1/public/articles/demo-kt-chy-mrt', state.log.join(' '));
const kv = await mf.getKVNamespace('DOVIDNYKY');
const txt = await kv.get('article:demo-kt-chy-mrt', 'json');
t('v43: текст у KV оновлено', txt && txt.title === 'КТ чи МРТ: нова назва (демо)');
// статтю знято з публікації
state.snap.version = 44;
const gone = state.snap.articles.splice(2, 1)[0];
state.snap.articlesArchived.push(gone.slug);
sg = await signal(44);
t('v44: текст знятої статті прибрано з KV', sg.j.status === 'saved' && (await kv.get('article:' + gone.slug)) === null);

// --- ІС недоступна: сигнал – помилка, KV без змін ---
state.down = true; state.snap.version = 45;
sg = await signal(45); t('ІС лежить → 502', sg.s === 502);
state.down = false;

// --- тексту немає в KV: сторінка бере з ІС сама ---
await kv.delete('article:demo-yak-pidhotuvatysia-do-mrt');
state.log = [];
r = await get('/statti/demo-yak-pidhotuvatysia-do-mrt/');
t('текст з ІС на льоту', r.s === 200 && state.log.includes('/api/v1/public/articles/demo-yak-pidhotuvatysia-do-mrt'), `${r.s} ${state.log.join(' ')}`);
t('…і збережено в KV', (await kv.get('article:demo-yak-pidhotuvatysia-do-mrt')) !== null);

// --- щогодинна перевірка дозабирає тексти ---
await kv.delete('article:demo-kt-chy-mrt');
state.log = [];
const w = await mf.getWorker();
await w.scheduled({ cron: '0 * * * *' });
await new Promise((res) => setTimeout(res, 300));
t('cron дозабрав текст', (await kv.get('article:demo-kt-chy-mrt')) !== null, state.log.join(' '));

console.log(`\n${ok} зелених, ${bad} червоних`);
await mf.dispose();
process.exit(bad ? 1 : 0);
