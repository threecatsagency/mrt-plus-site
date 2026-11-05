/* Чат колцентру (Chatwoot) на всіх сторінках сайту.
   Скрипт віджета вантажиться з сервера Chatwoot лише після повного
   завантаження сторінки, щоб не гальмувати перший екран.
   Колір кнопки, привітання, години роботи – у налаштуваннях каналу
   Website в Chatwoot, не тут. Положення над липкою смугою телефону –
   components.css, розділ «Чат». */
(function () {
  "use strict";

  var BASE_URL = "https://chat.medical-plus.ua";
  var WEBSITE_TOKEN = "s9CGNbeyMDU4fZ5B22uJ4e4Z";

  window.chatwootSettings = {
    locale: "uk",
    position: "right",
    type: "standard"
  };

  function load() {
    var s = document.createElement("script");
    s.src = BASE_URL + "/packs/js/sdk.js";
    s.async = true;
    s.onload = function () {
      window.chatwootSDK.run({ websiteToken: WEBSITE_TOKEN, baseUrl: BASE_URL });
    };
    document.head.appendChild(s);
  }

  if (document.readyState === "complete") load();
  else window.addEventListener("load", load);
})();
