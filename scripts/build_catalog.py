#!/usr/bin/env python3
"""Build a public-domain-only books.json for the speed-reading site.

The text files come from the unofficial P4suta/aozorabunko_text mirror, but
eligibility is decided from Aozora Bunko's official extended UTF-8 metadata.

A work is eligible only when every metadata row for that work says both:
- 作品著作権フラグ == "なし"
- 人物著作権フラグ == "なし"

If the official rights metadata cannot be fetched or parsed, this builder fails
closed and publishes only a small explicit allowlist instead of the full mirror.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import sys
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

TREE_URL = "https://api.github.com/repos/P4suta/aozorabunko_text/git/trees/master?recursive=1"
AOZORA_METADATA_URL = "https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip"
OUTPUT = Path("books.json")

RIGHTS_POLICY = "public-domain-only"
MIN_EXPECTED_SAFE_WORKS = 10_000

# Explicit fail-closed allowlist. These paths are used only when official
# metadata cannot be loaded. Keeping this list deliberately small prevents a
# metadata outage from turning into an accidental all-works publication.
LEGACY_IDS = {
    "作品/太宰治/走れメロス.txt": "meros",
    "作品/太宰治/人間失格.txt": "ningen",
    "作品/太宰治/斜陽.txt": "shayo",
    "作品/夏目漱石/こころ.txt": "kokoro",
    "作品/夏目漱石/坊っちゃん.txt": "botchan",
    "作品/夏目漱石/吾輩は猫である.txt": "neko",
    "作品/宮沢賢治/セロ弾きのゴーシュ.txt": "goshu",
}


def request_headers() -> dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "User-Agent": "nano-tani-sokudoku-catalog-builder",
    }


def fetch_tree() -> dict:
    headers = request_headers()
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = "Bearer " + token

    request = Request(TREE_URL, headers=headers)
    with urlopen(request, timeout=60) as response:
        return json.load(response)


def fetch_official_metadata_rows() -> list[dict[str, str]]:
    request = Request(
        AOZORA_METADATA_URL,
        headers={"User-Agent": "nano-tani-sokudoku-catalog-builder"},
    )
    with urlopen(request, timeout=90) as response:
        archive_bytes = response.read()

    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        candidates = [
            name
            for name in archive.namelist()
            if name.endswith("list_person_all_extended_utf8.csv")
        ]
        if not candidates:
            raise RuntimeError("Official Aozora metadata ZIP did not contain the expected CSV")

        with archive.open(candidates[0]) as raw:
            wrapper = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
            reader = csv.DictReader(wrapper)
            required = {
                "作品ID",
                "作品名",
                "作品著作権フラグ",
                "人物著作権フラグ",
                "図書カードURL",
            }
            if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
                missing = sorted(required - set(reader.fieldnames or []))
                raise RuntimeError(f"Official metadata missing columns: {missing}")

            rows = []
            for row in reader:
                rows.append({key: (value or "").strip() for key, value in row.items() if key})

    if len(rows) < MIN_EXPECTED_SAFE_WORKS:
        raise RuntimeError(f"Official metadata unexpectedly small: {len(rows)} rows")

    return rows


def stable_id(path: str) -> str:
    if path in LEGACY_IDS:
        return LEGACY_IDS[path]
    return hashlib.sha1(path.encode("utf-8")).hexdigest()[:16]


def row_author(row: dict[str, str]) -> str:
    if row.get("姓名"):
        return row["姓名"].replace(" ", "").replace("　", "")
    return (row.get("姓", "") + row.get("名", "")).replace(" ", "").replace("　", "")


def work_is_public_domain(rows: list[dict[str, str]]) -> bool:
    if not rows:
        return False
    return all(
        row.get("作品著作権フラグ") == "なし"
        and row.get("人物著作権フラグ") == "なし"
        for row in rows
    )


def build_rights_index(rows: list[dict[str, str]]) -> tuple[dict[tuple[str, str], dict], int]:
    by_work: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        work_id = row.get("作品ID", "")
        if work_id:
            by_work[work_id].append(row)

    safe_work_ids = {
        work_id
        for work_id, work_rows in by_work.items()
        if work_is_public_domain(work_rows)
    }

    if len(safe_work_ids) < MIN_EXPECTED_SAFE_WORKS:
        raise RuntimeError(
            f"Public-domain work count unexpectedly small: {len(safe_work_ids)}"
        )

    # Associate every author/title spelling seen in the official metadata with
    # its work IDs. A mirror path is accepted only when the key maps uniquely
    # to one work and that work is public-domain according to all its rows.
    work_ids_by_key: dict[tuple[str, str], set[str]] = defaultdict(set)

    for work_id, work_rows in by_work.items():
        title = next((row.get("作品名", "") for row in work_rows if row.get("作品名")), "")
        if not title:
            continue

        kinds = {
            row.get("文字遣い種別", "")
            for row in work_rows
            if row.get("文字遣い種別")
        }
        authors = {row_author(row) for row in work_rows if row_author(row)}

        for author in authors:
            work_ids_by_key[(author, title)].add(work_id)
            for kind in kinds:
                work_ids_by_key[(author, f"{title}（{kind}）")].add(work_id)

    safe_index: dict[tuple[str, str], dict] = {}
    for key, work_ids in work_ids_by_key.items():
        if len(work_ids) != 1:
            continue

        work_id = next(iter(work_ids))
        if work_id not in safe_work_ids:
            continue

        work_rows = by_work[work_id]
        card_url = next(
            (row.get("図書カードURL", "") for row in work_rows if row.get("図書カードURL")),
            "",
        )
        safe_index[key] = {
            "workId": work_id,
            "cardUrl": card_url,
        }

    return safe_index, len(safe_work_ids)


def base_title(label: str) -> str:
    # P4suta's mirror appends （文字遣い種別） or a zip basename when multiple
    # source files collide on the same human-readable author/title path.
    match = re.match(r"^(.*)（[^（）]+）$", label)
    return match.group(1) if match else label


def match_rights(
    safe_index: dict[tuple[str, str], dict],
    author: str,
    label: str,
) -> dict | None:
    exact = safe_index.get((author, label))
    if exact:
        return exact

    stripped = base_title(label)
    if stripped != label:
        return safe_index.get((author, stripped))

    return None


def fallback_books(tree_items: list[dict]) -> list[dict]:
    sizes = {
        item.get("path", ""): int(item.get("size") or 0)
        for item in tree_items
        if item.get("type") == "blob"
    }

    books = []
    for path, book_id in LEGACY_IDS.items():
        _, author, filename = path.split("/")
        books.append(
            {
                "id": book_id,
                "title": filename[:-4],
                "author": author,
                "file": filename,
                "path": path,
                "bytes": sizes.get(path, 0),
                "rights": "public-domain",
                "rightsVerifiedBy": "explicit-allowlist",
            }
        )

    books.sort(key=lambda book: (book["author"], book["title"], book["path"]))
    return books


def build_books(tree_items: list[dict], safe_index: dict[tuple[str, str], dict]) -> list[dict]:
    books = []

    for item in tree_items:
        path = item.get("path", "")
        if item.get("type") != "blob" or not path.startswith("作品/") or not path.endswith(".txt"):
            continue

        parts = path.split("/")
        if len(parts) != 3:
            continue

        _, author, filename = parts
        label = filename[:-4]
        if not author or not label:
            continue

        rights = match_rights(safe_index, author, label)
        if not rights:
            continue

        books.append(
            {
                "id": stable_id(path),
                "title": label,
                "author": author,
                "file": filename,
                "path": path,
                "bytes": int(item.get("size") or 0),
                "workId": rights["workId"],
                "cardUrl": rights["cardUrl"],
                "rights": "public-domain",
                "rightsVerifiedBy": "aozora-official-metadata",
            }
        )

    books.sort(key=lambda book: (book["author"], book["title"], book["path"]))
    return books


def write_output(books: list[dict], mode: str, safe_work_count: int | None) -> None:
    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "P4suta/aozorabunko_text",
        "rightsPolicy": RIGHTS_POLICY,
        "rightsSource": AOZORA_METADATA_URL,
        "rightsVerificationMode": mode,
        "officialPublicDomainWorkCount": safe_work_count,
        "count": len(books),
        "books": books,
    }

    OUTPUT.write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"Wrote {len(books)} public-domain works to {OUTPUT} "
        f"(rights mode: {mode})"
    )


def main() -> None:
    payload = fetch_tree()

    if payload.get("truncated"):
        raise RuntimeError("GitHub tree response was truncated; refusing incomplete mirror data")

    tree_items = payload.get("tree", [])

    try:
        rows = fetch_official_metadata_rows()
        safe_index, safe_work_count = build_rights_index(rows)
        books = build_books(tree_items, safe_index)

        if len(books) < MIN_EXPECTED_SAFE_WORKS:
            raise RuntimeError(
                f"Rights-filtered mirror catalog unexpectedly small: {len(books)}"
            )

        write_output(
            books,
            mode="aozora-official-metadata",
            safe_work_count=safe_work_count,
        )
    except Exception as exc:
        # Fail closed: never fall back to the entire mirror.
        print(
            "WARNING: official rights verification failed; "
            "publishing only the explicit safe allowlist. "
            f"Reason: {exc}",
            file=sys.stderr,
        )
        books = fallback_books(tree_items)
        write_output(
            books,
            mode="explicit-safe-fallback",
            safe_work_count=None,
        )


if __name__ == "__main__":
    main()
