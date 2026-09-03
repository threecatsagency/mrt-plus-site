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

  if (burger && menu) {
    burger.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

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
        ".scard__price, .bluehero__facts b, .big-phone"
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
     Замість «Пн–Пт 7:00–22:00» пишемо те, що людину цікавить зараз:
     працює центр чи ні і до котрої. Неділя – вихідний до підтвердження.
     ------------------------------------------------------------------ */

  function hodyny(el) {
    var den = new Date().getDay(); // 0 – неділя
    var vikno = den === 0 ? null : den === 6 ? el.dataset.sb : el.dataset.pnPt;
    var out = el.querySelector("[data-hours]");
    if (!out) return;

    if (!vikno) {
      out.textContent = "Сьогодні вихідний";
      out.classList.add("is-closed");
      return;
    }

    var mezhi = vikno.split("-");
    var zaraz = new Date().getHours() * 60 + new Date().getMinutes();
    var vidkr = Number(mezhi[0].slice(0, 2)) * 60 + Number(mezhi[0].slice(3));
    var zakr = Number(mezhi[1].slice(0, 2)) * 60 + Number(mezhi[1].slice(3));

    if (zaraz < vidkr) {
      out.textContent = "Сьогодні з " + mezhi[0];
      out.classList.remove("is-closed");
    } else if (zaraz < zakr) {
      out.textContent = "Працює до " + mezhi[1];
      out.classList.remove("is-closed");
    } else {
      out.textContent = "Сьогодні вже зачинено";
      out.classList.add("is-closed");
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
