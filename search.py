import math
import re
import threading
from collections import Counter
from pathlib import Path

TOKEN_RE = re.compile(r"[а-яa-z0-9]+(?:[.\-][0-9]+)*", re.IGNORECASE)
ARTICLE_RE = re.compile(r"Статья\s+(\d+(?:\.\d+)?)", re.IGNORECASE)
SUFFIXES = sorted([
    "иями", "ями", "ами", "ыми", "ими", "ов", "ев", "ий", "ый", "ая", "ое",
    "ые", "ей", "ой", "ия", "ию", "ии", "ость", "ости", "ению", "ения",
    "ение", "ать", "ять", "ить", "еть", "ует", "ают", "яют", "ился",
    "илась", "ться", "тся", "ешь", "ете", "ем", "им", "ут", "ют", "ат",
    "ят", "ы", "а", "о", "е", "у", "ю", "и", "й", "ь"
], key=len, reverse=True)
STOPWORDS = set("""
и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это
""".split())
SYNONYMS = {
    "мошенничество": ["обман", "хищение", "афера", "развод", " fraud"],
    "мошенник": ["аферист", "обманщик"],
    "обман": ["мошенничество", "ложь"],
    "кража": ["хищение", "воровство", "грабеж", "разбой"],
    "грабеж": ["кража", "хищение", "разбой"],
    "разбой": ["грабеж", "кража", "нападение"],
    "хищение": ["кража", "мошенничество"],
    "травля": ["буллинг", "оскорбление", "издевательство", "унижение", "клевета"],
    "буллинг": ["травля", "оскорбление", "унижение"],
    "оскорбление": ["унижение", "клевета", "травля"],
    "клевета": ["ложь", "порочащие", "репутация"],
    "угроза": ["запугивание", "шантаж", "насилие"],
    "угрозы": ["запугивание", "шантаж", "насилие"],
    "шантаж": ["вымогательство", "угроза"],
    "вымогательство": ["шантаж", "требование"],
    "вербовка": ["вовлечение"],
    "вербовщик": ["вовлечение"],
    "вовлечение": ["вербовка"],
    "склонение": ["вербовка", "вовлечение"],
    "терроризм": ["террористический", "экстремизм"],
    "экстремизм": ["терроризм", "ненависть"],
    "деньги": ["хищение", "кража", "мошенничество", "средства", "перевод"],
    "карта": ["банк", "платеж", "счет"],
    "перевод": ["деньги", "банк", "платеж"],
    "фото": ["изображение", "частная жизнь", "неприкосновенность"],
    "интим": ["частная жизнь", "изображение"],
    "несовершеннолетний": ["подросток", "ребенок", "малолетний"],
    "подросток": ["несовершеннолетний", "ребенок"],
    "суицид": ["самоубийство", "доведение"],
    "самоубийство": ["суицид", "доведение"],
    "доведение": ["суицид", "самоубийство", "унижение"],
    "взлом": ["неправомерный доступ", "компьютерная информация"],
    "хакер": ["неправомерный доступ", "вредоносная программа"],
    "телефон": ["угроза", "шантаж"],
}
SYNONYM_STEMS = {}


def normalize(text):
    text = text.lower().replace("ё", "е")
    text = re.sub(r"[^0-9a-zа-я.\-\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def stem(word):
    if re.fullmatch(r"\d+(?:\.\d+)*", word):
        return word
    for suffix in SUFFIXES:
        if len(word) - len(suffix) >= 4 and word.endswith(suffix):
            return word[:-len(suffix)]
    return word


def tokenize(text, keep_stopwords=False):
    words = TOKEN_RE.findall(normalize(text))
    result = []
    for word in words:
        if len(word) < 2:
            continue
        if not keep_stopwords and word in STOPWORDS:
            continue
        result.append(stem(word))
    return result


for key, values in list(SYNONYMS.items()):
    SYNONYM_STEMS.setdefault(stem(normalize(key)), set()).update(
        stem(normalize(value)) for value in values if value.strip()
    )


class Section:
    __slots__ = ("doc_id", "title", "section_title", "article", "source", "text", "norm", "tokens", "token_set")

    def __init__(self, doc_id, title, section_title, article, source, text):
        self.doc_id = doc_id
        self.title = title
        self.section_title = section_title
        self.article = article
        self.source = source
        self.text = text
        self.norm = normalize(title + "\n" + section_title + "\n" + text)
        self.tokens = tokenize(title + "\n" + section_title + "\n" + text)
        self.token_set = set(self.tokens)


class KnowledgeBase:
    def __init__(self, folder):
        self.folder = Path(folder)
        self.sections = []
        self.idf = {}
        self.documents = []
        self._signature = None
        self._lock = threading.Lock()

    def _files(self):
        if not self.folder.exists():
            return []
        files = []
        for path in self.folder.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix.lower() not in (".md", ".txt"):
                continue
            name = path.name.lower()
            if name.startswith("_") or name in ("readme.md", "readme.txt"):
                continue
            files.append(path)
        return sorted(files)

    def _current_signature(self):
        signature = []
        for path in self._files():
            stat = path.stat()
            signature.append((str(path), stat.st_mtime_ns, stat.st_size))
        return tuple(signature)

    def _read(self, path):
        for encoding in ("utf-8", "cp1251"):
            try:
                return path.read_text(encoding=encoding)
            except UnicodeDecodeError:
                continue
        return path.read_text(encoding="utf-8", errors="replace")

    def _parse(self, path):
        text = self._read(path)
        lines = text.splitlines()
        doc_title = path.stem
        for line in lines:
            if line.startswith("# "):
                doc_title = line[2:].strip()
                break
        article = ARTICLE_RE.search(doc_title)
        article_number = article.group(1) if article else ""
        source = str(path.relative_to(self.folder))
        doc_id = source
        sections = []
        section_title = ""
        buffer = []

        def flush():
            body = "\n".join(buffer).strip()
            if not body:
                return
            sections.append(Section(doc_id, doc_title, section_title, article_number, source, body))

        for line in lines:
            if line.startswith("# "):
                continue
            if line.startswith("## "):
                flush()
                section_title = line[3:].strip()
                buffer = []
            else:
                buffer.append(line)
        flush()
        return doc_title, article_number, source, sections

    def _load(self):
        sections = []
        documents = []
        for path in self._files():
            title, article, source, doc_sections = self._parse(path)
            sections.extend(doc_sections)
            documents.append({
                "title": title,
                "article": article,
                "source": source,
                "sections": len(doc_sections)
            })
        document_frequency = Counter()
        for section in sections:
            document_frequency.update(set(section.tokens))
        total = max(1, len(sections))
        idf = {
            token: math.log((total + 1) / (frequency + 1)) + 1
            for token, frequency in document_frequency.items()
        }
        self.sections = sections
        self.documents = documents
        self.idf = idf

    def refresh(self):
        signature = self._current_signature()
        if signature == self._signature:
            return
        with self._lock:
            if signature == self._signature:
                return
            self._load()
            self._signature = signature

    def list_documents(self):
        self.refresh()
        return list(self.documents)

    def search(self, query, limit=3):
        self.refresh()
        sections = self.sections
        idf = self.idf
        query_norm = normalize(query)
        query_stems = tokenize(query)
        if not query_stems or not sections:
            return []
        expanded = set(query_stems)
        for token in query_stems:
            expanded.update(SYNONYM_STEMS.get(token, set()))
        raw_words = [word for word in re.findall(r"[а-яa-z0-9]+", query_norm) if len(word) >= 4]
        scored = []
        for section in sections:
            score = 0.0
            matched = 0
            for token in expanded:
                if token in section.token_set:
                    score += idf.get(token, 1.0) * 2.0
                    matched += 1
                    continue
                prefix = token[:5]
                if len(prefix) < 4:
                    continue
                hit = next((item for item in section.token_set
                            if len(item) >= 4 and item.startswith(prefix)), None)
                if hit:
                    score += idf.get(hit, 1.0) * 0.6
                    matched += 1
            if not matched:
                continue
            title_tokens = set(tokenize(section.title))
            for token in query_stems:
                if token in title_tokens:
                    score += 12.0
                else:
                    prefix = token[:5]
                    if len(prefix) >= 4 and any(
                        len(item) >= 4 and (item.startswith(prefix) or token.startswith(item[:5]))
                        for item in title_tokens
                    ):
                        score += 6.0
            if len(query_norm) >= 5 and query_norm in section.norm:
                score += 4.0
            score /= 1 + math.log(1 + len(section.tokens) / 80)
            title_lower = section.section_title.lower()
            if "ключевые слова" in title_lower:
                score *= 0.2
            elif "примечание" in title_lower:
                score *= 0.15
            scored.append((score, section))

        scored.sort(key=lambda item: item[0], reverse=True)
        results = []
        seen_docs = set()
        for score, section in scored:
            if section.doc_id in seen_docs:
                continue
            seen_docs.add(section.doc_id)
            results.append({
                "id": section.doc_id,
                "title": section.title,
                "section": section.section_title,
                "article": section.article,
                "source": section.source,
                "score": round(score, 2),
                "snippet": self._snippet(section, raw_words)
            })
            if len(results) >= limit:
                break
        if results:
            threshold = results[0]["score"] * 0.3
            results = [item for item in results if item["score"] >= threshold]
        return results

    @staticmethod
    def _visible_sections(doc_sections):
        visible = [
            {"title": item.section_title, "text": item.text.strip()}
            for item in doc_sections
            if item.section_title.strip().lower() not in ("ключевые слова", "примечание")
        ]
        if visible:
            return visible
        return [
            {"title": item.section_title, "text": item.text.strip()}
            for item in doc_sections
        ]

    def get_document(self, doc_id):
        self.refresh()
        doc_sections = [section for section in self.sections if section.doc_id == doc_id]
        if not doc_sections:
            return None
        first = doc_sections[0]
        return {
            "id": doc_id,
            "title": first.title,
            "article": first.article,
            "source": first.source,
            "sections": self._visible_sections(doc_sections)
        }

    @staticmethod
    def _snippet(section, raw_words, max_length=460):
        text = re.sub(r"[#*_`>]", "", section.text)
        text = re.sub(r"\s+", " ", text).strip()
        lowered = text.lower()
        positions = [lowered.find(word) for word in raw_words if word and word in lowered]
        positions = [position for position in positions if position >= 0]
        if not positions:
            snippet = text[:max_length]
            return snippet + ("…" if len(text) > max_length else "")
        position = min(positions)
        start = max(0, position - 110)
        end = min(len(text), start + max_length)
        snippet = text[start:end]
        if start > 0:
            snippet = "…" + snippet
        if end < len(text):
            snippet += "…"
        return snippet
