/* Сторінка цін: пошук за назвою, перемикач МРТ / КТ, підсвітка поточної
   категорії в сайдбарі й плашках. Прайс уже в HTML (його будує воркер),
   скрипт лише ховає й показує рядки – без запитів до сервера. */
(function () {
  "use strict";

  var root = document.querySelector("[data-is-pricelist]");
  var input = root && root.querySelector("#tsiny-q");
  if (!input) return;

  var groups = [].slice.call(root.querySelectorAll(".pgroup"));
  var navItems = [].slice.call(root.querySelectorAll(".tsiny-nav a[data-cat]"));
  var chips = [].slice.call(root.querySelectorAll(".tsiny-cats a[data-cat]"));
  var modButtons = [].slice.call(root.querySelectorAll("[data-mod-filter]"));
  var clearBtn = root.querySelector("[data-q-clear]");
  var empty = root.querySelector(".tsiny-empty");
  var mod = "all";

  // Нормалізація: нижній регістр, без апострофів, лише літери й цифри.
  function words(s) {
    return s.toLowerCase().replace(/['’ʼ`]/g, "").split(/[^0-9a-zа-щьюяґєії]+/).filter(Boolean);
  }

  // Слово запиту збігається, якщо його основа – початок якогось слова
  // назви: «коліна» → «колі» → «колінного»; «шийн» → «ший» → «шийного».
  function stem(w) {
    return w.length >= 5 ? w.slice(0, w.length - 2) : w.length === 4 ? w.slice(0, 3) : w;
  }

  var rows = groups.map(function (g) {
    return [].slice.call(g.querySelectorAll("tbody tr")).map(function (tr) {
      var th = tr.querySelector("th");
      return { tr: tr, th: th, text: th.textContent, words: words(th.textContent) };
    });
  });

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Підсвітити в назві знайдені основи.
  function highlight(text, stems) {
    if (!stems.length) return escapeHtml(text);
    var re = new RegExp("(^|[^0-9a-zа-щьюяґєії])(" + stems.map(function (s) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("|") + ")", "gi");
    return escapeHtml(text).replace(re, "$1<mark>$2</mark>");
  }

  function apply() {
    var stems = words(input.value).map(stem);
    var shownTotal = 0;
    clearBtn.hidden = !input.value;

    groups.forEach(function (g, i) {
      var gMod = g.getAttribute("data-mod");
      var modOk = mod === "all" || gMod === mod || gMod === "other";
      var shown = 0;
      rows[i].forEach(function (r) {
        var ok = modOk && stems.every(function (s) {
          return r.words.some(function (w) { return w.indexOf(s) === 0; });
        });
        r.tr.hidden = !ok;
        r.th.innerHTML = ok ? highlight(r.text, stems) : escapeHtml(r.text);
        if (ok) shown++;
      });
      g.hidden = shown === 0;
      shownTotal += shown;
      var id = g.id;
      navItems.concat(chips).forEach(function (a) {
        if (a.getAttribute("data-cat") !== id) return;
        var li = a.closest("li");
        (li || a).hidden = shown === 0;
        var n = a.querySelector(".tsiny-nav__n");
        if (n) n.textContent = shown;
      });
    });
    empty.hidden = shownTotal > 0;
    spy();
  }

  var timer;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(apply, 60);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { input.value = ""; apply(); }
  });
  clearBtn.addEventListener("click", function () {
    input.value = "";
    apply();
    input.focus();
  });

  modButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      mod = b.getAttribute("data-mod-filter");
      modButtons.forEach(function (x) {
        var on = x === b;
        x.classList.toggle("is-active", on);
        x.setAttribute("aria-pressed", on ? "true" : "false");
      });
      apply();
    });
  });

  // Поточна категорія: остання, чий заголовок уже пройшов під липкою
  // смугою пошуку.
  var bar = root.querySelector(".tsiny-bar");
  var ticking = false;
  function spy() {
    ticking = false;
    var line = bar.getBoundingClientRect().bottom + 8;
    var current = null;
    groups.forEach(function (g) {
      if (!g.hidden && g.getBoundingClientRect().top <= line) current = g.id;
    });
    if (!current) {
      var first = groups.filter(function (g) { return !g.hidden; })[0];
      current = first ? first.id : null;
    }
    navItems.forEach(function (a) {
      a.classList.toggle("is-active", a.getAttribute("data-cat") === current);
    });
    chips.forEach(function (a) {
      var on = a.getAttribute("data-cat") === current;
      if (on && !a.classList.contains("is-active")) {
        var row = a.parentNode;
        row.scrollTo({ left: a.offsetLeft - row.clientWidth / 2 + a.clientWidth / 2, behavior: "smooth" });
      }
      a.classList.toggle("is-active", on);
    });
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(spy); }
  }, { passive: true });
  spy();
})();
