#!/usr/bin/env python3
"""Build books.json from the public aozorabunko_text repository tree."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

TREE_URL = "https://api.github.com/repos/P4suta/aozorabunko_text/git/trees/master?recursive=1"
OUTPUT = Path("books.json")

LEGACY_IDS = {
    "作品/太宰治/走れメロス.txt": "meros",
    "作品/太宰治/人間失格.txt": "ningen",
    "作品/太宰治/斜陽.txt": "shayo",
    "作品/夏目漱石/こころ.txt": "kokoro",
    "作品/夏目漱石/坊っちゃん.txt": "botchan",
    "作品/夏目漱石/吾輩は猫である.txt": "neko",
    "作品/宮沢賢治/セロ弾きのゴーシュ.txt": "goshu",
}


def fetch_tree() -> dict:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "nano-tani-sokudoku-catalog-builder",
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = "Bearer " + token

    request = Request(TREE_URL, headers=headers)
    with urlopen(request, timeout=60) as response:
        return json.load(response)


def stable_id(path: str) -> str:
    if path in LEGACY_IDS:
        return LEGACY_IDS[path]
    return hashlib.sha1(path.encode("utf-8")).hexdigest()[:16]


def main() -> None:
    payload = fetch_tree()

    if payload.get("truncated"):
        raise RuntimeError("GitHub tree response was truncated; refusing to publish an incomplete catalog")

    books = []
    for item in payload.get("tree", []):
        path = item.get("path", "")
        if item.get("type") != "blob" or not path.startswith("作品/") or not path.endswith(".txt"):
            continue

        parts = path.split("/")
        if len(parts) != 3:
            continue

        _, author, filename = parts
        title = filename[:-4]
        if not author or not title:
            continue

        books.append(
            {
                "id": stable_id(path),
                "title": title,
                "author": author,
                "file": filename,
                "path": path,
            }
        )

    books.sort(key=lambda book: (book["author"], book["title"], book["path"]))

    if len(books) < 1000:
        raise RuntimeError(f"Catalog unexpectedly small: {len(books)} works")

    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "P4suta/aozorabunko_text",
        "count": len(books),
        "books": books,
    }

    OUTPUT.write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote {len(books)} works to {OUTPUT}")


if __name__ == "__main__":
    main()
