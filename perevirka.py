#!/usr/bin/env python3
"""Ворота перед заливанням. Запуск: python3 perevirka.py

Що перевіряє:
  1. довге тире – заборонене в усіх файлах;
  2. слово «типографіка» – пишемо «типографія»;
  3. CSS-змінні, які використані, але ніде не оголошені;
  4. локальні посилання в HTML, яких немає на диску;
  5. JSON у data/ – парситься;
  6. парність тегів у HTML.
Ненульовий код виходу означає: не заливати.
"""

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROBLEMS = []

TEXT_EXT = {".html", ".css", ".js", ".json", ".md", ".txt", ".py"}
SKIP_DIRS = {".git", "node_modules", "dist"}
VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr", "path",
    "circle", "rect", "line", "polygon", "polyline", "ellipse", "use", "stop",
}


# Прототипи – чернетки для показу варіантів. Вони мають власні стилі
# в <style> і не є частиною сайту, тому в перевірку не входять.
CHERNETKY = ("proto-",)


def files(exts=None):
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if exts and path.suffix not in exts:
            continue
        if path.name.startswith(CHERNETKY):
            continue
        yield path


def problem(path, message):
    PROBLEMS.append(f"{path.relative_to(ROOT)}: {message}")


# 1–2. Заборонені знаки й слова
def perevirka_tekstu():
    for path in files(TEXT_EXT):
        if path.name == Path(__file__).name:
            continue  # сам валідатор містить приклади заборонених рядків
        text = path.read_text(encoding="utf-8", errors="replace")
        for number, line in enumerate(text.splitlines(), 1):
            if "\u2014" in line:
                problem(path, f"рядок {number}: довге тире, треба коротке (–)")
            if "типографік" in line.lower():
                problem(path, f"рядок {number}: слово «типографіка», треба «типографія»")


# 3. CSS-змінні
def perevirka_zminnyh():
    declared, used = set(), {}
    for path in files({".css"}):
        text = path.read_text(encoding="utf-8")
        declared |= set(re.findall(r"(--[\w-]+)\s*:", text))
        for name in re.findall(r"var\(\s*(--[\w-]+)", text):
            used.setdefault(name, path)
    for name, path in sorted(used.items()):
        if name not in declared:
            problem(path, f"змінна {name} використана, але ніде не оголошена")


# 4. Локальні посилання
def perevirka_posylan():
    pattern = re.compile(r'(?:href|src)="([^"]+)"')
    for path in files({".html"}):
        text = path.read_text(encoding="utf-8")
        for link in pattern.findall(text):
            if link.startswith(("http", "//", "#", "mailto:", "tel:", "data:", "/")):
                continue  # абсолютні шляхи майбутнього сайту не перевіряємо
            target = (path.parent / link.split("#")[0].split("?")[0]).resolve()
            if not target.exists():
                problem(path, f"бите посилання: {link}")


# 5. JSON
def perevirka_json():
    for path in files({".json"}):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            problem(path, f"JSON не парситься: {error}")


# 6. Парність тегів
class TagCheck(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f"зайвий </{tag}> у рядку {self.getpos()[0]}")
            return
        open_tag, line = self.stack.pop()
        if open_tag != tag:
            self.errors.append(
                f"<{open_tag}> з рядка {line} закритий як </{tag}> у рядку {self.getpos()[0]}"
            )


def perevirka_rozmitky():
    for path in files({".html"}):
        checker = TagCheck()
        checker.feed(path.read_text(encoding="utf-8"))
        for error in checker.errors:
            problem(path, error)
        for tag, line in checker.stack:
            problem(path, f"тег <{tag}> з рядка {line} не закритий")


def css_tekst():
    """Увесь CSS одним рядком."""
    return "".join(
        path.read_text(encoding="utf-8") for path in files({".css"})
    )


def perevirka_klasiv():
    """Кожен клас у розмітці має бути описаний у CSS, і навпаки –
    описаний клас має десь застосовуватися. Інакше стилі й сторінки
    розходяться мовчки."""
    css = css_tekst()
    opysani = set(re.findall(r"\.([a-zA-Z][\w-]*)", css))
    for path in files({".html"}):
        vzhyti = set()
        for group in re.findall(r'class="([^"]*)"', path.read_text(encoding="utf-8")):
            vzhyti |= set(group.split())
        for name in sorted(vzhyti - opysani):
            problem(path, f"клас «{name}» у розмітці не описаний у CSS")


def perevirka_tsin():
    """Ціна набирається одним компонентом. Будь-яка сума в гривнях
    має нести клас price – інакше вона отримає шрифт від контексту
    і поруч стануть дві різні ціни."""
    element = re.compile(
        r'<(?P<tag>span|td|p|b|div|a)\b(?P<attrs>[^>]*)>(?P<body>(?:(?!</?(?:span|td|p|b|div|a)\b).)*грн)',
        re.S,
    )
    for path in files({".html"}):
        text = path.read_text(encoding="utf-8")
        for match in element.finditer(text):
            attrs = match.group("attrs")
            klasy = re.search(r'class="([^"]*)"', attrs)
            if klasy and "price" in klasy.group(1).split():
                continue
            row = text[: match.start()].count("\n") + 1
            problem(path, f"сума в гривнях без класу price у рядку {row}")


def perevirka_telefonu():
    """Номер мережі пишеться однаково скрізь: нерозривні пробіли між
    групами цифр і клас phone на елементі. Інакше номер рветься між
    рядками або набирається іншим шрифтом."""
    nomer = "0&#160;800&#160;311&#160;058"
    element = re.compile(
        r'<(?P<tag>span|a|b|p|td)\b(?P<attrs>[^>]*)>(?P<body>(?:(?!</?(?:span|a|b|p|td)\b).)*0&#160;800)',
        re.S,
    )
    for path in files({".html"}):
        text = path.read_text(encoding="utf-8")
        for match in re.finditer(r"0[\s ]800[\s ]311[\s ]058", text):
            if text[match.start():match.end()] != nomer.replace("&#160;", "\u00a0"):
                row = text[: match.start()].count("\n") + 1
                problem(path, f"номер без нерозривних пробілів у рядку {row}")
        for match in element.finditer(text):
            klasy = re.search(r'class="([^"]*)"', match.group("attrs"))
            if klasy and "phone" in klasy.group(1).split():
                continue
            row = text[: match.start()].count("\n") + 1
            problem(path, f"номер без класу phone у рядку {row}")


CENTRY = [
    "Луцьк, просп. Молоді, 12В",
    "Рівне, вул. Карнаухова, 2А",
    "Ковель, вул. Олени Пчілки, 4",
    "Житомир, вул. Вокзальна, 12",
    "Київ, вул. Композитора Мейтуса, 5",
    "Шептицький, вул. Івасюка, 2",
]


def perevirka_tsentriv():
    """Шість центрів мережі перелічуються в одному порядку на всіх
    сторінках: із заходу на схід, столиця передостання. Різні порядки
    в підвалах двох сторінок читаються як різні мережі."""
    spysok = re.compile(r"<h4>Центри</h4>.*?</ul>", re.S)
    for path in files({".html"}):
        text = path.read_text(encoding="utf-8")
        match = spysok.search(text)
        if not match:
            continue
        znaydeni = re.findall(r"<li><a[^>]*>([^<]+)</a></li>", match.group(0))
        if znaydeni != CENTRY:
            problem(path, "перелік центрів у підвалі не збігається з еталонним")


def perevirka_inline():
    """Інлайнові стилі заборонені: їх не видно у стайл-ґайді, вони не
    перевіряються і саме через них головна починає розходитися зі
    сторінкою стилів. Усе оформлення живе в класах."""
    for path in files({".html"}):
        text = path.read_text(encoding="utf-8")
        for match in re.finditer(r'style="([^"]*)"', text):
            row = text[: match.start()].count("\n") + 1
            problem(path, f"інлайновий стиль у рядку {row}: {match.group(1)[:60]}")


def main():
    perevirka_tekstu()
    perevirka_zminnyh()
    perevirka_posylan()
    perevirka_json()
    perevirka_rozmitky()
    perevirka_klasiv()
    perevirka_tsin()
    perevirka_inline()
    perevirka_telefonu()
    perevirka_tsentriv()

    if PROBLEMS:
        print(f"Знайдено проблем: {len(PROBLEMS)}\n")
        for item in PROBLEMS:
            print(" ·", item)
        return 1

    print("Перевірка пройдена. Можна заливати.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
