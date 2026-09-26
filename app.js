"use strict";

const MIRROR_ROOT = "https://raw.githubusercontent.com/P4suta/aozorabunko_text/master";
const DEFAULT_SPEED = 450;
const DEFAULT_GROUP_SIZE = 2;

const FALLBACK_BOOKS = [
  { id: "meros", title: "走れメロス", author: "太宰治", file: "走れメロス.txt", path: "作品/太宰治/走れメロス.txt" },
  { id: "ningen", title: "人間失格", author: "太宰治", file: "人間失格.txt", path: "作品/太宰治/人間失格.txt" },
  { id: "shayo", title: "斜陽", author: "太宰治", file: "斜陽.txt", path: "作品/太宰治/斜陽.txt" },
  { id: "kokoro", title: "こころ", author: "夏目漱石", file: "こころ.txt", path: "作品/夏目漱石/こころ.txt" },
  { id: "botchan", title: "坊っちゃん", author: "夏目漱石", file: "坊っちゃん.txt", path: "作品/夏目漱石/坊っちゃん.txt" },
  { id: "neko", title: "吾輩は猫である", author: "夏目漱石", file: "吾輩は猫である.txt", path: "作品/夏目漱石/吾輩は猫である.txt" },
  { id: "goshu", title: "セロ弾きのゴーシュ", author: "宮沢賢治", file: "セロ弾きのゴーシュ.txt", path: "作品/宮沢賢治/セロ弾きのゴーシュ.txt" }
];

let BOOKS = FALLBACK_BOOKS.slice();

const state = {
  activeBook: null,
  tokens: [],
  index: 0,
  speed: readNumber("sokudoku:speed", DEFAULT_SPEED, 100, 1200),
  groupSize: readNumber("sokudoku:group-size", DEFAULT_GROUP_SIZE, 1, 5),
  pauseAtPunctuation: readBoolean("sokudoku:punctuation", true),
  playing: false,
  timer: null,
  loading: false,
  libraryLength: "all",
  libraryStatus: "all",
  timeBudget: null,
  recommendedBookId: null,
  readElapsedMs: 0,
  playbackStartedAt: null,
  completionNextShortId: null,
  completionSameAuthorId: null
};

const els = {
  bookList: document.getElementById("bookList"),
  bookCount: document.getElementById("bookCount"),
  bookSearch: document.getElementById("bookSearch"),
  clearSearchButton: document.getElementById("clearSearchButton"),
  searchResultCount: document.getElementById("searchResultCount"),
  searchResultNote: document.getElementById("searchResultNote"),
  randomBookButton: document.getElementById("randomBookButton"),
  timeButtons: Array.from(document.querySelectorAll("[data-time]")),
  timePickerSpeed: document.getElementById("timePickerSpeed"),
  timeRecommendation: document.getElementById("timeRecommendation"),
  recommendedTitle: document.getElementById("recommendedTitle"),
  recommendedAuthor: document.getElementById("recommendedAuthor"),
  recommendedTime: document.getElementById("recommendedTime"),
  recommendedStatus: document.getElementById("recommendedStatus"),
  readRecommendedButton: document.getElementById("readRecommendedButton"),
  shuffleRecommendedButton: document.getElementById("shuffleRecommendedButton"),
  lengthButtons: Array.from(document.querySelectorAll("[data-length]")),
  statusButtons: Array.from(document.querySelectorAll("[data-status]")),
  authorButtons: Array.from(document.querySelectorAll("[data-author]")),
  currentAuthor: document.getElementById("currentAuthor"),
  currentTitle: document.getElementById("currentTitle"),
  sourceLink: document.getElementById("sourceLink"),
  previousWord: document.getElementById("previousWord"),
  currentWord: document.getElementById("currentWord"),
  nextWord: document.getElementById("nextWord"),
  progressSlider: document.getElementById("progressSlider"),
  positionText: document.getElementById("positionText"),
  percentText: document.getElementById("percentText"),
  remainingText: document.getElementById("remainingText"),
  playButton: document.getElementById("playButton"),
  playIcon: document.getElementById("playIcon"),
  playLabel: document.getElementById("playLabel"),
  backButton: document.getElementById("backButton"),
  forwardButton: document.getElementById("forwardButton"),
  speedSlider: document.getElementById("speedSlider"),
  speedValue: document.getElementById("speedValue"),
  resetSpeedButton: document.getElementById("resetSpeedButton"),
  groupSlider: document.getElementById("groupSlider"),
  groupValue: document.getElementById("groupValue"),
  punctuationToggle: document.getElementById("punctuationToggle"),
  themeButton: document.getElementById("themeButton"),
  fullscreenButton: document.getElementById("fullscreenButton"),
  loadingState: document.getElementById("loadingState"),
  errorState: document.getElementById("errorState"),
  errorMessage: document.getElementById("errorMessage"),
  retryButton: document.getElementById("retryButton"),
  backToLibraryButton: document.getElementById("backToLibraryButton"),
  reader: document.getElementById("reader"),
  completionState: document.getElementById("completionState"),
  completedTitle: document.getElementById("completedTitle"),
  completedAuthor: document.getElementById("completedAuthor"),
  completedTime: document.getElementById("completedTime"),
  completedSpeed: document.getElementById("completedSpeed"),
  nextShortButton: document.getElementById("nextShortButton"),
  nextShortTitle: document.getElementById("nextShortTitle"),
  nextShortAuthor: document.getElementById("nextShortAuthor"),
  sameAuthorButton: document.getElementById("sameAuthorButton"),
  sameAuthorTitle: document.getElementById("sameAuthorTitle"),
  sameAuthorName: document.getElementById("sameAuthorName"),
  completionBackButton: document.getElementById("completionBackButton")
};

function currentReadingMs() {
  const liveMs = state.playbackStartedAt
    ? Date.now() - state.playbackStartedAt
    : 0;
  return state.readElapsedMs + liveMs;
}

function formatReadingTime(ms) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return seconds + "秒";

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  if (minutes < 60) {
    return rest ? minutes + "分" + rest + "秒" : minutes + "分";
  }

  const hours = Math.floor(minutes / 60);
  const minuteRest = minutes % 60;
  return minuteRest ? hours + "時間" + minuteRest + "分" : hours + "時間";
}

function preferredCandidate(candidates) {
  if (!candidates.length) return null;

  const unread = candidates.filter(function (book) {
    return readingStatus(book) === "unread";
  });
  const pool = unread.length ? unread : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

function hideCompletionScreen() {
  els.completionState.hidden = true;
  els.reader.hidden = false;
}

function setCompletionChoice(button, titleEl, authorEl, book, emptyText) {
  if (!book) {
    button.disabled = true;
    titleEl.textContent = emptyText;
    authorEl.textContent = "";
    return;
  }

  button.disabled = false;
  titleEl.textContent = book.title;
  authorEl.textContent = book.author;
}

function showCompletionScreen() {
  if (!state.activeBook) return;

  stopPlayback();
  storageSet("sokudoku:completed:" + state.activeBook.id, true);

  if (state.tokens.length) {
    state.index = Math.max(0, state.tokens.length - 1);
  }

  saveProgress();
  renderBooks();

  const nextShort = preferredCandidate(
    BOOKS.filter(function (book) {
      const minutes = readingMinutes(book);
      return book.id !== state.activeBook.id &&
        minutes !== null &&
        minutes <= 5;
    })
  );

  const sameAuthor = preferredCandidate(
    BOOKS.filter(function (book) {
      return book.id !== state.activeBook.id &&
        book.author === state.activeBook.author;
    })
  );

  state.completionNextShortId = nextShort ? nextShort.id : null;
  state.completionSameAuthorId = sameAuthor ? sameAuthor.id : null;

  els.completedTitle.textContent = state.activeBook.title;
  els.completedAuthor.textContent = state.activeBook.author;
  els.completedTime.textContent = formatReadingTime(currentReadingMs());
  els.completedSpeed.textContent = state.speed.toLocaleString("ja-JP") + "語/分";

  setCompletionChoice(
    els.nextShortButton,
    els.nextShortTitle,
    els.nextShortAuthor,
    nextShort,
    "5分以内の候補がありません"
  );

  setCompletionChoice(
    els.sameAuthorButton,
    els.sameAuthorTitle,
    els.sameAuthorName,
    sameAuthor,
    "同じ作者の候補がありません"
  );

  els.reader.hidden = true;
  els.completionState.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function enterReadingMode(pushHistory) {
  document.body.classList.add("reading-mode");

  if (pushHistory && location.hash !== "#read") {
    history.pushState({ reading: true }, "", "#read");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function leaveReadingMode(useHistory) {
  stopPlayback();
  saveProgress();
  document.body.classList.remove("reading-mode");

  if (useHistory && location.hash === "#read") {
    history.back();
  } else if (location.hash === "#read") {
    history.replaceState(null, "", location.pathname + location.search);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openBookForReading(bookId) {
  enterReadingMode(true);
  loadBook(bookId, true);
}

function bookUrl(book) {
  const path = book.path || ["作品", book.author, book.file].join("/");
  const encodedPath = path
    .split("/")
    .map(function (part) { return encodeURIComponent(part); })
    .join("/");
  return MIRROR_ROOT + "/" + encodedPath;
}

async function loadCatalog() {
  try {
    const response = await fetch("./books.json", { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);

    const payload = await response.json();
    const books = Array.isArray(payload) ? payload : payload.books;

    if (!Array.isArray(books) || books.length < 1000) {
      throw new Error("作品一覧が不完全です");
    }

    BOOKS = books;
  } catch (error) {
    console.warn("Full catalog unavailable. Using fallback books.", error);
    BOOKS = FALLBACK_BOOKS.slice();
  }
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (_) {
  }
}

function readNumber(key, fallback, min, max) {
  const value = Number(storageGet(key));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readBoolean(key, fallback) {
  const value = storageGet(key);
  if (value === null) return fallback;
  return value === "true";
}

function cleanAozoraText(rawText) {
  const normalized = rawText.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  let lines = normalized.split("\n");

  const separatorIndexes = [];
  lines.forEach(function (line, index) {
    if (/^-{20,}\s*$/.test(line)) separatorIndexes.push(index);
  });

  if (separatorIndexes.length >= 2) {
    lines = lines.slice(separatorIndexes[1] + 1);
  }

  const footerIndex = lines.findIndex(function (line, index) {
    if (index < Math.floor(lines.length * 0.45)) return false;
    return /^(底本|入力|校正)[：:]/.test(line.trim()) ||
      /^青空文庫作成ファイル[：:]/.test(line.trim());
  });

  if (footerIndex > 0) {
    lines = lines.slice(0, footerIndex);
  }

  return lines.join("\n")
    .replace(/※?［＃[^］]*］/g, "")
    .replace(/｜/g, "")
    .replace(/《[^》]*》/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function segmentText(text) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    return segmentWithIntl(text);
  }
  return fallbackSegment(text);
}

function segmentWithIntl(text) {
  const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
  const tokens = [];
  let prefix = "";

  for (const part of segmenter.segment(text)) {
    const value = part.segment;

    if (/^\s+$/.test(value)) {
      if (value.includes("\n") && tokens.length) {
        tokens[tokens.length - 1].lineBreak = true;
      }
      continue;
    }

    if (part.isWordLike) {
      tokens.push({ text: prefix + value, lineBreak: false });
      prefix = "";
      continue;
    }

    if (/^[「『（【〈《〔［｛“‘]/.test(value)) {
      prefix += value;
    } else if (tokens.length) {
      tokens[tokens.length - 1].text += value;
    } else {
      prefix += value;
    }
  }

  if (prefix && tokens.length) {
    tokens[tokens.length - 1].text += prefix;
  }

  return tokens.filter(function (token) {
    return token.text.trim().length > 0;
  });
}

function fallbackSegment(text) {
  const parts = text
    .split(/(\s+|[、。！？!?「」『』（）【】])/)
    .filter(function (part) { return part && !/^\s+$/.test(part); });

  return parts.map(function (part) {
    return { text: part, lineBreak: false };
  });
}

function joinTokens(tokens) {
  let output = "";

  tokens.forEach(function (token) {
    const value = token.text;
    const needsSpace = output &&
      /[A-Za-z0-9]$/.test(output) &&
      /^[A-Za-z0-9]/.test(value);
    output += (needsSpace ? " " : "") + value;
  });

  return output;
}

function currentGroup() {
  return state.tokens.slice(state.index, state.index + state.groupSize);
}

function estimateWords(book) {
  const bytes = Number(book.bytes || 0);
  if (!bytes) return null;
  return Math.max(1, Math.round(bytes / 6));
}

function lengthClass(book) {
  const words = estimateWords(book);
  if (!words) return "unknown";
  if (words <= 8000) return "short";
  if (words <= 30000) return "medium";
  return "long";
}

function lengthLabel(book) {
  const labels = {
    short: "短め",
    medium: "中くらい",
    long: "長め",
    unknown: "長さ不明"
  };
  return labels[lengthClass(book)];
}

function readingStatus(book) {
  if (readBoolean("sokudoku:completed:" + book.id, false)) return "completed";
  const progress = Number(storageGet("sokudoku:progress:" + book.id) || 0);
  return progress > 0 ? "progress" : "unread";
}

function statusLabel(book) {
  const labels = {
    unread: "未読",
    progress: "途中",
    completed: "読了"
  };
  return labels[readingStatus(book)];
}

function readingMinutes(book) {
  const words = estimateWords(book);
  if (!words) return null;
  return Math.max(1, Math.ceil(words / state.speed));
}

function readingTimeLabel(book) {
  const minutes = readingMinutes(book);
  if (!minutes) return "時間目安なし";
  if (minutes < 60) return "約" + minutes + "分";

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? "約" + hours + "時間" + rest + "分" : "約" + hours + "時間";
}

function timeMatches(book) {
  if (state.timeBudget === null) return true;

  const minutes = readingMinutes(book);
  if (!minutes) return false;

  if (state.timeBudget === "long") {
    return minutes > 30;
  }

  return minutes <= state.timeBudget;
}

function renderTimeRecommendation(book) {
  els.timePickerSpeed.textContent = String(state.speed);

  if (!book || state.timeBudget === null) {
    state.recommendedBookId = null;
    els.timeRecommendation.hidden = true;
    return;
  }

  state.recommendedBookId = book.id;
  els.recommendedTitle.textContent = book.title;
  els.recommendedAuthor.textContent = book.author;
  els.recommendedTime.textContent = readingTimeLabel(book);
  els.recommendedStatus.textContent = statusLabel(book);
  els.timeRecommendation.hidden = false;
}

function chooseTimeRecommendation() {
  if (state.timeBudget === null) {
    renderTimeRecommendation(null);
    return;
  }

  let candidates = BOOKS.filter(timeMatches);
  const unread = candidates.filter(function (book) {
    return readingStatus(book) === "unread";
  });

  if (unread.length) candidates = unread;

  if (candidates.length > 1 && state.recommendedBookId) {
    const alternatives = candidates.filter(function (book) {
      return book.id !== state.recommendedBookId;
    });
    if (alternatives.length) candidates = alternatives;
  }

  if (candidates.length > 1 && state.activeBook) {
    const alternatives = candidates.filter(function (book) {
      return book.id !== state.activeBook.id;
    });
    if (alternatives.length) candidates = alternatives;
  }

  if (!candidates.length) {
    renderTimeRecommendation(null);
    return;
  }

  const book = candidates[Math.floor(Math.random() * candidates.length)];
  renderTimeRecommendation(book);
}

function filteredBooks() {
  const query = (els.bookSearch.value || "").trim().toLocaleLowerCase("ja");
  const terms = query
    .split(/[\s　]+/)
    .map(function (term) { return term.trim(); })
    .filter(Boolean);

  return BOOKS.filter(function (book) {
    const haystack = (book.title + " " + book.author).toLocaleLowerCase("ja");
    const searchMatches = terms.every(function (term) {
      return haystack.includes(term);
    });

    const lengthMatches = state.libraryLength === "all" ||
      lengthClass(book) === state.libraryLength;

    const statusMatches = state.libraryStatus === "all" ||
      readingStatus(book) === state.libraryStatus;

    const timeMatchesCurrent = timeMatches(book);

    return searchMatches && lengthMatches && statusMatches && timeMatchesCurrent;
  });
}

function updateFilterButtons() {
  els.lengthButtons.forEach(function (button) {
    button.classList.toggle("is-active", button.dataset.length === state.libraryLength);
  });
  els.statusButtons.forEach(function (button) {
    button.classList.toggle("is-active", button.dataset.status === state.libraryStatus);
  });
  els.timeButtons.forEach(function (button) {
    const value = button.dataset.time === "long" ? "long" : Number(button.dataset.time);
    button.classList.toggle("is-active", value === state.timeBudget);
  });
}

function renderBooks() {
  const visible = filteredBooks();
  const displayBooks = visible.slice(0, 80);
  const hasFilters = Boolean(
    (els.bookSearch.value || "").trim() ||
    state.libraryLength !== "all" ||
    state.libraryStatus !== "all" ||
    state.timeBudget !== null
  );

  els.bookList.replaceChildren();

  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty-search";
    empty.textContent = "該当する作品がありません。検索語や条件を少し広げてみてください。";
    els.bookList.append(empty);
  }

  displayBooks.forEach(function (book) {
    const button = document.createElement("button");
    button.className = "book-button";
    button.type = "button";
    button.dataset.bookId = book.id;
    button.setAttribute("aria-current", state.activeBook && state.activeBook.id === book.id ? "true" : "false");

    const label = document.createElement("span");
    const title = document.createElement("strong");
    const author = document.createElement("small");
    const meta = document.createElement("span");
    const lengthTag = document.createElement("span");
    const timeTag = document.createElement("span");
    const statusTag = document.createElement("span");
    const arrow = document.createElement("span");

    title.textContent = book.title;
    author.textContent = book.author;

    meta.className = "book-card-meta";
    lengthTag.className = "book-tag";
    timeTag.className = "book-tag";
    statusTag.className = "book-tag book-tag--status";
    lengthTag.textContent = lengthLabel(book);
    timeTag.textContent = readingTimeLabel(book);
    statusTag.textContent = statusLabel(book);
    meta.append(lengthTag, timeTag, statusTag);

    arrow.className = "book-arrow";
    arrow.textContent = "›";

    label.append(title, author, meta);
    button.append(label, arrow);

    button.addEventListener("click", function () {
      openBookForReading(book.id);
    });

    els.bookList.append(button);
  });

  els.bookCount.textContent = BOOKS.length.toLocaleString("ja-JP");
  els.searchResultCount.textContent = visible.length.toLocaleString("ja-JP") + "件";
  els.searchResultNote.textContent = !visible.length
    ? "条件を変えてみてください"
    : visible.length > 80
      ? "先頭80件を表示中"
      : hasFilters
        ? "条件に合う作品です"
        : "検索・長さ・読書状況で絞れます";
  els.randomBookButton.disabled = visible.length === 0;
  updateFilterButtons();
}

function loadRandomBook() {
  let candidates = filteredBooks();

  if (!candidates.length || state.loading) return;

  if (candidates.length > 1 && state.activeBook) {
    const alternatives = candidates.filter(function (book) {
      return book.id !== state.activeBook.id;
    });
    if (alternatives.length) candidates = alternatives;
  }

  const randomIndex = Math.floor(Math.random() * candidates.length);
  openBookForReading(candidates[randomIndex].id);
}

async function loadBook(bookId, restoreProgress) {
  const book = BOOKS.find(function (item) { return item.id === bookId; });
  if (!book || state.loading) return;

  saveProgress();
  stopPlayback();
  hideCompletionScreen();
  state.loading = true;
  state.activeBook = book;
  state.tokens = [];
  state.index = 0;
  state.readElapsedMs = Math.max(
    0,
    Number(storageGet("sokudoku:reading-ms:" + book.id) || 0)
  );
  state.playbackStartedAt = null;

  els.loadingState.hidden = false;
  els.errorState.hidden = true;
  updateBookMeta();
  renderBooks();

  try {
    const response = await fetch(bookUrl(book), { cache: "default" });
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const rawText = await response.text();
    const body = cleanAozoraText(rawText);
    const tokens = segmentText(body);

    if (tokens.length < 10) {
      throw new Error("本文の解析結果が短すぎます");
    }

    state.tokens = tokens;

    if (restoreProgress) {
      const saved = readNumber("sokudoku:progress:" + book.id, 0, 0, Math.max(0, tokens.length - 1));
      state.index = Math.min(saved, Math.max(0, tokens.length - 1));
    }

    storageSet("sokudoku:last-book", book.id);
    renderReader();
  } catch (error) {
    console.error(error);
    els.errorMessage.textContent =
      "本文データの取得に失敗しました。ネット接続または取得元の状態を確認してください。";
    els.errorState.hidden = false;
  } finally {
    state.loading = false;
    els.loadingState.hidden = true;
  }
}

function updateBookMeta() {
  if (!state.activeBook) return;
  els.currentAuthor.textContent = state.activeBook.author;
  els.currentTitle.textContent = state.activeBook.title;
  els.sourceLink.href = bookUrl(state.activeBook);
}

function renderReader() {
  const total = state.tokens.length;

  if (!total) {
    els.currentWord.textContent = "—";
    els.previousWord.textContent = "";
    els.nextWord.textContent = "";
    updateProgressMeta();
    return;
  }

  state.index = Math.min(Math.max(0, state.index), total - 1);

  const group = currentGroup();
  const previousStart = Math.max(0, state.index - state.groupSize);
  const nextStart = state.index + state.groupSize;

  els.currentWord.textContent = joinTokens(group);
  els.previousWord.textContent = joinTokens(state.tokens.slice(previousStart, state.index));
  els.nextWord.textContent = joinTokens(state.tokens.slice(nextStart, nextStart + state.groupSize));

  updateProgressMeta();
}

function updateProgressMeta() {
  const total = state.tokens.length;
  const groupLength = currentGroup().length;
  const readPosition = total ? Math.min(total, state.index + groupLength) : 0;
  const ratio = total > 1 ? state.index / (total - 1) : 0;
  const percent = Math.round(ratio * 100);
  const remainingWords = Math.max(0, total - readPosition);
  const remainingMinutes = total ? Math.ceil(remainingWords / state.speed) : 0;

  els.progressSlider.value = String(Math.round(ratio * 1000));
  els.positionText.textContent =
    readPosition.toLocaleString("ja-JP") + " / " + total.toLocaleString("ja-JP") + "語";
  els.percentText.textContent = percent + "%";
  els.remainingText.textContent = total ? "残り 約" + remainingMinutes + "分" : "残り --分";
}

function delayForCurrentGroup() {
  const group = currentGroup();
  if (!group.length) return 0;

  let delay = (60000 * group.length) / state.speed;

  if (state.pauseAtPunctuation) {
    const text = joinTokens(group);
    const hasLineBreak = group.some(function (token) { return token.lineBreak; });

    if (/[。！？!?」』）】]$/.test(text)) {
      delay *= 1.85;
    } else if (/[、，,；;：:]$/.test(text)) {
      delay *= 1.32;
    } else if (hasLineBreak) {
      delay *= 1.22;
    }
  }

  return Math.max(40, delay);
}

function scheduleNext() {
  clearTimeout(state.timer);

  if (!state.playing || !state.tokens.length) return;

  state.timer = window.setTimeout(function () {
    const nextIndex = state.index + state.groupSize;

    if (nextIndex >= state.tokens.length) {
      showCompletionScreen();
      return;
    }

    state.index = nextIndex;
    renderReader();
    saveProgress();
    scheduleNext();
  }, delayForCurrentGroup());
}

function startPlayback() {
  if (!state.tokens.length || state.loading) return;
  if (state.index >= state.tokens.length - 1) state.index = 0;

  state.playbackStartedAt = Date.now();
  state.playing = true;
  els.playIcon.textContent = "Ⅱ";
  els.playLabel.textContent = "停止";
  els.playButton.setAttribute("aria-label", "停止");
  scheduleNext();
}

function stopPlayback() {
  if (state.playbackStartedAt) {
    state.readElapsedMs += Date.now() - state.playbackStartedAt;
    state.playbackStartedAt = null;

    if (state.activeBook) {
      storageSet(
        "sokudoku:reading-ms:" + state.activeBook.id,
        Math.round(state.readElapsedMs)
      );
    }
  }

  state.playing = false;
  clearTimeout(state.timer);
  state.timer = null;
  els.playIcon.textContent = "▶";
  els.playLabel.textContent = "開始";
  els.playButton.setAttribute("aria-label", "再生");
}

function togglePlayback() {
  if (state.playing) {
    stopPlayback();
    saveProgress();
  } else {
    startPlayback();
  }
}

function moveByGroups(amount) {
  if (!state.tokens.length) return;
  state.index = Math.min(
    state.tokens.length - 1,
    Math.max(0, state.index + amount * state.groupSize)
  );
  renderReader();
  saveProgress();

  if (amount > 0 && state.index >= state.tokens.length - 1) {
    showCompletionScreen();
    return;
  }

  if (state.playing) scheduleNext();
}

function setSpeed(speed) {
  state.speed = Math.min(1200, Math.max(100, speed));
  els.speedSlider.value = String(state.speed);
  els.speedValue.textContent = String(state.speed);
  storageSet("sokudoku:speed", state.speed);
  updateProgressMeta();
  els.timePickerSpeed.textContent = String(state.speed);
  if (state.timeBudget !== null) chooseTimeRecommendation();
  renderBooks();

  if (state.playing) scheduleNext();
}

function setGroupSize(size) {
  state.groupSize = Math.min(5, Math.max(1, size));
  els.groupSlider.value = String(state.groupSize);
  els.groupValue.textContent = String(state.groupSize);
  storageSet("sokudoku:group-size", state.groupSize);
  renderReader();

  if (state.playing) scheduleNext();
}

function saveProgress() {
  if (!state.activeBook || !state.tokens.length) return;
  storageSet("sokudoku:progress:" + state.activeBook.id, state.index);
  storageSet(
    "sokudoku:reading-ms:" + state.activeBook.id,
    Math.round(currentReadingMs())
  );
}

function seekFromSlider(value) {
  if (!state.tokens.length) return;
  const ratio = Number(value) / 1000;
  const rawIndex = Math.round(ratio * (state.tokens.length - 1));
  state.index = Math.max(0, Math.min(state.tokens.length - 1, rawIndex));
  renderReader();
  saveProgress();

  if (state.playing) scheduleNext();
}

function initializeTheme() {
  const saved = storageGet("sokudoku:theme");
  const prefersDark = window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  storageSet("sokudoku:theme", next);
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    console.warn("Fullscreen is not available.", error);
  }
}

els.bookSearch.addEventListener("input", renderBooks);

els.timeButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    state.timeBudget = button.dataset.time === "long"
      ? "long"
      : Number(button.dataset.time);
    els.bookSearch.value = "";
    state.libraryLength = "all";
    state.libraryStatus = "all";
    chooseTimeRecommendation();
    renderBooks();
  });
});

els.readRecommendedButton.addEventListener("click", function () {
  if (state.recommendedBookId) {
    openBookForReading(state.recommendedBookId);
  }
});

els.shuffleRecommendedButton.addEventListener("click", function () {
  chooseTimeRecommendation();
});

els.lengthButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    state.libraryLength = button.dataset.length || "all";
    renderBooks();
  });
});

els.statusButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    state.libraryStatus = button.dataset.status || "all";
    renderBooks();
  });
});

els.authorButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    els.bookSearch.value = button.dataset.author || "";
    renderBooks();
  });
});

els.clearSearchButton.addEventListener("click", function () {
  els.bookSearch.value = "";
  state.libraryLength = "all";
  state.libraryStatus = "all";
  state.timeBudget = null;
  renderTimeRecommendation(null);
  renderBooks();
  els.bookSearch.focus();
});

els.randomBookButton.addEventListener("click", loadRandomBook);

els.nextShortButton.addEventListener("click", function () {
  if (state.completionNextShortId) {
    openBookForReading(state.completionNextShortId);
  }
});

els.sameAuthorButton.addEventListener("click", function () {
  if (state.completionSameAuthorId) {
    openBookForReading(state.completionSameAuthorId);
  }
});

els.completionBackButton.addEventListener("click", function () {
  leaveReadingMode(true);
});

els.playButton.addEventListener("click", togglePlayback);
els.backButton.addEventListener("click", function () { moveByGroups(-1); });
els.forwardButton.addEventListener("click", function () { moveByGroups(1); });

els.speedSlider.addEventListener("input", function () {
  setSpeed(Number(els.speedSlider.value));
});

els.resetSpeedButton.addEventListener("click", function () {
  setSpeed(DEFAULT_SPEED);
});

els.groupSlider.addEventListener("input", function () {
  setGroupSize(Number(els.groupSlider.value));
});

els.punctuationToggle.addEventListener("change", function () {
  state.pauseAtPunctuation = els.punctuationToggle.checked;
  storageSet("sokudoku:punctuation", state.pauseAtPunctuation);

  if (state.playing) scheduleNext();
});

els.progressSlider.addEventListener("input", function () {
  seekFromSlider(els.progressSlider.value);
});

els.themeButton.addEventListener("click", toggleTheme);
els.fullscreenButton.addEventListener("click", toggleFullscreen);

els.backToLibraryButton.addEventListener("click", function () {
  leaveReadingMode(true);
});

window.addEventListener("popstate", function () {
  if (location.hash === "#read") {
    document.body.classList.add("reading-mode");
  } else {
    document.body.classList.remove("reading-mode");
    stopPlayback();
    saveProgress();
  }
});

els.retryButton.addEventListener("click", function () {
  if (state.activeBook) loadBook(state.activeBook.id, true);
});

document.addEventListener("keydown", function (event) {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

  if (event.code === "Space" && !isTyping) {
    event.preventDefault();
    togglePlayback();
    return;
  }

  if (isTyping) return;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveByGroups(-1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    moveByGroups(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    setSpeed(state.speed + 25);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    setSpeed(state.speed - 25);
  }
});

window.addEventListener("beforeunload", saveProgress);
document.addEventListener("visibilitychange", function () {
  if (document.hidden && state.playing) {
    stopPlayback();
    saveProgress();
  }
});

initializeTheme();
els.speedSlider.value = String(state.speed);
els.speedValue.textContent = String(state.speed);
els.timePickerSpeed.textContent = String(state.speed);
els.groupSlider.value = String(state.groupSize);
els.groupValue.textContent = String(state.groupSize);
els.punctuationToggle.checked = state.pauseAtPunctuation;

async function initializeLibrary() {
  await loadCatalog();
  renderBooks();

  const savedBook = storageGet("sokudoku:last-book");
  const savedExists = BOOKS.some(function (book) { return book.id === savedBook; });
  const defaultBook = BOOKS.find(function (book) {
    return book.author === "太宰治" && book.title === "走れメロス";
  }) || BOOKS[0];

  const initialBookId = savedExists ? savedBook : defaultBook.id;
  await loadBook(initialBookId, true);

  if (location.hash === "#read") {
    enterReadingMode(false);
  }
}

initializeLibrary();
