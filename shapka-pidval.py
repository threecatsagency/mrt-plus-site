#!/usr/bin/env python3
"""Одна шапка й один підвал на всіх сторінках.

Еталон – lutsk/index.html. Скрипт бере звідти <header>…</header> і
<footer>…</footer> і підставляє в решту сторінок, змінюючи лише те, що
залежить від сторінки:

  • пігулка міста: на сторінках міст – назва міста і позначка aria-current
    у переліку; на контактах і сторінці стилів – тьмяна «Оберіть місто»;
    на головній та в архіві секцій пігулки немає взагалі;
  • aria-current="page" на пункті «Контакти» для сторінки контактів;
  • пункт «Ціни» (шапка, мобільне меню, підвал) веде на прайс міста
    сторінки, на загальних сторінках – на прайс Луцька; на сторінці цін
    він позначений aria-current;
  • на сторінках цін (/<місто>/tsiny/) якорі шапки (#posluhy, #zapys…)
    ведуть на сторінку центру: самих секцій на сторінці цін немає;
  • якорі, яких на сторінці немає (#posluhy на контактах, #vidhuky на
    підготовці…), ведуть туди, де розділ є, або пункт прибирається
    (YAKIR_KUDY, YAKIR_PRYBRATY).

Запускати після будь-якої правки шапки чи підвалу в еталоні:

    python3 shapka-pidval.py

Після цього – perevirka.py, як завжди.
"""

import pathlib
import re
import sys

KORIN = pathlib.Path(__file__).resolve().parent
ETALON = KORIN / "lutsk" / "index.html"

MISTA = {
    "kyiv": "Київ",
    "zhytomyr": "Житомир",
    "rivne": "Рівне",
    "lutsk": "Луцьк",
    "kovel": "Ковель",
    "sheptytskyi": "Шептицький",
}

# Сторінка → (режим пігулки, місто)
STORINKY = {
    "index.html": ("nema", None),
    "arkhiv-sektsii.html": ("nema", None),
    "kontakty/index.html": ("neviodme", None),
    "styleguide.html": ("neviodme", None),
    "pidhotovka-mrt/index.html": ("neviodme", None),
    "pidhotovka-kt/index.html": ("neviodme", None),
    "likari/index.html": ("neviodme", None),
    "likari/zrazok/index.html": ("neviodme", None),
    "vidhuky/index.html": ("neviodme", None),
    "statti/index.html": ("neviodme", None),
    "statti/zrazok/index.html": ("neviodme", None),
}
for slug in MISTA:
    STORINKY[f"{slug}/index.html"] = ("misto", slug)
    STORINKY[f"{slug}/tsiny/index.html"] = ("misto", slug)

TSINY_ZA_ZAMOVCHANNIAM = "lutsk"


def tsiny(header, footer, shliakh, slug):
    """Посилання «Ціни» і якорі для сторінки."""
    kudy = f"/{slug or TSINY_ZA_ZAMOVCHANNIAM}/tsiny/"
    tsinova = shliakh.endswith("/tsiny/index.html")
    header = re.sub(r'<a href="[^"]*"( aria-current="page")?>Ціни</a>',
                    f'<a href="{kudy}"' + (' aria-current="page"' if tsinova else "") + ">Ціни</a>", header)
    header = re.sub(r'<a class="mitem" href="[^"]*">Ціни</a>', f'<a class="mitem" href="{kudy}">Ціни</a>', header)
    footer = re.sub(r'<li><a href="[^"]*">Ціни</a></li>', f'<li><a href="{kudy}">Ціни</a></li>', footer)
    if tsinova:
        header = re.sub(r'href="#([a-z][^"]*)"', rf'href="/{slug}/#\1"', header)
        footer = re.sub(r'href="#([a-z][^"]*)"', rf'href="/{slug}/#\1"', footer)
    return header, footer


# Якорі шапки й підвалу (#posluhy, #vidhuky…), яких немає на сторінці:
# або ведуть на сторінку, де розділ є, або пункт прибирається, доки
# розділу чи окремої сторінки немає.
YAKIR_KUDY = {
    "posluhy": f"/{TSINY_ZA_ZAMOVCHANNIAM}/tsiny/",
    "pytannia": "/pidhotovka-mrt/#pytannia",
}
YAKIR_PRYBRATY = {"vidhuky", "zapys"}


def yakori(blok, idy):
    """Лагодить якорі блоку під ідентифікатори сторінки idy."""
    for yakir in set(re.findall(r'href="#([a-z][^"]*)"', blok)):
        if yakir in idy:
            continue
        if yakir in YAKIR_KUDY:
            blok = blok.replace(f'href="#{yakir}"', f'href="{YAKIR_KUDY[yakir]}"')
        elif yakir in YAKIR_PRYBRATY:
            blok = re.sub(rf'\n[ \t]*(?:<li>)?<a[^>]*href="#{yakir}"[^>]*>[^<]*</a>(?:</li>)?(?=\n)', "", blok)
        else:
            sys.exit(f"Якір #{yakir} не має куди вести – додати в YAKIR_KUDY або YAKIR_PRYBRATY")
    return blok


def idy_storinky(shliakh, slug, s):
    """Ідентифікатори, на які можуть вести якорі шапки: для сторінки цін –
    зі сторінки центру (туди їх переадресовує tsiny())."""
    if shliakh.endswith("/tsiny/index.html"):
        s = (KORIN / slug / "index.html").read_text(encoding="utf-8")
    a, b = vyrizaty(s, "header")
    fa, fb = vyrizaty(s, "footer")
    return set(re.findall(r'id="([^"]+)"', s[:a] + s[b:fa] + s[fb:]))


def vyrizaty(text, tag):
    """Повертає (початок, кінець) блоку <tag …>…</tag> у тексті."""
    a = text.index(f"<{tag}")
    b = text.index(f"</{tag}>", a) + len(f"</{tag}>")
    return a, b


def pigulka(header, rezhym, slug):
    """Налаштовує блок пігулки міста під сторінку."""
    blok = re.search(
        r"\n\s*<!-- Місто сторінки.*?<div class=\"nav-item nav-item--city\">.*?\n    </div>\n",
        header,
        flags=re.S,
    )
    if not blok:
        sys.exit("У еталоні не знайдено блок пігулки міста")
    b = blok.group(0)
    # знімаємо позначку поточного міста з еталона
    b = b.replace(' aria-current="page"', "")
    b = b.replace("city-switch city-switch--none", "city-switch")
    if rezhym == "nema":
        return header.replace(b, "\n")
    if rezhym == "neviodme":
        b = b.replace('class="city-switch"', 'class="city-switch city-switch--none"')
        b = re.sub(r'(class="city-switch city-switch--none"[^>]*>(?:<svg.*?</svg>))[^<]*', r"\1Оберіть місто", b, flags=re.S)
        return header.replace(blok.group(0), b)
    nazva = MISTA[slug]
    b = re.sub(r'(class="city-switch"[^>]*>(?:<svg.*?</svg>))[^<]*', lambda m: m.group(1) + nazva, b, flags=re.S)
    b = b.replace(f'<a href="/{slug}/">{nazva}</a>', f'<a href="/{slug}/" aria-current="page">{nazva}</a>')
    return header.replace(blok.group(0), b)


def main():
    etalon = ETALON.read_text(encoding="utf-8")
    ha, hb = vyrizaty(etalon, "header")
    fa, fb = vyrizaty(etalon, "footer")
    header_et = etalon[ha:hb].replace(' aria-current="page"', "")
    footer_et = etalon[fa:fb]

    for shliakh, (rezhym, slug) in STORINKY.items():
        p = KORIN / shliakh
        if not p.exists():
            print(f"пропуск: {shliakh} немає")
            continue
        s = p.read_text(encoding="utf-8")
        header = pigulka(header_et, rezhym, slug)
        if shliakh == "kontakty/index.html":
            header = header.replace('<a href="/kontakty/">Контакти</a>', '<a href="/kontakty/" aria-current="page">Контакти</a>', 1)
        if shliakh.startswith("likari/"):
            header = header.replace('<a href="/likari/">Лікарі</a>', '<a href="/likari/" aria-current="page">Лікарі</a>', 1)
        a, b = vyrizaty(s, "header")
        s = s[:a] + header + s[b:]
        a, b = vyrizaty(s, "footer")
        footer = footer_et
        # Номер збірки живе лише в підвалі головної – переносимо його з
        # поточного підвалу сторінки, еталон його не має.
        nomer = re.search(r'\n\s*<span class="tnum">Збірка [^<]*</span>', s[a:b])
        if nomer:
            footer = footer.replace('<span>© 2026 ТОВ «МРТ ПЛЮС»</span>', '<span>© 2026 ТОВ «МРТ ПЛЮС»</span>' + nomer.group(0), 1)
        s = s[:a] + footer + s[b:]
        a, b = vyrizaty(s, "header")
        fa2, fb2 = vyrizaty(s, "footer")
        idy = idy_storinky(shliakh, slug, s)
        h2, f2 = tsiny(yakori(s[a:b], idy), yakori(s[fa2:fb2], idy), shliakh, slug)
        s = s[:a] + h2 + s[b:fa2] + f2 + s[fb2:]
        p.write_text(s, encoding="utf-8")
        print(f"оновлено: {shliakh}")

    # Еталон теж має позначку поточного міста
    s = ETALON.read_text(encoding="utf-8")
    a, b = vyrizaty(s, "header")
    s = s[:a] + pigulka(header_et, "misto", "lutsk") + s[b:]
    a, b = vyrizaty(s, "header")
    fa, fb = vyrizaty(s, "footer")
    idy = idy_storinky("lutsk/index.html", "lutsk", s)
    h2, f2 = tsiny(yakori(s[a:b], idy), yakori(s[fa:fb], idy), "lutsk/index.html", "lutsk")
    s = s[:a] + h2 + s[b:fa] + f2 + s[fb:]
    ETALON.write_text(s, encoding="utf-8")
    print("оновлено: lutsk/index.html (еталон)")


if __name__ == "__main__":
    main()
