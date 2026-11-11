#!/usr/bin/env python3
import re
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

BASE_URL = "https://www.zakonrf.info/uk/{article}/"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "knowledge" / "uk"

ARTICLES = [
    "158", "159.1", "159.2", "159.3", "159.5", "159.6", "160", "161", "162",
    "165", "187",
    "273", "274", "274.1", "138.1",
    "110.1", "110.2", "111", "112", "115", "116", "117", "138", "213",
    "205", "205.2", "205.3", "205.4", "205.5", "206", "207", "208", "210",
    "280", "282", "282.1", "282.2", "282.3",
    "151", "151.2", "127.1",
    "228", "228.1", "230",
    "222", "222.1", "223", "223.1",
]


class ArticleParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_title = False
        self.title_parts = []
        self.in_body = False
        self.depth = 0
        self.in_block = False
        self.current = []
        self.blocks = []

    def flush(self):
        text = re.sub(r"\s+", " ", "".join(self.current)).strip()
        if text:
            self.blocks.append(text)
        self.current = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get("class", "")
        if tag == "h1" and "law-element__h1" in classes:
            self.in_title = True
            return
        if tag == "div" and "law-element__body" in classes and "content-body" in classes:
            self.in_body = True
            self.depth = 1
            return
        if not self.in_body:
            return
        if tag == "div":
            self.depth += 1
        if tag in ("p", "li", "h2", "h3"):
            self.flush()
            self.in_block = True

    def handle_endtag(self, tag):
        if tag == "h1" and self.in_title:
            self.in_title = False
            return
        if not self.in_body:
            return
        if tag in ("p", "li", "h2", "h3"):
            self.flush()
            self.in_block = False
        if tag == "div":
            self.depth -= 1
            if self.depth <= 0:
                self.flush()
                self.in_body = False

    def handle_data(self, data):
        if self.in_title:
            self.title_parts.append(data)
        if self.in_body:
            self.current.append(data)


def clean_title(raw):
    title = re.sub(r"\s+", " ", raw).strip()
    title = re.sub(r"\s*\(действующая редакция\)", "", title, flags=re.IGNORECASE)
    title = re.sub(r"^Статья\s+([\d.]+)\s+УК\s+РФ\.?\s*", r"Статья \1 УК РФ — ", title)
    return title.strip()


def fetch(article):
    url = BASE_URL.format(article=article)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; Kibershchit/1.0)"})
    with urllib.request.urlopen(request, timeout=30) as response:
        html = response.read().decode("utf-8", "replace")
    parser = ArticleParser()
    parser.feed(html)
    title = clean_title("".join(parser.title_parts))
    blocks = parser.blocks
    if not title or not blocks:
        return None, None
    return title, blocks


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    created = 0
    skipped = 0
    for article in ARTICLES:
        try:
            title, blocks = fetch(article)
        except Exception as error:
            print("SKIP", article, str(error)[:120])
            skipped += 1
            time.sleep(0.3)
            continue
        if not blocks:
            print("SKIP", article, "no text")
            skipped += 1
            continue
        path = OUTPUT_DIR / (article + ".md")
        body = "\n\n".join(blocks)
        path.write_text("# " + title + "\n\n## Текст статьи\n\n" + body + "\n", encoding="utf-8")
        print("OK", article, title[:80])
        created += 1
        time.sleep(0.4)
    print("Created:", created, "Skipped:", skipped)


if __name__ == "__main__":
    main()
