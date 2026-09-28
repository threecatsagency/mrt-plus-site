// Перетворення знімка довідників з ІС у фрагменти HTML сайту.
// Формат виходу – рівно той, що стоїть у сторінках: заміна даних
// не змінює вигляду.

const DAYS = [
  ['mon_fri', 'Пн–Пт'],
  ['sat', 'Сб'],
  ['sun', 'Нд'],
];

// "07:30" → "7:30"
function hm(t) {
  return t.replace(/^0(\d)/, '$1');
}

function range(r, sep) {
  return r ? `${hm(r[0])}${sep}${hm(r[1])}` : null;
}

function sameSchedule(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Групи графіка: спершу МРТ, потім КТ. Кілька МРТ з однаковим графіком –
// одна група «МРТ»; з різним – окремо за класом («МРТ 1,5Т», «МРТ 3Т»).
export function scheduleGroups(center) {
  const mri = center.machines.filter((m) => m.class.startsWith('MRI'));
  const ct = center.machines.filter((m) => m.class === 'CT');
  const groups = [];
  if (mri.length) {
    if (mri.every((m) => sameSchedule(m.schedule, mri[0].schedule))) {
      groups.push({ label: 'МРТ', schedule: mri[0].schedule });
    } else {
      for (const m of mri) groups.push({ label: m.className, schedule: m.schedule });
    }
  }
  if (ct.length) {
    if (ct.every((m) => sameSchedule(m.schedule, ct[0].schedule))) {
      groups.push({ label: 'КТ', schedule: ct[0].schedule });
    } else {
      for (const m of ct) groups.push({ label: m.name || m.className, schedule: m.schedule });
    }
  }
  return groups;
}

// Вміст <div class="hours-set">.
export function hoursSetHtml(center) {
  return scheduleGroups(center).map((g) => {
    const rows = DAYS.map(([key, label]) =>
      `<dt>${label}</dt><dd>${range(g.schedule[key], '–') || 'вихідний'}</dd>`).join('');
    return `<div class="hours"><p class="hours__kind">${esc(g.label)}</p><dl class="cpanel__hours">${rows}</dl></div>`;
  }).join('');
}

// Плашка «Зараз працює»: найширше вікно центру за кожним типом дня.
export function badgeHours(center) {
  const out = {};
  for (const [key] of DAYS) {
    const rs = center.machines.map((m) => m.schedule[key]).filter(Boolean);
    if (!rs.length) { out[key] = null; continue; }
    const from = rs.map((r) => r[0]).sort()[0];
    const to = rs.map((r) => r[1]).sort().at(-1);
    out[key] = `${hm(from)}-${hm(to)}`;
  }
  return out; // {mon_fri, sat, sun} → "7:00-23:00" або null
}

// Значення характеристик апарата в картці.
export function machineFields(m) {
  return {
    bore: m.boreCm ? `${m.boreCm} см` : null,
    weight: m.maxWeightKg ? `до ${m.maxWeightKg} кг` : null,
    contrast: m.contrast ? 'так' : 'ні',
  };
}

// ---------- сторінка цін ----------

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', ю: 'iu', я: 'ia',
};

// Якір категорії: «МРТ хребта» → «mrt-khrebta».
export function slugify(s) {
  return s.toLowerCase().replace(/['’ʼ]/g, '').split('').map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch)).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function money(n) {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '&#160;')}&#160;грн`;
}

// Категорії прайсу центру: лише послуги з ціною в цьому центрі. Варіанти
// без контрасту і з контрастом (у ІС – дві послуги з однаковою назвою)
// зводяться в один рядок.
export function priceCategories(snap, slug) {
  const out = [];
  const used = new Set();
  for (const cat of snap.categories) {
    const rows = new Map();
    let extra = false;
    for (const s of cat.services) {
      const p = s.prices && s.prices[slug];
      if (typeof p !== 'number') continue;
      if (s.kind === 'extra') extra = true;
      const row = rows.get(s.name) || { name: s.name, plain: null, contrast: null, single: null };
      if (s.kind === 'extra') row.single = p;
      else if (s.withContrast) row.contrast = p;
      else row.plain = p;
      rows.set(s.name, row);
    }
    if (!rows.size) continue;
    const mods = new Set(cat.services.map((s) => s.modality));
    const mod = extra ? 'other' : (mods.size === 1 ? [...mods][0] : 'other');
    let id = slugify(cat.name) || 'katehoriia';
    while (used.has(id)) id += '-2';
    used.add(id);
    out.push({ id, name: cat.name, mod, extra, rows: [...rows.values()] });
  }
  return out;
}

function priceCell(label, v) {
  return v == null
    ? `<td class="ptable__price is-none" data-l="${label}">–</td>`
    : `<td class="ptable__price" data-l="${label}"><span class="price">${money(v)}</span></td>`;
}

// Увесь блок прайсу: навігація, пошук, перемикач МРТ / КТ, категорії.
export function priceListHtml(snap, slug) {
  const cats = priceCategories(snap, slug);
  if (!cats.length) return '';
  const hasMri = cats.some((c) => c.mod === 'MRI');
  const hasCt = cats.some((c) => c.mod === 'CT');
  const total = cats.reduce((n, c) => n + c.rows.length, 0);
  const count = (m) => cats.filter((c) => c.mod === m).reduce((n, c) => n + c.rows.length, 0);

  const nav = cats.map((c) =>
    `<li data-mod="${c.mod}"><a href="#${c.id}" data-cat="${c.id}"><span>${esc(c.name)}</span><span class="tsiny-nav__n">${c.rows.length}</span></a></li>`).join('');
  const chips = cats.map((c) =>
    `<a class="chip" href="#${c.id}" data-cat="${c.id}" data-mod="${c.mod}">${esc(c.name)}</a>`).join('');
  const mods = hasMri && hasCt
    ? `<div class="tsiny-mods" role="group" aria-label="Вид дослідження">`
      + `<button class="chip is-active" type="button" data-mod-filter="all" aria-pressed="true">Усі <span>${total}</span></button>`
      + `<button class="chip" type="button" data-mod-filter="MRI" aria-pressed="false">МРТ <span>${count('MRI')}</span></button>`
      + `<button class="chip" type="button" data-mod-filter="CT" aria-pressed="false">КТ <span>${count('CT')}</span></button>`
      + `</div>`
    : '';

  const groups = cats.map((c) => {
    const head = c.extra
      ? '<tr><th scope="col">Послуга</th><th scope="col" class="ptable__price">Ціна</th></tr>'
      : '<tr><th scope="col">Дослідження</th><th scope="col" class="ptable__price">Без контрасту</th><th scope="col" class="ptable__price">З контрастом</th></tr>';
    const body = c.rows.map((r) => c.extra
      ? `<tr><th scope="row">${esc(r.name)}</th>${priceCell('Ціна', r.single)}</tr>`
      : `<tr><th scope="row">${esc(r.name)}</th>${priceCell('Без контрасту', r.plain)}${priceCell('З контрастом', r.contrast)}</tr>`).join('');
    return `<section class="pgroup" id="${c.id}" data-mod="${c.mod}"><h2 class="pgroup__title">${esc(c.name)}</h2>`
      + `<table class="ptable${c.extra ? ' ptable--single' : ''}"><thead>${head}</thead><tbody>${body}</tbody></table></section>`;
  }).join('');

  return `<nav class="tsiny-nav" aria-label="Категорії цін"><p class="tsiny-nav__title">Категорії</p><ul>${nav}</ul></nav>`
    + `<div class="tsiny-main">`
    + `<div class="tsiny-bar">`
    + `<div class="tsiny-search"><label class="visually-hidden" for="tsiny-q">Пошук за назвою дослідження</label>`
    + `<svg class="tsiny-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`
    + `<input class="input input--with-action" id="tsiny-q" type="search" placeholder="Пошук" autocomplete="off" enterkeyhint="search">`
    + `<button class="input-action" type="button" data-q-clear hidden aria-label="Очистити пошук"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`
    + mods
    + `<div class="tsiny-cats" aria-label="Категорії">${chips}</div>`
    + `</div>`
    + groups
    + `<div class="tsiny-empty" hidden><p>Нічого не знайшли за цим запитом.</p><p>Зателефонуйте – підкажемо, яке дослідження вам потрібне: <a class="phone" href="tel:0800311058">0&#160;800&#160;311&#160;058</a></p></div>`
    + `</div>`;
}
