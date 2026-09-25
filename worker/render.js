// Перетворення знімка довідників з ІС у фрагменти HTML сайту.
// Формат виходу – рівно той, що зараз стоїть у сторінках: заміна даних
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
