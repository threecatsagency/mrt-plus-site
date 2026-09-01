/* МРТ ПЛЮС – мінімальний скрипт сайту.
   Правило: без JS сторінка лишається читабельною і робочою. */

(function () {
  "use strict";

  // Мобільне меню
  var burger = document.querySelector("[data-menu-toggle]");
  var menu = document.getElementById("mobile-menu");

  if (burger && menu) {
    burger.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // Копіювання значення токена по кліку на свотч – зручність сторінки стилів
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
