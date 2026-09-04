/* МРТ ПЛЮС – скрипт сайту.
   Правило: без JS сторінка лишається читабельною і робочою.
   Поля працюють і без скрипта, він лише допомагає ввести правильно. */

(function () {
  "use strict";

  /* ------------------------------------------------------------------
     Мобільне меню
     ------------------------------------------------------------------ */

  var burger = document.querySelector("[data-menu-toggle]");
  var menu = document.getElementById("mobile-menu");

  // Рівні мобільного меню: другий заїжджає на місце першого.
  function riven(name) {
    if (!menu) return;
    menu.querySelectorAll(".mlvl").forEach(function (lvl) {
      lvl.classList.toggle("is-on", lvl.dataset.lvl === name);
    });
  }

  if (burger && menu) {
    burger.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      if (!open) riven("root"); // закрили меню – наступного разу відкриється згори
    });

    menu.querySelectorAll("[data-lvl-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        riven(btn.dataset.lvlOpen);
      });
    });

    menu.querySelectorAll("[data-lvl-back]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        riven("root");
      });
    });
  }

  /* ------------------------------------------------------------------
     Панелі верхнього меню
     Відкриваються наведенням і фокусом з клавіатури. Сам пункт лишається
     посиланням на свій розділ: панель – скорочення, а не єдиний шлях.
     ------------------------------------------------------------------ */

  (function () {
    var items = [].slice.call(document.querySelectorAll(".nav-item"));
    if (!items.length) return;

    function stan(item, open) {
      item.classList.toggle("is-open", open);
      var link = item.querySelector("a[aria-expanded]");
      if (link) link.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function zakrytyVsi() {
      items.forEach(function (item) {
        stan(item, false);
      });
    }

    items.forEach(function (item) {
      item.addEventListener("mouseenter", function () {
        zakrytyVsi();
        stan(item, true);
      });
      item.addEventListener("mouseleave", function () {
        stan(item, false);
      });
      item.addEventListener("focusin", function () {
        zakrytyVsi();
        stan(item, true);
      });
      item.addEventListener("focusout", function (e) {
        if (!item.contains(e.relatedTarget)) stan(item, false);
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") zakrytyVsi();
    });
  })();

  /* ------------------------------------------------------------------
     Оптика: елементи без жодної малої літери сидять вище центру,
     бо великі літери й цифри вищі за малі. Позначаємо їх класом.
     Якщо скрипт не завантажився, зсуву просто не буде – нічого не ламається.
     ------------------------------------------------------------------ */

  var MALI = /\p{Ll}/u;

  function opticaCaps(root) {
    (root || document)
      .querySelectorAll(
      ".btn, .btn-ticket, .badge, .chip, .city-switch, .price, " +
        ".scard__price, .bluehero__facts b, .phone"
    )
      .forEach(function (el) {
        var text = (el.textContent || "").trim();
        if (!text) return;
        el.classList.toggle("is-caps", !MALI.test(text));
      });
  }

  opticaCaps();

  /* ------------------------------------------------------------------
     Графік центру на сьогодні
     Замість «Пн–Пт 8:00–22:00» пишемо те, що людину цікавить зараз:
     працює центр чи ні і до котрої. Час рахується за Києвом, а не за
     годинником пристрою: людина може дивитися сайт із будь-якого поясу,
     а центр працює за місцевим.
     ------------------------------------------------------------------ */

  // Хвилини від півночі за київським часом і номер дня тижня (0 – неділя).
  function kyivZaraz() {
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Kyiv",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(new Date());

    var val = {};
    parts.forEach(function (p) {
      val[p.type] = p.value;
    });

    var dni = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      den: dni[val.weekday],
      hv: Number(val.hour) * 60 + Number(val.minute)
    };
  }

  // «8:00» і «08:00» однаково перетворюються на хвилини.
  function uHvylyny(text) {
    var m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(text || "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function hodyny(el) {
    var teper = kyivZaraz();
    var vikno =
      teper.den === 0 ? el.dataset.nd : teper.den === 6 ? el.dataset.sb : el.dataset.pnPt;

    if (!vikno) {
      el.textContent = "Сьогодні вихідний";
      el.classList.add("is-shut");
      return;
    }

    var mezhi = vikno.split("-");
    var vidkr = uHvylyny(mezhi[0]);
    var zakr = uHvylyny(mezhi[1]);

    // Зіпсовані дані краще не показувати зовсім, ніж показати дурницю.
    if (vidkr === null || zakr === null) {
      el.textContent = "";
      return;
    }

    if (teper.hv < vidkr) {
      el.textContent = "Сьогодні з " + mezhi[0].trim();
      el.classList.add("is-shut");
    } else if (teper.hv < zakr) {
      el.textContent = "Зараз працює, до " + mezhi[1].trim();
      el.classList.remove("is-shut");
    } else {
      el.textContent = "Сьогодні вже зачинено";
      el.classList.add("is-shut");
    }
  }

  document.querySelectorAll("[data-pn-pt]").forEach(hodyny);


  /* ------------------------------------------------------------------
     Стан поля
     ------------------------------------------------------------------ */

  function pokazatyPomylku(input, text) {
    var field = input.closest(".field");
    if (!field) return;
    var error = field.querySelector(".field-error");

    var hint = field.querySelector(".field-hint");

    if (text) {
      field.classList.add("is-invalid");
      if (!error) {
        error = document.createElement("span");
        error.className = "field-error";
        error.dataset.auto = "1";
        field.appendChild(error);
      }
      error.textContent = text;
      input.setAttribute("aria-invalid", "true");
      // Підказка і помилка не стоять поруч: помилка займає її місце.
      if (hint) hint.hidden = true;
    } else {
      field.classList.remove("is-invalid");
      input.removeAttribute("aria-invalid");
      if (error && error.dataset.auto === "1") error.remove();
      if (hint) hint.hidden = false;
    }
  }

  /* ------------------------------------------------------------------
     Телефон
     Що б людина не ввела, у полі має лишитися +380XXXXXXXXX.
     ------------------------------------------------------------------ */

  // Коди мобільних операторів України.
  var MOBILE_CODES = [
    "39", "50", "63", "66", "67", "68", "73", "89",
    "91", "92", "93", "94", "95", "96", "97", "98", "99"
  ];

  // 0501234567, 501234567, 380501234567, +380501234567 → +380501234567
  // Пробіли, зокрема нерозривні, дужки, дефіси, крапки й літери відкидаються.
  function normalizuvaty(value) {
    var d = String(value).replace(/\D/g, "");

    if (!d) return "";

    if (d.slice(0, 3) === "380") {
      d = d.slice(3);
    } else if (d.slice(0, 2) === "38") {
      d = d.slice(2);
      if (d.charAt(0) === "0") d = d.slice(1);
    } else if (d.charAt(0) === "0") {
      d = d.slice(1);
    }

    d = d.slice(0, 9);
    return d ? "+380" + d : "";
  }

  function povnyy(value) {
    var m = /^\+380(\d{9})$/.exec(value);
    return !!m && MOBILE_CODES.indexOf(m[1].slice(0, 2)) !== -1;
  }

  document.querySelectorAll("[data-phone]").forEach(function (input) {
    input.setAttribute("inputmode", "tel");
    input.setAttribute("autocomplete", "tel");
    input.setAttribute("maxlength", "13");

    // Під час набору лишаємо тільки цифри й плюс, не смикаючи курсор.
    input.addEventListener("input", function () {
      var cleaned = input.value.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
      if (cleaned !== input.value) {
        var pos = input.selectionStart - (input.value.length - cleaned.length);
        input.value = cleaned;
        try {
          input.setSelectionRange(pos, pos);
        } catch (e) {
          /* поле може не підтримувати виділення */
        }
      }
      if (input.value.replace(/\D/g, "").length >= 9) pokazatyPomylku(input, "");
    });

    // Вставка з буфера – одразу до повного вигляду.
    input.addEventListener("paste", function (event) {
      event.preventDefault();
      var data = event.clipboardData || window.clipboardData;
      input.value = normalizuvaty(data.getData("text"));
      pokazatyPomylku(input, "");
    });

    // Автозаповнення браузера приходить як change.
    input.addEventListener("change", function () {
      input.value = normalizuvaty(input.value);
    });

    input.addEventListener("blur", function () {
      if (!input.value) {
        pokazatyPomylku(input, "");
        return;
      }
      input.value = normalizuvaty(input.value);
      if (povnyy(input.value)) {
        pokazatyPomylku(input, "");
      } else if (input.value.length < 13) {
        pokazatyPomylku(input, "Схоже, номер неповний. Приклад: +380501234567");
      } else {
        pokazatyPomylku(input, "Такого коду оператора немає. Приклад: +380501234567");
      }
    });
  });

  /* ------------------------------------------------------------------
     Дата
     Видиме поле – у звичному вигляді 15.09.2026. Кнопка поруч відкриває
     календар браузера, який пише в приховане поле type="date".
     ------------------------------------------------------------------ */

  function uDatu(iso) {
    var p = iso.split("-");
    return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : "";
  }

  function zDaty(text) {
    var m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(text).trim());
    if (!m) return "";
    var d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    // Перевірка існування дати: 31.02 сюди не пройде.
    if (
      d.getFullYear() !== Number(m[3]) ||
      d.getMonth() !== Number(m[2]) - 1 ||
      d.getDate() !== Number(m[1])
    ) {
      return "";
    }
    return m[3] + "-" + m[2] + "-" + m[1];
  }

  function dvi(n) {
    return String(n).length < 2 ? "0" + n : String(n);
  }

  document.querySelectorAll("[data-date]").forEach(function (input) {
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("maxlength", "10");
    if (!input.getAttribute("placeholder")) {
      input.setAttribute("placeholder", "15.09.2026");
    }

    var wrap = document.createElement("div");
    wrap.className = "control";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.classList.add("input--with-action");

    var picker = document.createElement("input");
    picker.type = "date";
    picker.className = "control__picker";
    picker.tabIndex = -1;
    picker.setAttribute("aria-hidden", "true");
    var today = new Date();
    picker.min =
      today.getFullYear() + "-" + dvi(today.getMonth() + 1) + "-" + dvi(today.getDate());

    var button = document.createElement("button");
    button.type = "button";
    button.className = "input-action";
    button.setAttribute("aria-label", "Обрати дату в календарі");
    button.innerHTML =
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" aria-hidden="true">' +
      '<rect x="2.75" y="4.25" width="14.5" height="13" rx="2.5"></rect>' +
      '<path d="M2.75 8.25h14.5M6.75 2.75v3M13.25 2.75v3"></path></svg>';

    wrap.appendChild(picker);
    wrap.appendChild(button);

    button.addEventListener("click", function () {
      var iso = zDaty(input.value);
      if (iso) picker.value = iso;
      if (typeof picker.showPicker === "function") {
        try {
          picker.showPicker();
          return;
        } catch (e) {
          /* браузер може заборонити виклик – нижче запасний шлях */
        }
      }
      picker.focus();
      picker.click();
    });

    picker.addEventListener("change", function () {
      if (!picker.value) return;
      input.value = uDatu(picker.value);
      pokazatyPomylku(input, "");
      input.focus();
    });

    // Крапки ставляться самі: 15092026 → 15.09.2026
    input.addEventListener("input", function () {
      if (input.selectionStart !== input.value.length) return;
      var d = input.value.replace(/\D/g, "").slice(0, 8);
      var out = d;
      if (d.length > 4) out = d.slice(0, 2) + "." + d.slice(2, 4) + "." + d.slice(4);
      else if (d.length > 2) out = d.slice(0, 2) + "." + d.slice(2);
      if (out !== input.value) input.value = out;
    });

    input.addEventListener("paste", function (event) {
      event.preventDefault();
      var data = event.clipboardData || window.clipboardData;
      var d = data.getData("text").replace(/\D/g, "").slice(0, 8);
      if (d.length === 8) {
        input.value = d.slice(0, 2) + "." + d.slice(2, 4) + "." + d.slice(4);
      } else {
        input.value = d;
      }
      pokazatyPomylku(input, zDaty(input.value) ? "" : "Такої дати немає. Формат: 15.09.2026");
    });

    input.addEventListener("blur", function () {
      if (!input.value) {
        pokazatyPomylku(input, "");
        return;
      }
      pokazatyPomylku(
        input,
        zDaty(input.value) ? "" : "Такої дати немає. Формат: 15.09.2026"
      );
    });
  });

  /* ------------------------------------------------------------------
     Копіювання значення токена – зручність сторінки стилів
     ------------------------------------------------------------------ */

  // Табки центрів: одна панель на місто. Інформація про шість центрів
  // одночасно нікому не потрібна – людині потрібен її власний.
  (function () {
    var tabs = [].slice.call(document.querySelectorAll(".ctab"));
    if (!tabs.length) return;

    function show(city) {
      tabs.forEach(function (t) {
        t.setAttribute("aria-selected", String(t.dataset.city === city));
      });
      document.querySelectorAll(".cpanel").forEach(function (panel) {
        panel.classList.toggle("is-on", panel.id === city);
      });
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () {
        show(tab.dataset.city);
      });
      // Роль tablist вимагає ходіння стрілками, а не лише табуляцією.
      tab.addEventListener("keydown", function (e) {
        var step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        var next = tabs[(i + step + tabs.length) % tabs.length];
        next.focus();
        show(next.dataset.city);
      });
    });
  })();

  // Відео про обстеження вантажиться лише після кліку: сам файл важить
  // мегабайти, а дивиться його меншість відвідувачів.
  (function () {
    var box = document.querySelector("[data-video]");
    if (!box) return;
    var btn = box.querySelector(".vplayer__btn");
    if (!btn) return;

    btn.addEventListener("click", function () {
      var video = document.createElement("video");
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "auto";
      video.setAttribute("poster", "assets/img/video-poster.webp");

      // Вузький екран отримує легший файл.
      var vuzko = window.matchMedia("(max-width: 47.99em)").matches;
      var source = document.createElement("source");
      source.src = vuzko ? "assets/video/hero-480.mp4" : "assets/video/hero-720.mp4";
      source.type = "video/mp4";
      video.appendChild(source);

      box.appendChild(video);
      box.classList.add("is-on");
      var playing = video.play();
      if (playing && playing.catch) playing.catch(function () {});
    });
  })();

  document.querySelectorAll("[data-copy]").forEach(function (el) {
    el.addEventListener("click", function () {
      var value = el.getAttribute("data-copy");
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(value).then(function () {
        var prev = el.getAttribute("data-label") || "";
        var meta = el.querySelector("[data-copy-hint]");
        if (!meta) return;
        meta.textContent = "скопійовано";
        setTimeout(function () {
          meta.textContent = prev || value;
        }, 1200);
      });
    });
  });
})();
