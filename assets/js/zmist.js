/* Фільтр за містом на сторінці відгуків.
   Кнопки з data-filter="<місто>" (або "all") ховають елементи, у чиєму
   data-city цього міста немає. data-city може містити кілька міст
   через пробіл. Лікарі – одна сітка без фільтра (рішення 13.11.2026). */
(function () {
  "use strict";

  var buttons = [].slice.call(document.querySelectorAll("[data-filter]"));
  if (!buttons.length) return;
  var items = [].slice.call(document.querySelectorAll("[data-city]"));

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      var city = button.getAttribute("data-filter");
      buttons.forEach(function (b) {
        var on = b === button;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      items.forEach(function (item) {
        var cities = item.getAttribute("data-city").split(" ");
        item.hidden = city !== "all" && cities.indexOf(city) === -1;
      });
    });
  });
})();
