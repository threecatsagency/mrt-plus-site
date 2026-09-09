#!/usr/bin/env python3
"""Одна шапка й один підвал на всіх сторінках.

Еталон – lutsk/index.html. Скрипт бере звідти <header>…</header> і
<footer>…</footer> і підставляє в решту сторінок, змінюючи лише те, що
залежить від сторінки:

  • пігулка міста: на сторінках міст – назва міста і позначка aria-current
    у переліку; на контактах і сторінці стилів – тьмяна «Оберіть місто»;
    на головній та в архіві секцій пігулки немає взагалі;
  • aria-current="page" на пункті «Контакти» для сторінки контактів.

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
}
for slug in MISTA:
    STORINKY[f"{slug}/index.html"] = ("misto", slug)


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
        a, b = vyrizaty(s, "header")
        s = s[:a] + header + s[b:]
        a, b = vyrizaty(s, "footer")
        footer = footer_et
        # Номер збірки живе лише в підвалі головної – переносимо його з
        # поточного підвалу сторінки, еталон його не має.
        nomer = re.search(r'\n\s*<span class="tnum">Збірка [^<]*</span>', s[a:b])
        if nomer:
            footer = footer.replace('<a href="#">Політика конфіденційності</a>', '<a href="#">Політика конфіденційності</a>' + nomer.group(0), 1)
        s = s[:a] + footer + s[b:]
        p.write_text(s, encoding="utf-8")
        print(f"оновлено: {shliakh}")

    # Еталон теж має позначку поточного міста
    s = ETALON.read_text(encoding="utf-8")
    a, b = vyrizaty(s, "header")
    s = s[:a] + pigulka(header_et, "misto", "lutsk") + s[b:]
    ETALON.write_text(s, encoding="utf-8")
    print("оновлено: lutsk/index.html (еталон)")


if __name__ == "__main__":
    main()
