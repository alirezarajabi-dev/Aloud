(function () {
  'use strict';

  // ---------------------------------------------------------------- state
  const S = {
    authed: false,
    settings: {},
    chapters: [],
    entries: [],
    view: 'loading',
    openChapter: null,
    queue: [],          // entries queued by "play chapter"
    playingId: null
  };
  const MOODS = ['calm', 'hopeful', 'thoughtful', 'sad', 'upset'];
  const app = document.getElementById('app');
  const sheetRoot = document.getElementById('sheet-root');
  const audio = new Audio();
  audio.preload = 'metadata';

  // ---------------------------------------------------------------- text helpers
  const lang = () => (S.settings.lang === 'en' ? 'en' : 'fa');
  function t(key, vars) {
    const table = window.I18N[lang()];
    let s = key.split('.').reduce((o, k) => (o ? o[k] : undefined), table);
    if (s === undefined) s = key;
    if (vars) Object.keys(vars).forEach((k) => { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const num = (n) => Number(n).toLocaleString(lang() === 'fa' ? 'fa-IR' : 'en-US', { useGrouping: false });
  function fmtDate(iso, opts) {
    const loc = lang() === 'fa' ? 'fa-IR-u-ca-persian' : 'en-US';
    try { const out = new Intl.DateTimeFormat(loc, opts).format(new Date(iso)); return lang() === 'fa' ? out.replace(/,/g, '،') : out; } catch (e) { return new Date(iso).toLocaleDateString(); }
  }
  const fmtDay = (iso) => fmtDate(iso, { day: 'numeric', month: 'long' });
  // A middle dot reads like the Persian zero (۰), so Persian text uses the Persian comma instead.
  const SEP = () => (lang() === 'fa' ? '، ' : ' · ');
  const fmtDayTime = (iso) => fmtDay(iso) + SEP() + fmtDate(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtLong = (iso) => fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const p = (n) => String(n).padStart(2, '0');
    const out = (h ? h + ':' + p(m) : p(m)) + ':' + p(s);
    return lang() === 'fa' ? out.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) : out;
  }
  function fmtLen(sec) {
    if (!sec) return '';
    if (sec < 60) return t('lessThanMinute');
    return t('minutes', { n: num(Math.round(sec / 60)) });
  }
  const entryTitle = (e) => e.title || t('untitled');
  // English needs singular forms ("1 page"); Persian uses the same form for every number.
  function pagesText(n) { return lang() === 'en' && n === 1 ? '1 page' : t('pagesCount', { n: num(n) }); }
  function chaptersPagesText(c, p) {
    if (lang() !== 'en') return t('chaptersPages', { c: num(c), p: num(p) });
    return (c === 1 ? '1 chapter' : c + ' chapters') + ' · ' + (p === 1 ? '1 page' : p + ' pages');
  }

  // ---------------------------------------------------------------- icons
  const I = {
    gear: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    mic: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>',
    back: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    play: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    mark: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    markFill: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    book: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/><path d="M9 7h6"/></svg>',
    cal: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    rew: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    fwd: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>'
  };

  // ---------------------------------------------------------------- storage (all on this device)
  // Everything lives in the browser's IndexedDB on this phone: nothing is sent anywhere.
  //   kv        settings
  //   chapters  { id, title, createdAt }
  //   entries   page metadata { id, chapterId, title, mood, startedAt, durationSec, bookmarks, mime, ... }
  //   audio     { id, blob }  (same id as the entry)
  //   sessions + chunks   the recording in progress, saved every 5 seconds so nothing is lost
  const DB = {
    _db: null,
    open() {
      if (this._db) return Promise.resolve(this._db);
      return new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('no_idb'));
        const r = indexedDB.open('aloud', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          const c = d.createObjectStore('chunks', { keyPath: 'k', autoIncrement: true });
          c.createIndex('session', 'session');
          d.createObjectStore('sessions', { keyPath: 'id' });
          d.createObjectStore('kv');
          d.createObjectStore('chapters', { keyPath: 'id' });
          d.createObjectStore('entries', { keyPath: 'id' });
          d.createObjectStore('audio', { keyPath: 'id' });
        };
        r.onsuccess = () => { this._db = r.result; resolve(this._db); };
        r.onerror = () => reject(r.error);
      });
    },
    async tx(stores, mode, fn) {
      const d = await this.open();
      return new Promise((resolve, reject) => {
        const x = d.transaction(stores, mode);
        const out = fn(Array.isArray(stores) ? stores.map((n) => x.objectStore(n)) : x.objectStore(stores));
        x.oncomplete = () => resolve(out && typeof out === 'object' && 'result' in out ? out.result : out);
        x.onerror = () => reject(x.error);
        x.onabort = () => reject(x.error || new Error('aborted'));
      });
    },
    put(store, v, key) { return this.tx(store, 'readwrite', (s) => (key === undefined ? s.put(v) : s.put(v, key))); },
    get(store, k) { return this.tx(store, 'readonly', (s) => s.get(k)); },
    del(store, k) { return this.tx(store, 'readwrite', (s) => s.delete(k)); },
    all(store) { return this.tx(store, 'readonly', (s) => s.getAll()); },
    chunksOf(session) { return this.tx('chunks', 'readonly', (s) => s.index('session').getAll(session)); },
    async dropSession(session) {
      const keys = await this.tx('chunks', 'readonly', (s) => s.index('session').getAllKeys(session));
      await this.tx('chunks', 'readwrite', (s) => { keys.forEach((k) => s.delete(k)); });
      await this.del('sessions', session);
    }
  };
  const safe = (p) => p.catch((e) => { console.warn(e); });
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const nowIso = () => new Date().toISOString();

  async function loadState() {
    S.settings = (await DB.get('kv', 'settings')) || {};
    S.chapters = (await DB.all('chapters')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    S.entries = (await DB.all('entries')).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  async function putSettings(patch) {
    S.settings = Object.assign({}, S.settings, patch);
    if (!S.settings.createdAt) S.settings.createdAt = nowIso();
    await DB.put('kv', S.settings, 'settings');
  }

  // Chapters the app makes by itself follow the interface language; chapters you name keep your words.
  const AUTO_TITLES = ['فصل اول', 'Chapter One'];
  const isAutoChapter = (ch) => !!ch && (ch.auto === true || (ch.auto === undefined && AUTO_TITLES.includes(ch.title)));
  const chTitle = (ch) => (!ch ? '' : isAutoChapter(ch) ? t('defaultChapter') : (lang() === 'en' && ch.titleEn) ? ch.titleEn : ch.title);

  async function createChapter(title, auto) {
    const ch = { id: newId(), title: String(title).trim().slice(0, 120), auto: !!auto, createdAt: nowIso() };
    await DB.put('chapters', ch);
    S.chapters.push(ch);
    return ch;
  }

  async function ensureChapter() {
    return currentChapter() || createChapter(t('defaultChapter'), true);
  }

  // Saves the page and its sound in one step: either both are stored or neither is.
  async function addEntry(meta, blob) {
    const entry = {
      id: newId(),
      chapterId: meta.chapterId || (await ensureChapter()).id,
      title: String(meta.title || '').trim().slice(0, 200),
      mood: MOODS.includes(meta.mood) ? meta.mood : null,
      startedAt: meta.startedAt || nowIso(),
      durationSec: Math.max(0, Math.round(Number(meta.durationSec) || 0)),
      bookmarks: Array.isArray(meta.bookmarks) ? meta.bookmarks : [],
      mime: (blob.type || meta.mime || 'audio/mp4').split(';')[0],
      bytes: blob.size,
      source: meta.source || 'recorded',
      importKey: meta.importKey || null,
      createdAt: nowIso()
    };
    await DB.tx(['entries', 'audio'], 'readwrite', ([es, as]) => { es.put(entry); as.put({ id: entry.id, blob }); });
    S.entries.push(entry);
    S.entries.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    return entry;
  }

  async function updateEntry(id, patch) {
    const e = S.entries.find((x) => x.id === id);
    if (!e) return null;
    Object.assign(e, patch);
    await DB.put('entries', e);
    return e;
  }

  async function removeEntry(id) {
    await DB.tx(['entries', 'audio'], 'readwrite', ([es, as]) => { es.delete(id); as.delete(id); });
    S.entries = S.entries.filter((e) => e.id !== id);
  }

  // A recording left in progress (closed tab, crash, phone restarted) becomes an untitled page.
  async function recoverSessions() {
    let sessions = [];
    try { sessions = await DB.all('sessions'); } catch (e) { return; }
    let found = 0;
    for (const s of sessions) {
      if (Rec.sessionId === s.id) continue;
      const chunks = (await DB.chunksOf(s.id)).sort((a, b) => a.seq - b.seq);
      if (chunks.length) {
        const blob = new Blob(chunks.map((c) => c.blob), { type: s.mime });
        const chOk = S.chapters.some((c) => c.id === s.chapterId);
        await addEntry({ startedAt: s.startedAt, durationSec: s.elapsed || 0, bookmarks: s.bookmarks || [], chapterId: chOk ? s.chapterId : null, title: '' }, blob);
        found++;
      }
      await DB.dropSession(s.id);
    }
    if (found) toast(t('recovered'));
  }

  // Ask the browser not to clear this site's storage on its own.
  async function askPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
    } catch (e) { /* not supported */ }
  }

  // ---------------------------------------------------------------- ui helpers
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
  }

  function applyLangTheme() {
    const l = lang();
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'fa' ? 'rtl' : 'ltr';
    document.title = t('appName');
    const pref = S.settings.theme || 'light';
    const h = new Date().getHours();
    const theme = pref === 'auto' ? (h >= 7 && h < 19 ? 'light' : 'dark') : pref;
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = '#0C1B2E'; // matches the navy frame
  }

  // The current chapter is the one holding the latest recording, unless a newer, still-empty
  // chapter was started since (so imports of old archives never become "current").
  function currentChapter() {
    if (!S.chapters.length) return null;
    const last = S.entries.reduce((a, e) => (!a || e.startedAt > a.startedAt ? e : a), null);
    const fresh = S.chapters.filter((c) => (!last || c.createdAt > last.createdAt) && !S.entries.some((e) => e.chapterId === c.id));
    if (fresh.length) return fresh[fresh.length - 1];
    if (last) return S.chapters.find((c) => c.id === last.chapterId) || S.chapters[S.chapters.length - 1];
    return S.chapters[S.chapters.length - 1];
  }
  // Chapters read in time order: by their first page, empty ones by when they were made.
  function orderedChapters() {
    const key = (c) => { const l = entriesOf(c.id); return l.length ? l[0].startedAt : c.createdAt; };
    return S.chapters.slice().sort((a, b) => key(a).localeCompare(key(b)));
  }
  const entriesOf = (chId) => S.entries.filter((e) => e.chapterId === chId);
  const moodClass = (m) => 'mood-' + (MOODS.includes(m) ? m : 'none');

  function spineHtml() {
    const moods = S.entries.slice(-24).map((e) => e.mood || 'none');
    const list = moods.length ? moods : ['thoughtful', 'calm', 'hopeful', 'thoughtful', 'calm'];
    return '<div class="spine" aria-hidden="true">' + list.map((m) => '<span class="' + moodClass(m) + '"></span>').join('') + '</div>';
  }

  // Persian illumination (tazhib): gilded corner pieces
  function cornersHtml() {
    return ['tl', 'tr', 'bl', 'br'].map((c) => '<img class="orn-c ' + c + '" src="orn/corner.svg" alt="" aria-hidden="true">').join('');
  }

  function coverHtml(small) {
    const name = (lang() === 'en' && S.settings.nameEn) || S.settings.name || t('yourName');
    const meta = S.entries.length
      ? chaptersPagesText(S.chapters.length, S.entries.length)
      : t('noPagesYet');
    const inner = spineHtml() + '<div class="frame" aria-hidden="true"></div>' + cornersHtml() +
      '<span class="vol">' + esc(t('notebookOne')) + '</span>' +
      '<span class="title"><img class="orn-med" src="orn/medallion.svg" alt="" aria-hidden="true">' +
      '<span class="t1">' + esc(t('journalOf')) + '</span><span class="t2" data-cover-name>' + esc(name) + '</span></span>' +
      '<span class="meta">' + esc(meta) + '</span>';
    if (small) return '<div class="cover small" aria-hidden="true">' + inner + '</div>';
    return '<button class="cover" data-act="contents" aria-label="' + esc(t('contents')) + '">' + inner + '</button>';
  }

  function langPill() {
    const fa = lang() === 'fa';
    return '<button class="pill" data-act="toggle-lang" aria-label="' + (fa ? 'Switch to English' : 'تغییر به فارسی') + '">' +
      '<span class="' + (fa ? 'on' : '') + '">فا</span><span class="sep">|</span><span class="' + (fa ? '' : 'on') + '">EN</span></button>';
  }

  // ---------------------------------------------------------------- views
  function render() {
    applyLangTheme();
    const v = S.view;
    if (v === 'loading') app.innerHTML = '';
    else if (v === 'welcome') app.innerHTML = viewWelcome();
    else if (v === 'home') app.innerHTML = viewHome();
    else if (v === 'contents') app.innerHTML = viewContents();
    else if (v === 'recorder') { app.innerHTML = viewRecorder(); Rec.bindView(); }
    const focus = app.querySelector('[autofocus]');
    if (focus) focus.focus();
    clearInterval(S.clockTimer);
    if (v === 'home') {
      S.clockTimer = setInterval(() => {
        const el = app.querySelector('[data-clock]');
        if (el) el.textContent = fmtCal(new Date(), defaultCal(), { hour: '2-digit', minute: '2-digit', hour12: false });
      }, 15000);
    }
  }

  function viewWelcome() {
    const l = lang();
    return '<section class="screen">' +
      '<div class="center"><h1 class="hero-title">' + esc(t('welcome')) + '</h1>' +
      '<div class="muted small">' + (l === 'fa' ? 'Welcome to your journal' : 'به روزنگارت خوش آمدی') + '</div></div>' +
      '<div class="cover-wrap">' + coverHtml(true) + '</div>' +
      '<div class="field"><label for="owner">' + esc(t('whose')) + '</label>' +
      '<input id="owner" type="text" maxlength="60" value="' + esc(S.settings.name || '') + '" placeholder="' + esc(t('yourName')) + '" autocomplete="given-name" autofocus>' +
      '<span class="muted tiny">' + esc(t('nameHint')) + '</span></div>' +
      '<div class="field"><span class="label">' + esc(t('language')) + ' / ' + (l === 'fa' ? 'Language' : 'زبان') + '</span>' +
      '<div class="seg"><button data-act="set-lang" data-lang="fa" aria-pressed="' + (l === 'fa') + '">فارسی</button>' +
      '<button data-act="set-lang" data-lang="en" aria-pressed="' + (l === 'en') + '">English</button></div></div>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-primary btn-big" data-act="finish-welcome">' + esc(t('open')) + '</button>' +
      '</section>';
  }

  function onThisDay() {
    const now = new Date();
    const past = S.entries.filter((e) => new Date(e.startedAt) < new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    for (let y = 1; y <= 30; y++) {
      const hit = past.find((e) => { const d = new Date(e.startedAt); return d.getFullYear() === now.getFullYear() - y && d.getMonth() === now.getMonth() && d.getDate() === now.getDate(); });
      if (hit) return { e: hit, when: y === 1 ? t('yearAgo') : t('yearsAgo', { n: num(y) }) };
    }
    for (let m = 1; m <= 11; m++) {
      const target = new Date(now.getFullYear(), now.getMonth() - m, now.getDate());
      if (target.getDate() !== now.getDate()) continue;
      const hit = past.find((e) => { const d = new Date(e.startedAt); return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth() && d.getDate() === target.getDate(); });
      if (hit) return { e: hit, when: m === 1 ? t('monthAgo') : t('monthsAgo', { n: num(m) }) };
    }
    return null;
  }

  function backupBanner() {
    if (!S.entries.length) return '';
    const last = S.settings.lastBackupAt ? new Date(S.settings.lastBackupAt) : null;
    const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
    if (last && days < 7) return '';
    const txt = last ? t('backupAgo', { n: num(days) }) : t('backupNever');
    return '<div class="banner"><span>' + esc(txt) + '</span>' +
      '<button class="chip" data-act="backup">' + esc(t('backupNow')) + '</button></div>';
  }


  // ----- opening animation: the journal opens and writes an invitation to speak
  function playIntro() {
    if (S.introPlayed) return;
    S.introPlayed = true;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const wrap = document.createElement('div');
    wrap.className = 'intro';
    wrap.setAttribute('aria-hidden', 'true');
    const hopes = (window.HOPE && window.HOPE[lang()]) || [];
    if (S.hopeIndex === undefined && hopes.length) {
      const now = new Date();
      S.hopeIndex = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000) % hopes.length;
    }
    const quote = hopes.length ? hopes[S.hopeIndex % hopes.length] : '';
    wrap.innerHTML = '<div class="intro-book"><div class="intro-page">' + cornersHtml() +
      '<img class="orn-head" src="orn/headpiece.svg" alt="" aria-hidden="true"><span class="eyebrow">' + esc(fmtCal(new Date(), defaultCal(), { weekday: 'long', day: 'numeric', month: 'long' })) + '</span>' +
      '<div class="intro-write" dir="auto"></div>' +
      '<div class="intro-quote" dir="auto"><span class="q-mark" aria-hidden="true">“</span>' + esc(quote) + '</div></div>' +
      '<div class="intro-cover">' + coverHtml(true) + '</div></div><span class="intro-skip">' + esc(t('tapToSkip')) + '</span>';
    document.body.appendChild(wrap);
    const target = wrap.querySelector('.intro-write');
    const words = t('introLine').split(' ');
    let i = 0;
    let typer = null;
    const timers = [];
    const finish = () => {
      timers.forEach(clearTimeout); clearInterval(typer);
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 650);
    };
    wrap.addEventListener('click', finish);
    timers.push(setTimeout(() => wrap.classList.add('open'), 750));
    timers.push(setTimeout(() => {
      // Word by word, so Persian letters stay joined while they appear.
      typer = setInterval(() => {
        i++;
        target.textContent = words.slice(0, i).join(' ');
        if (i >= words.length) {
          clearInterval(typer);
          // Then the day's line jumps out of the page.
          timers.push(setTimeout(() => wrap.classList.add('quote-in'), 350));
          timers.push(setTimeout(finish, 3600));
        }
      }, 190);
    }, 1700));
  }

  // ----- calendar helpers (Persian/Solar Hijri and Gregorian, via the browser's own calendars)
  const CAL_LOCALE = { persian: 'en-US-u-ca-persian-nu-latn', gregory: 'en-US-u-ca-gregory-nu-latn' };
  function calParts(date, cal) {
    const parts = new Intl.DateTimeFormat(CAL_LOCALE[cal], { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
    const get = (k) => Number((parts.find((p) => p.type === k) || {}).value);
    return { y: get('year'), m: get('month'), d: get('day') };
  }
  const dayKey = (date) => date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
  const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n, 12);
  function monthStart(date, cal) { let x = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12); while (calParts(x, cal).d !== 1) x = addDays(x, -1); return x; }
  function monthDays(start, cal) { const m = calParts(start, cal).m; const out = []; let x = start; while (calParts(x, cal).m === m) { out.push(x); x = addDays(x, 1); } return out; }
  function fmtCal(date, cal, opts) {
    const loc = (lang() === 'fa' ? 'fa-IR' : 'en-US') + '-u-ca-' + cal;
    const out = new Intl.DateTimeFormat(loc, opts).format(date);
    return lang() === 'fa' ? out.replace(/,/g, '،') : out;
  }
  const otherCal = (cal) => (cal === 'persian' ? 'gregory' : 'persian');
  const defaultCal = () => (lang() === 'fa' ? 'persian' : 'gregory');

  function todayCard() {
    const now = new Date();
    const main = defaultCal();
    const second = otherCal(main);
    const time = fmtCal(now, main, { hour: '2-digit', minute: '2-digit', hour12: false });
    return '<button class="today" data-act="calendar" aria-label="' + esc(t('calendar')) + '">' +
      '<span class="today-text">' +
      '<span class="eyebrow">' + esc(fmtCal(now, main, { weekday: 'long' })) + '</span>' +
      '<span class="today-main">' + esc(fmtCal(now, main, { day: 'numeric', month: 'long', year: 'numeric' })) + '</span>' +
      '<span class="today-second">' + esc(fmtCal(now, second, { day: 'numeric', month: 'long', year: 'numeric' })) + '</span>' +
      '</span>' +
      '<span class="today-time" data-clock>' + esc(time) + '</span></button>';
  }

  function hopeLine() {
    const list = (window.HOPE && window.HOPE[lang()]) || [];
    if (!list.length) return '';
    if (S.hopeIndex === undefined) {
      const now = new Date();
      S.hopeIndex = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000) % list.length;
    }
    return '<button class="hope" data-act="next-hope" aria-label="' + esc(t('anotherLine')) + '">' +
      '<span class="hope-mark" aria-hidden="true">“</span><span data-hope>' + esc(list[S.hopeIndex % list.length]) + '</span></button>';
  }

  // Personal AR logo in a navy-and-gold ring. Uses icons/ar-logo.png when present.
  function badgeHtml() {
    return '<span class="badge" aria-hidden="true">' + (S.hasLogo ? '<img src="icons/ar-logo.png" alt="">' : '<span class="ar">A<i>R</i></span>') + '</span>';
  }

  function dock(active) {
    return '<nav class="dock" aria-label="' + esc(t('appName')) + '">' +
      '<button class="dock-item' + (active === 'contents' ? ' on' : '') + '" data-act="contents">' + I.book + '<span>' + esc(t('contents')) + '</span></button>' +
      '<button class="dock-rec" data-act="record" aria-label="' + esc(t('newPage')) + '"><span class="dock-rec-btn">' + I.mic + '</span><span>' + esc(t('recordShort')) + '</span></button>' +
      '<button class="dock-item' + (active === 'calendar' ? ' on' : '') + '" data-act="calendar">' + I.cal + '<span>' + esc(t('calendar')) + '</span></button>' +
      '</nav>';
  }

  function viewHome() {
    const ch = currentChapter();
    const memory = onThisDay();
    return '<section class="screen with-dock">' +
      '<div class="topbar"><div class="brand-row">' + badgeHtml() + '<span class="brand-name"><b>' + esc(t('appTitle')) + '</b><span>' + esc(t('appSub')) + '</span></span></div>' +
      '<div class="card-row">' + langPill() +
      '<button class="iconbtn" data-act="settings" aria-label="' + esc(t('settings')) + '">' + I.gear + '</button></div></div>' +
      todayCard() +
      hopeLine() +
      backupBanner() +
      '<div class="cover-wrap">' + coverHtml(false) + '</div>' +
      (ch ? '<div class="card"><button class="linklike" data-act="contents"><span class="label">' + esc(t('currentChapter')) + '</span>' +
        '<span class="card-row"><span class="value grow">' + esc(chTitle(ch)) + '</span><span class="muted small">' +
        esc(pagesText(entriesOf(ch.id).length)) + '</span></span></button></div>' : '') +
      (memory ? '<div class="card card-row"><button class="iconbtn" data-act="play" data-id="' + esc(memory.e.id) + '" aria-label="' + esc(entryTitle(memory.e)) + '">' + I.play + '</button>' +
        '<span><span class="label">' + esc(t('onThisDay', { when: memory.when })) + '</span><br><span>' + esc(entryTitle(memory.e)) + '</span></span></div>' : '') +
      '</section>' + dock('home');
  }

  // ----- calendar sheet
  function openCalendar(keepState) {
    if (!keepState) { S.calMode = S.calMode || defaultCal(); S.calAnchor = new Date(); S.calSelected = dayKey(new Date()); }
    const cal = S.calMode;
    const start = monthStart(S.calAnchor, cal);
    const days = monthDays(start, cal);
    const weekStart = cal === 'persian' ? 6 : 0; // Saturday for the Persian calendar, Sunday otherwise
    const lead = (start.getDay() - weekStart + 7) % 7;
    const byDay = new Map();
    S.entries.forEach((e) => { const k = dayKey(new Date(e.startedAt)); byDay.set(k, (byDay.get(k) || []).concat(e)); });
    const todayK = dayKey(new Date());
    const wk = [];
    for (let i = 0; i < 7; i++) wk.push(fmtCal(addDays(new Date(2026, 0, 4 + weekStart), i), cal, { weekday: 'narrow' }));
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="cal-cell empty"></span>';
    days.forEach((d) => {
      const k = dayKey(d);
      const has = byDay.has(k);
      const sec = calParts(d, otherCal(cal)).d;
      cells += '<button class="cal-cell' + (k === todayK ? ' today-cell' : '') + (k === S.calSelected ? ' sel' : '') + '" data-act="cal-day" data-key="' + k + '" aria-label="' + esc(fmtCal(d, cal, { day: 'numeric', month: 'long' })) + '">' +
        '<span class="n">' + esc(fmtCal(d, cal, { day: 'numeric' })) + '</span>' +
        '<span class="n2">' + esc(lang() === 'fa' ? num(sec) : String(sec)) + '</span>' +
        (has ? '<span class="dot" aria-hidden="true"></span>' : '') + '</button>';
    });
    const sel = byDay.get(S.calSelected) || [];
    const list = sel.length ? sel.map((e) => '<button class="page-row" data-act="play" data-id="' + esc(e.id) + '">' +
      '<span class="bar ' + moodClass(e.mood) + '"></span><span class="txt"><span dir="auto" class="t' + (e.title ? '' : ' untitled') + '">' + esc(entryTitle(e)) + '</span>' +
      '<span class="d">' + esc(fmtDate(e.startedAt, { hour: '2-digit', minute: '2-digit', hour12: false })) + '</span></span><span class="len">' + esc(fmtLen(e.durationSec)) + '</span></button>').join('')
      : '<div class="empty small">' + esc(t('noPagesThisDay')) + '</div>';
    openSheet(
      '<div class="cal-head"><button class="iconbtn flip-rtl" data-act="cal-prev" aria-label="' + esc(t('prevMonth')) + '">' + I.back + '</button>' +
      '<div class="cal-title"><span class="cal-month">' + esc(fmtCal(start, cal, { month: 'long', year: 'numeric' })) + '</span>' +
      '<span class="cal-month2">' + esc(fmtCal(start, otherCal(cal), { month: 'long' }) + ' – ' + fmtCal(days[days.length - 1], otherCal(cal), { month: 'long', year: 'numeric' })) + '</span></div>' +
      '<button class="iconbtn flip-ltr" data-act="cal-next" aria-label="' + esc(t('nextMonth')) + '">' + I.back + '</button></div>' +
      '<div class="seg"><button data-act="cal-mode" data-mode="persian" aria-pressed="' + (cal === 'persian') + '">' + esc(t('solar')) + '</button>' +
      '<button data-act="cal-mode" data-mode="gregory" aria-pressed="' + (cal === 'gregory') + '">' + esc(t('gregorian')) + '</button></div>' +
      '<div class="cal-grid" role="grid">' + wk.map((w) => '<span class="cal-wd">' + esc(w) + '</span>').join('') + cells + '</div>' +
      '<div>' + list + '</div>' +
      '<button class="btn btn-ghost" data-act="close-sheet">' + esc(t('close')) + '</button>'
    );
  }

  function moveMonth(dir) {
    const cal = S.calMode;
    const start = monthStart(S.calAnchor, cal);
    S.calAnchor = dir < 0 ? addDays(start, -1) : addDays(monthDays(start, cal).slice(-1)[0], 1);
    openCalendar(true);
  }

  function viewContents() {
    if (!S.openChapter && currentChapter()) S.openChapter = currentChapter().id;
    const chapters = orderedChapters().map((ch) => {
      const list = entriesOf(ch.id);
      const open = S.openChapter === ch.id;
      const range = list.length ? fmtDate(list[0].startedAt, { month: 'long', year: 'numeric' }) + SEP() : '';
      let body = '';
      if (open) {
        body = '<div class="chapter-body"><div class="chapter-tools">' +
          (list.length ? '<button class="chip chip-accent" data-act="play-chapter" data-id="' + esc(ch.id) + '">' + I.play + esc(t('playChapter')) + '</button>' : '') +
          '<button class="chip" data-act="rename-chapter" data-id="' + esc(ch.id) + '">' + esc(t('renameChapter')) + '</button></div>' +
          (list.length ? list.map((e) => '<button class="page-row' + (S.playingId === e.id ? ' playing' : '') + '" data-act="play" data-id="' + esc(e.id) + '">' +
            '<span class="bar ' + moodClass(e.mood) + '"></span>' +
            '<span class="txt"><span dir="auto" class="t' + (e.title ? '' : ' untitled') + '">' + esc(e.title || t('untitled') + ' — ' + t('addTitle')) + '</span>' +
            '<span class="d">' + esc(fmtDayTime(e.startedAt)) + '</span></span>' +
            '<span class="len">' + esc(fmtLen(e.durationSec)) + '</span></button>').join('')
            : '<div class="empty">' + esc(t('noPagesYet')) + '</div>') +
          '</div>';
      }
      return '<div class="card chapter' + (open ? ' card-accent' : '') + '">' +
        '<button class="chapter-head" data-act="toggle-chapter" data-id="' + esc(ch.id) + '" aria-expanded="' + open + '">' +
        '<span class="row1"><span class="name" dir="auto">' + esc(chTitle(ch)) + '</span><span class="muted tiny">' + esc(range + pagesText(list.length)) + '</span></span>' +
        '<span class="moodbar" aria-hidden="true">' + list.slice(-12).map((e) => '<span class="' + moodClass(e.mood) + '"></span>').join('') + '</span>' +
        '</button>' + body + '</div>';
    }).join('');
    return '<section class="screen with-dock">' +
      '<div class="topbar"><button class="iconbtn flip-rtl" data-act="home" aria-label="' + esc(t('back')) + '">' + I.back + '</button>' +
      '<h1>' + esc(t('contents')) + '</h1>' +
      '<button class="chip" data-act="new-chapter">' + esc(t('newChapter')) + '</button></div>' +
      backupBanner() +
      (chapters || '<div class="empty">' + esc(t('noPagesYet')) + '</div>') +
      '</section>' + dock('contents');
  }

  function viewRecorder() {
    const ch = currentChapter();
    const pageNo = S.entries.length + 1;
    return '<section class="screen">' +
      '<div class="rec-head"><span class="ch" dir="auto">' + esc(chTitle(ch)) + '</span>' +
      '<span class="pg">' + esc(t('pageN', { n: num(pageNo) })) + '</span>' +
      '<span class="muted small">' + esc(fmtLong(Rec.startedAt || new Date().toISOString())) + '</span></div>' +
      '<div class="grow"></div>' +
      '<div class="rec-state"><span class="rec-dot live" data-rec-dot></span><span data-rec-state>' + esc(t('recording')) + '</span></div>' +
      '<div class="timer" data-timer>' + fmtClock(0) + '</div>' +
      '<canvas class="wave" data-wave width="800" height="192" aria-hidden="true"></canvas>' +
      '<div class="note" data-marks>' + esc(t('keepOpen')) + '</div>' +
      '<div class="grow"></div>' +
      '<div class="rec-controls">' +
      '<div class="c"><button class="rbtn mark" data-act="rec-mark" aria-label="' + esc(t('mark')) + '">' + I.mark + '</button>' + esc(t('mark')) + '</div>' +
      '<div class="c"><button class="rbtn stop" data-act="rec-stop" aria-label="' + esc(t('stop')) + '"><span></span></button>' + esc(t('stop')) + '</div>' +
      '<div class="c"><button class="rbtn" data-act="rec-pause" data-pause aria-label="' + esc(t('pause')) + '">' + I.pause + '</button><span data-pause-label>' + esc(t('pause')) + '</span></div>' +
      '</div></section>';
  }

  // ---------------------------------------------------------------- recorder
  const Rec = {
    mr: null, stream: null, ctx: null, analyser: null, raf: 0, tick: 0,
    chunks: [], seq: 0, sessionId: null, startedAt: null, mime: '',
    elapsedBefore: 0, segStart: 0, paused: false, bookmarks: [], wake: null, interrupted: false, active: false,

    elapsed() { return this.elapsedBefore + (this.paused || !this.segStart ? 0 : (Date.now() - this.segStart)); },

    pickMime() {
      if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
      const opts = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      return opts.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    },

    async start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { toast(t('micUnsupported')); return; }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (e) {
        toast(t('micDenied'));
        return;
      }
      const want = this.pickMime();
      try {
        this.mr = want ? new MediaRecorder(this.stream, { mimeType: want }) : new MediaRecorder(this.stream);
      } catch (e) {
        this.mr = new MediaRecorder(this.stream);
      }
      this.mime = (this.mr.mimeType || want || 'audio/webm').split(';')[0];
      this.chunks = []; this.seq = 0; this.bookmarks = []; this.elapsedBefore = 0; this.paused = false; this.interrupted = false;
      this.sessionId = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      this.startedAt = new Date().toISOString();
      this.active = true;
      const ch = currentChapter();
      await safe(DB.put('sessions', { id: this.sessionId, mime: this.mime, startedAt: this.startedAt, bookmarks: [], elapsed: 0, chapterId: ch ? ch.id : null }));

      this.mr.ondataavailable = (ev) => {
        if (!ev.data || !ev.data.size) return;
        this.chunks.push(ev.data);
        const seq = this.seq++;
        safe(DB.put('chunks', { session: this.sessionId, seq, blob: ev.data }));
        safe(DB.put('sessions', { id: this.sessionId, mime: this.mime, startedAt: this.startedAt, bookmarks: this.bookmarks, elapsed: Math.round(this.elapsed() / 1000), chapterId: ch ? ch.id : null }));
      };
      this.mr.onstop = () => this.finish();
      this.mr.onerror = () => { this.interrupted = true; this.stop(); };
      this.stream.getAudioTracks().forEach((tr) => { tr.onended = () => { if (this.active) { this.interrupted = true; this.stop(); } }; });

      this.mr.start(5000);
      this.segStart = Date.now();
      this.setupMeter();
      this.lockScreen();
      S.view = 'recorder';
      render();
    },

    bindView() {
      clearInterval(this.tick);
      this.tick = setInterval(() => {
        const el = app.querySelector('[data-timer]');
        if (el) el.textContent = fmtClock(this.elapsed() / 1000);
      }, 250);
      this.draw();
    },

    setupMeter() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        const src = this.ctx.createMediaStreamSource(this.stream);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 512;
        src.connect(this.analyser);
        this.levels = new Array(48).fill(0);
        this.lastPush = 0;
      } catch (e) { this.analyser = null; }
    },

    draw() {
      cancelAnimationFrame(this.raf);
      const canvas = app.querySelector('[data-wave]');
      if (!canvas) return;
      const g = canvas.getContext('2d');
      const css = getComputedStyle(document.documentElement);
      const on = css.getPropertyValue('--copper').trim() || '#DDA77D';
      const off = css.getPropertyValue('--line-strong').trim() || '#3A4156';
      const buf = this.analyser ? new Uint8Array(this.analyser.fftSize) : null;
      const loop = (ts) => {
        if (!this.active) return;
        if (this.analyser && !this.paused && ts - this.lastPush > 90) {
          this.analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
          this.levels.push(Math.min(1, peak / 64));
          this.levels.shift();
          this.lastPush = ts;
        }
        g.clearRect(0, 0, canvas.width, canvas.height);
        const n = this.levels ? this.levels.length : 48;
        const w = canvas.width / n;
        for (let i = 0; i < n; i++) {
          const v = this.levels ? this.levels[i] : 0;
          const h = Math.max(8, v * canvas.height * 0.95);
          g.fillStyle = this.paused ? off : on;
          const x = i * w + w * 0.3;
          g.fillRect(x, (canvas.height - h) / 2, w * 0.4, h);
        }
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    },

    async lockScreen() {
      try { if (navigator.wakeLock) this.wake = await navigator.wakeLock.request('screen'); } catch (e) { this.wake = null; }
    },

    mark() {
      if (!this.active) return;
      this.bookmarks.push(Math.round(this.elapsed() / 1000));
      const el = app.querySelector('[data-marks]');
      if (el) el.textContent = t('marked', { n: num(this.bookmarks.length) }) + SEP() + this.bookmarks.map((s) => fmtClock(s)).join('، ');
      if (navigator.vibrate) navigator.vibrate(30);
    },

    togglePause() {
      if (!this.mr || !this.active) return;
      if (this.paused) {
        this.mr.resume(); this.paused = false; this.segStart = Date.now();
      } else {
        this.mr.pause(); this.elapsedBefore = this.elapsed(); this.paused = true;
      }
      const btn = app.querySelector('[data-pause]');
      const lbl = app.querySelector('[data-pause-label]');
      const st = app.querySelector('[data-rec-state]');
      const dot = app.querySelector('[data-rec-dot]');
      if (btn) { btn.innerHTML = this.paused ? I.play : I.pause; btn.setAttribute('aria-label', this.paused ? t('resume') : t('pause')); }
      if (lbl) lbl.textContent = this.paused ? t('resume') : t('pause');
      if (st) st.textContent = this.paused ? t('paused') : t('recording');
      if (dot) dot.classList.toggle('live', !this.paused);
    },

    stop() {
      if (!this.mr || this.mr.state === 'inactive') { if (this.active) this.finish(); return; }
      this.elapsedBefore = this.elapsed(); this.paused = true;
      try { this.mr.stop(); } catch (e) { this.finish(); }
    },

    finish() {
      if (!this.active) return;
      this.active = false;
      clearInterval(this.tick);
      cancelAnimationFrame(this.raf);
      if (this.stream) this.stream.getTracks().forEach((tr) => tr.stop());
      if (this.ctx) safe(this.ctx.close());
      if (this.wake) safe(this.wake.release());
      this.wake = null;
      const blob = new Blob(this.chunks, { type: this.mime });
      const rec = {
        sessionId: this.sessionId, blob, mime: this.mime, startedAt: this.startedAt,
        durationSec: Math.round(this.elapsedBefore / 1000), bookmarks: this.bookmarks.slice(), interrupted: this.interrupted
      };
      this.chunks = [];
      S.view = 'home';
      render();
      if (!blob.size) { safe(DB.dropSession(rec.sessionId)); this.sessionId = null; toast(t('recInterrupted')); return; }
      openSaveSheet(rec);
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (Rec.active && !Rec.wake) Rec.lockScreen();
      if (!Rec.active) applyLangTheme();
    }
  });
  window.addEventListener('beforeunload', (e) => { if (Rec.active) { e.preventDefault(); e.returnValue = ''; } });

  // ---------------------------------------------------------------- sheets
  let sheetCleanup = null;
  function openSheet(html, onClose) {
    closeSheet();
    sheetRoot.innerHTML = '<div class="overlay" data-overlay><div class="sheet" role="dialog" aria-modal="true">' +
      '<div class="grab" aria-hidden="true"></div>' + html + '</div></div>';
    sheetCleanup = onClose || null;
    const f = sheetRoot.querySelector('[autofocus]') || sheetRoot.querySelector('button, input');
    if (f) f.focus();
  }
  function closeSheet() {
    if (sheetCleanup) { const fn = sheetCleanup; sheetCleanup = null; fn(); }
    sheetRoot.innerHTML = '';
  }
  const sheet = () => sheetRoot.querySelector('.sheet');

  function moodButtons(selected) {
    return '<div class="moods">' + MOODS.map((m) => '<button type="button" class="moodbtn" data-act="pick-mood" data-mood="' + m + '" aria-pressed="' + (selected === m) + '">' +
      '<span class="dot ' + moodClass(m) + '"></span>' + esc(t('moods.' + m)) + '</button>').join('') + '</div>';
  }

  function chapterChips(selectedId) {
    return '<div class="chips">' + orderedChapters().map((c) => '<button type="button" class="chip" data-act="pick-chapter" data-id="' + esc(c.id) + '" aria-pressed="' + (c.id === selectedId) + '" dir="auto">' + esc(chTitle(c)) + '</button>').join('') +
      '<button type="button" class="chip" data-act="pick-chapter" data-id="__new" aria-pressed="' + (selectedId === '__new') + '">' + esc(t('newChapter')) + '</button></div>' +
      '<div class="field" data-newch ' + (selectedId === '__new' ? '' : 'hidden') + '><label class="sr-only" for="newch">' + esc(t('newChapterName')) + '</label>' +
      '<input id="newch" type="text" maxlength="120" placeholder="' + esc(t('newChapterName')) + '"></div>';
  }

  function sheetPick(attr, value) {
    sheet().querySelectorAll('[data-act="' + attr + '"]').forEach((b) => {
      const key = attr === 'pick-mood' ? b.dataset.mood : b.dataset.id;
      b.setAttribute('aria-pressed', String(key === value));
    });
  }
  const sheetValue = (attr) => {
    const b = sheet() && sheet().querySelector('[data-act="' + attr + '"][aria-pressed="true"]');
    if (!b) return null;
    return attr === 'pick-mood' ? b.dataset.mood : b.dataset.id;
  };

  async function resolveChapter() {
    const pick = sheetValue('pick-chapter');
    if (pick !== '__new') return pick;
    const name = (sheet().querySelector('#newch').value || '').trim();
    if (!name) return currentChapter() ? currentChapter().id : null;
    return (await createChapter(name)).id;
  }

  let saving = null;
  function openSaveSheet(rec) {
    saving = rec;
    const ch = currentChapter();
    openSheet(
      '<div class="center"><span class="muted small">' + esc(fmtClock(rec.durationSec)) + SEP() + esc(fmtDayTime(rec.startedAt)) + '</span></div>' +
      (rec.interrupted ? '<div class="note">' + esc(t('recInterrupted')) + '</div>' : '') +
      '<div class="field"><label for="ttl">' + esc(t('whatAbout')) + '</label>' +
      '<input id="ttl" type="text" maxlength="200" placeholder="' + esc(t('titleExample')) + '" autofocus>' +
      '<span class="muted tiny">' + esc(t('titleHint')) + '</span></div>' +
      '<div class="field"><span class="label">' + esc(t('moodOptional')) + '</span>' + moodButtons(null) + '</div>' +
      '<div class="field"><span class="label">' + esc(t('whichChapter')) + '</span>' + chapterChips(ch ? ch.id : '__new') + '</div>' +
      '<div class="btn-row"><button class="btn btn-primary" data-act="save-rec">' + esc(t('save')) + '</button>' +
      '<button class="btn btn-ghost" data-act="save-rec" data-later="1">' + esc(t('later')) + '</button></div>' +
      '<button class="btn btn-danger" data-act="discard-rec">' + esc(t('discard')) + '</button>'
    );
  }

  async function saveRecording(later) {
    if (!saving) return;
    const rec = saving;
    sheet().querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      const chapterId = await resolveChapter();
      const entry = await addEntry({
        title: later ? '' : (sheet().querySelector('#ttl').value || '').trim(),
        mood: sheetValue('pick-mood'),
        chapterId,
        startedAt: rec.startedAt,
        durationSec: rec.durationSec,
        bookmarks: rec.bookmarks
      }, rec.blob);
      await safe(DB.dropSession(rec.sessionId));
      Rec.sessionId = null;
      saving = null;
      closeSheet();
      S.openChapter = entry.chapterId;
      S.view = 'contents';
      render();
      toast(t('saved'));
    } catch (e) {
      console.error(e);
      sheet().querySelectorAll('button').forEach((b) => { b.disabled = false; });
      toast(t('saveFailed'));
    }
  }

  async function discardRecording() {
    if (!saving || !window.confirm(t('discardConfirm'))) return;
    await safe(DB.dropSession(saving.sessionId));
    Rec.sessionId = null;
    saving = null;
    closeSheet();
  }

  // ----- player
  let playerEntry = null;
  function openPlayer(entry, fromQueue) {
    if (!fromQueue) S.queue = [];
    const autoplay = true;
    playerEntry = entry;
    S.playingId = entry.id;
    if (audio.dataset.id !== entry.id) {
      if (audio.dataset.url) URL.revokeObjectURL(audio.dataset.url);
      audio.dataset.id = entry.id;
      audio.dataset.url = '';
      audio.removeAttribute('src');
      DB.get('audio', entry.id).then((rec) => {
        if (!rec || audio.dataset.id !== entry.id) return;
        const url = URL.createObjectURL(rec.blob);
        audio.dataset.url = url;
        audio.src = url;
        if (autoplay) safe(audio.play());
      });
    }
    const marks = (entry.bookmarks || []).map((s) => '<button class="chip" data-act="seek-to" data-sec="' + s + '">' + I.markFill + esc(fmtClock(s)) + '</button>').join('');
    const ch = S.chapters.find((c) => c.id === entry.chapterId);
    openSheet(
      '<div><span class="muted small" dir="auto">' + esc(chTitle(ch)) + '</span>' +
      '<h2 class="player-title" dir="auto">' + esc(entryTitle(entry)) + '</h2>' +
      '<span class="muted small">' + esc(fmtLong(entry.startedAt) + SEP() + fmtDate(entry.startedAt, { hour: '2-digit', minute: '2-digit', hour12: false })) + '</span></div>' +
      '<div><input class="seek" type="range" min="0" max="1000" value="0" step="1" data-seek aria-label="seek">' +
      '<div class="times"><span data-cur>' + fmtClock(0) + '</span><span data-dur>' + fmtClock(entry.durationSec) + '</span></div></div>' +
      '<div class="play-row" dir="ltr">' +
      '<button class="iconbtn" data-act="skip" data-sec="-15" aria-label="-15s">' + I.rew + '</button>' +
      '<button class="playbtn" data-act="toggle-play" data-playbtn aria-label="play">' + (audio.paused ? I.play : I.pause) + '</button>' +
      '<button class="iconbtn" data-act="skip" data-sec="15" aria-label="+15s">' + I.fwd + '</button></div>' +
      '<div class="field"><span class="label">' + esc(t('speed')) + '</span><div class="chips">' +
      [1, 1.25, 1.5, 2].map((r) => '<button class="chip" data-act="rate" data-rate="' + r + '" aria-pressed="' + (audio.playbackRate === r) + '">' + esc(num(r)) + '×</button>').join('') + '</div></div>' +
      (marks ? '<div class="field"><span class="label">' + esc(t('bookmarks')) + '</span><div class="chips">' + marks + '</div></div>' : '') +
      '<div class="btn-row"><button class="btn btn-ghost" data-act="edit-entry" data-id="' + esc(entry.id) + '">' + esc(t('edit')) + '</button>' +
      '<button class="btn btn-ghost" data-act="close-sheet">' + esc(t('close')) + '</button></div>',
      () => { playerEntry = null; }
    );
    syncPlayer();
    if (audio.src && (fromQueue || audio.paused)) safe(audio.play());
  }

  function syncPlayer() {
    const s = sheet();
    if (!s || !playerEntry) return;
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : playerEntry.durationSec || 0;
    const cur = s.querySelector('[data-cur]');
    const d = s.querySelector('[data-dur]');
    const seek = s.querySelector('[data-seek]');
    const btn = s.querySelector('[data-playbtn]');
    if (cur) cur.textContent = fmtClock(audio.currentTime);
    if (d) d.textContent = fmtClock(dur);
    if (seek && !seek.matches(':active') && dur) seek.value = String(Math.round((audio.currentTime / dur) * 1000));
    if (btn) btn.innerHTML = audio.paused ? I.play : I.pause;
  }
  ['timeupdate', 'play', 'pause', 'loadedmetadata'].forEach((ev) => audio.addEventListener(ev, syncPlayer));
  audio.addEventListener('ended', () => {
    const next = S.queue.shift();
    if (next) {
      const e = S.entries.find((x) => x.id === next);
      if (e) return openPlayer(e, true);
    }
    syncPlayer();
  });

  function playChapter(chId) {
    const list = entriesOf(chId);
    if (!list.length) return;
    S.queue = list.slice(1).map((e) => e.id);
    const q = S.queue.slice();
    openPlayer(list[0], true);
    S.queue = q;
  }

  // ----- edit entry
  function openEdit(entry) {
    openSheet(
      '<h2>' + esc(t('edit')) + '</h2>' +
      '<div class="field"><label for="ttl">' + esc(t('titleLabel')) + '</label>' +
      '<input id="ttl" type="text" maxlength="200" value="' + esc(entry.title || '') + '" placeholder="' + esc(t('titleExample')) + '" autofocus></div>' +
      '<div class="field"><span class="label">' + esc(t('moodOptional')) + '</span>' + moodButtons(entry.mood) + '</div>' +
      '<div class="field"><span class="label">' + esc(t('whichChapter')) + '</span>' + chapterChips(entry.chapterId) + '</div>' +
      '<div class="btn-row"><button class="btn btn-primary" data-act="save-edit" data-id="' + esc(entry.id) + '">' + esc(t('done')) + '</button>' +
      '<button class="btn btn-ghost" data-act="close-sheet">' + esc(t('close')) + '</button></div>' +
      '<button class="btn btn-danger" data-act="delete-entry" data-id="' + esc(entry.id) + '">' + esc(t('delete')) + '</button>'
    );
  }

  async function saveEdit(id) {
    const s = sheet();
    try {
      const chapterId = await resolveChapter();
      const patch = { title: (s.querySelector('#ttl').value || '').trim().slice(0, 200), mood: sheetValue('pick-mood') };
      if (chapterId) patch.chapterId = chapterId;
      await updateEntry(id, patch);
      closeSheet();
      render();
    } catch (e) { toast(t('saveFailed')); }
  }

  async function deleteEntry(id) {
    if (!window.confirm(t('deleteConfirm'))) return;
    try {
      await removeEntry(id);
      if (audio.dataset.id === id) { audio.pause(); audio.removeAttribute('src'); delete audio.dataset.id; }
      closeSheet();
      render();
    } catch (e) { toast(t('saveFailed')); }
  }

  // ----- chapters
  function openChapterName(ch) {
    const auto = isAutoChapter(ch);
    const fa = ch ? (auto ? 'فصل اول' : ch.title) : '';
    const en = ch ? (auto ? 'Chapter One' : (ch.titleEn || '')) : '';
    openSheet(
      '<h2>' + esc(ch ? t('renameChapter') : t('newChapterName')) + '</h2>' +
      '<form class="field" data-form="chapter" data-id="' + esc(ch ? ch.id : '') + '">' +
      '<label for="chname">' + esc(t('chapterNameFa')) + '</label>' +
      '<input id="chname" type="text" maxlength="120" dir="auto" required value="' + esc(fa) + '" autofocus>' +
      '<label for="chnameen">' + esc(t('chapterNameEn')) + '</label>' +
      '<input id="chnameen" type="text" maxlength="120" dir="ltr" placeholder="e.g. The New Job" value="' + esc(en) + '">' +
      '<span class="muted tiny">' + esc(t('chapterNameEnHint')) + '</span>' +
      '<div class="btn-row"><button class="btn btn-primary" type="submit">' + esc(t('done')) + '</button>' +
      '<button class="btn btn-ghost" type="button" data-act="close-sheet">' + esc(t('close')) + '</button></div></form>'
    );
  }

  // Asked once when switching to English without an English name.
  function askEnglishName() {
    openSheet(
      '<h2>' + esc(t('nameEnLabel')) + '</h2>' +
      '<p class="muted small">' + esc(t('nameEnAsk')) + '</p>' +
      '<form class="field" data-form="name-en">' +
      '<label class="sr-only" for="asknameen">' + esc(t('nameEnLabel')) + '</label>' +
      '<input id="asknameen" type="text" maxlength="60" dir="ltr" placeholder="Alireza" autocomplete="off" autofocus>' +
      '<div class="btn-row"><button class="btn btn-primary" type="submit">' + esc(t('done')) + '</button>' +
      '<button class="btn btn-ghost" type="button" data-act="close-sheet">' + esc(t('later')) + '</button></div></form>'
    );
  }

  // ----- settings
  function openSettings() {
    const th = S.settings.theme || 'light';
    openSheet(
      '<h2>' + esc(t('settings')) + '</h2>' +
      '<div class="field"><label for="setname">' + esc(t('whose')) + '</label>' +
      '<input id="setname" type="text" maxlength="60" value="' + esc(S.settings.name || '') + '"></div>' +
      '<div class="field"><label for="setnameen">' + esc(t('nameEnLabel')) + '</label>' +
      '<input id="setnameen" type="text" maxlength="60" dir="ltr" autocomplete="off" placeholder="Alireza" value="' + esc(S.settings.nameEn || '') + '">' +
      '<span class="muted tiny">' + esc(t('nameEnHint')) + '</span></div>' +
      '<div class="field"><span class="label">' + esc(t('language')) + '</span><div class="seg">' +
      '<button data-act="set-lang" data-lang="fa" aria-pressed="' + (lang() === 'fa') + '">فارسی</button>' +
      '<button data-act="set-lang" data-lang="en" aria-pressed="' + (lang() === 'en') + '">English</button></div></div>' +
      '<div class="field"><span class="label">' + esc(t('theme')) + '</span><div class="chips">' +
      ['auto', 'dark', 'light'].map((k) => '<button class="chip" data-act="set-theme" data-theme="' + k + '" aria-pressed="' + (th === k) + '">' +
        esc(t(k === 'auto' ? 'themeAuto' : k === 'dark' ? 'themeDark' : 'themeLight')) + '</button>').join('') + '</div></div>' +
      '<div class="field"><span class="label">' + esc(t('backupTitle')) + '</span>' +
      '<span class="muted small">' + esc(t('backupHint')) + '</span>' +
      '<span class="muted tiny" data-storage></span>' +
      '<div class="btn-row"><button class="btn btn-primary" data-act="backup">' + esc(t('backupNow')) + '</button>' +
      '<label class="btn btn-ghost" for="restorefile">' + esc(t('restore')) + '</label></div>' +
      '<input id="restorefile" class="sr-only" type="file" accept=".zip,application/zip" data-restore></div>' +
      '<button class="btn btn-ghost" data-act="open-import">' + esc(t('importTitle')) + '</button>' +
      '<button class="btn btn-primary" data-act="save-settings">' + esc(t('done')) + '</button>'
    );
    showStorage();
  }

  async function showStorage() {
    const el = sheet() && sheet().querySelector('[data-storage]');
    if (!el) return;
    const bytes = S.entries.reduce((n, e) => n + (e.bytes || 0), 0);
    let line = t('storageUsed', { mb: num(Math.round(bytes / 1048576)) });
    try {
      if (navigator.storage && navigator.storage.persisted && (await navigator.storage.persisted())) line += SEP() + t('storagePersistent');
    } catch (e) { /* ignore */ }
    if (S.settings.lastBackupAt) line += SEP() + t('lastBackup', { d: fmtDay(S.settings.lastBackupAt) });
    el.textContent = line;
  }

  // ----- backup & restore
  // A backup is one .zip: journal.json (titles, chapters, dates, moods) plus every recording,
  // named by date and title so the files are useful even without this app.
  const EXT_OF = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
  function backupFileName(e) {
    const d = new Date(e.startedAt);
    const p = (n) => String(n).padStart(2, '0');
    const stamp = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
    const title = (e.title || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 60);
    return 'audio/' + stamp + (title ? ' ' + title : '') + ' [' + e.id + '].' + (EXT_OF[e.mime] || 'm4a');
  }

  async function makeBackup() {
    toast(t('backupMaking'));
    const files = [];
    const manifest = { app: 'aloud', version: 1, exportedAt: nowIso(), settings: S.settings, chapters: S.chapters, entries: [] };
    for (const e of S.entries) {
      const rec = await DB.get('audio', e.id);
      if (!rec) continue;
      const name = backupFileName(e);
      files.push({ name, data: new Uint8Array(await rec.blob.arrayBuffer()), date: new Date(e.startedAt) });
      manifest.entries.push(Object.assign({}, e, { file: name }));
    }
    files.unshift({ name: 'journal.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 1)) });
    const blob = new Blob(window.RZip.zipParts(files), { type: 'application/zip' });
    const fname = 'aloud-backup-' + nowIso().slice(0, 10) + '.zip';
    const file = new File([blob], fname, { type: 'application/zip' });
    let done = false;
    // On the iPhone the share sheet offers "Save to Files", including iCloud Drive.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: fname }); done = true; } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    if (!done) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    await putSettings({ lastBackupAt: nowIso() });
    toast(t('backupDone'));
    if (S.view === 'home') render();
    showStorage();
  }

  async function restoreBackup(file) {
    try {
      const items = window.RZip.unzip(new Uint8Array(await file.arrayBuffer()));
      const byName = new Map(items.map((i) => [i.name, i.data]));
      const manifest = JSON.parse(new TextDecoder().decode(byName.get('journal.json')));
      if (!manifest || manifest.app !== 'aloud') throw new Error('not_aloud');
      for (const ch of manifest.chapters || []) {
        if (!S.chapters.some((c) => c.id === ch.id)) { await DB.put('chapters', ch); S.chapters.push(ch); }
      }
      let added = 0;
      for (const e of manifest.entries || []) {
        if (S.entries.some((x) => x.id === e.id)) continue;
        const data = byName.get(e.file);
        if (!data) continue;
        const entry = Object.assign({}, e);
        delete entry.file;
        const blob = new Blob([data], { type: entry.mime || 'audio/mp4' });
        await DB.tx(['entries', 'audio'], 'readwrite', ([es, as]) => { es.put(entry); as.put({ id: entry.id, blob }); });
        S.entries.push(entry);
        added++;
      }
      S.entries.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      if (!S.settings.name && manifest.settings && manifest.settings.name) await putSettings({ name: manifest.settings.name, lang: manifest.settings.lang || lang() });
      toast(t('restored', { n: num(added) }));
      closeSheet();
      S.view = S.settings.name ? 'home' : 'welcome';
      render();
    } catch (e) {
      console.error(e);
      toast(t('restoreFailed'));
    }
  }

  // ----- import archive
  const EXT_MIME = { m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm', ogg: 'audio/ogg', oga: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav' };
  function openImport() {
    const ch = currentChapter();
    openSheet(
      '<h2>' + esc(t('importTitle')) + '</h2>' +
      '<p class="muted small">' + esc(t('importHint')) + '</p>' +
      '<div class="field"><span class="label">' + esc(t('importInto')) + '</span>' + chapterChips(ch ? ch.id : '__new') + '</div>' +
      '<div class="btn-row"><label class="btn btn-primary" for="impdir">' + esc(t('chooseFolder')) + '</label>' +
      '<label class="btn btn-ghost" for="impfiles">' + esc(t('chooseFiles')) + '</label></div>' +
      '<input id="impdir" class="sr-only" type="file" webkitdirectory multiple data-import>' +
      '<input id="impfiles" class="sr-only" type="file" accept="audio/*,.m4a" multiple data-import>' +
      '<div data-import-status class="muted small"></div><div class="progress" hidden data-import-bar><span></span></div>' +
      '<button class="btn btn-ghost" data-act="close-sheet">' + esc(t('close')) + '</button>'
    );
  }

  function guessDate(file) {
    const relPath = file.webkitRelativePath || file.name;
    const dm = /(\d{4})-(\d{2})-(\d{2})/.exec(relPath);
    const tm = /(?:^|[^\d])(\d{1,2})[-_.:](\d{2})[-_.:](\d{2})(?:[^\d]|$)/.exec(file.name);
    if (dm) {
      const d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]),
        tm ? Number(tm[1]) : 12, tm ? Number(tm[2]) : 0, tm ? Number(tm[3]) : 0);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date(file.lastModified || Date.now());
  }

  function audioDuration(file) {
    return new Promise((resolve) => {
      const a = document.createElement('audio');
      const url = URL.createObjectURL(file);
      const done = (v) => { URL.revokeObjectURL(url); resolve(v); };
      const timer = setTimeout(() => done(0), 8000);
      a.preload = 'metadata';
      a.onloadedmetadata = () => { clearTimeout(timer); done(Number.isFinite(a.duration) ? Math.round(a.duration) : 0); };
      a.onerror = () => { clearTimeout(timer); done(0); };
      a.src = url;
    });
  }

  function hashId(str) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < str.length; i++) {
      h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619);
      h2 = Math.imul(h2 + str.charCodeAt(i), 2246822519);
    }
    return 'imp-' + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
  }

  async function runImport(fileList) {
    const files = Array.from(fileList).filter((f) => {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      return !f.name.startsWith('.') && (EXT_MIME[ext] || (f.type && f.type.startsWith('audio/')));
    });
    const status = sheet().querySelector('[data-import-status]');
    const bar = sheet().querySelector('[data-import-bar]');
    if (!files.length) { status.textContent = t('importNone'); return; }
    let chapterId;
    try { chapterId = await resolveChapter(); } catch (e) { toast(t('saveFailed')); return; }
    const items = files.map((f) => ({ f, date: guessDate(f) })).sort((a, b) => a.date - b.date);
    bar.hidden = false;
    let ok = 0;
    for (let i = 0; i < items.length; i++) {
      const { f, date } = items[i];
      status.textContent = t('importing', { i: num(i + 1), n: num(items.length) });
      bar.firstChild.style.width = Math.round((i / items.length) * 100) + '%';
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      const mime = EXT_MIME[ext] || f.type;
      try {
        const durationSec = await audioDuration(f);
        const importKey = hashId((f.webkitRelativePath || f.name) + '|' + f.size + '|' + f.lastModified);
        if (S.entries.some((e) => e.importKey === importKey)) continue;
        const blob = f.type === mime ? f : new Blob([f], { type: mime });
        await addEntry({ startedAt: date.toISOString(), durationSec, chapterId, title: '', source: 'import', importKey }, blob);
        ok++;
      } catch (e) { console.warn('import failed', f.name, e); }
    }
    bar.firstChild.style.width = '100%';
    status.textContent = t('imported', { n: num(ok) });
    render();
  }

  // ---------------------------------------------------------------- events
  const actions = {
    'contents': () => { S.view = 'contents'; render(); window.scrollTo(0, 0); },
    'home': () => { S.view = 'home'; render(); window.scrollTo(0, 0); },
    'settings': openSettings,
    'calendar': () => openCalendar(false),
    'cal-prev': () => moveMonth(-1),
    'cal-next': () => moveMonth(1),
    'cal-mode': (el) => { S.calMode = el.dataset.mode; openCalendar(true); },
    'cal-day': (el) => { S.calSelected = el.dataset.key; openCalendar(true); },
    'next-hope': () => {
      const list = (window.HOPE && window.HOPE[lang()]) || [];
      if (!list.length) return;
      S.hopeIndex = (S.hopeIndex + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
      const el = app.querySelector('[data-hope]');
      if (el) { el.textContent = list[S.hopeIndex]; el.parentElement.classList.remove('swap'); void el.offsetWidth; el.parentElement.classList.add('swap'); }
    },
    'record': () => Rec.start(),
    'rec-mark': () => Rec.mark(),
    'rec-pause': () => Rec.togglePause(),
    'rec-stop': () => Rec.stop(),
    'toggle-lang': async () => {
      await safe(putSettings({ lang: lang() === 'fa' ? 'en' : 'fa' }));
      render();
      if (lang() === 'en' && !S.settings.nameEn && !S.askedNameEn) { S.askedNameEn = true; askEnglishName(); }
    },
    'set-lang': async (el) => {
      S.settings.lang = el.dataset.lang;
      if (S.view === 'welcome') {
        const nm = app.querySelector('#owner');
        if (nm) S.settings.name = nm.value;
        render();
      } else {
        await safe(putSettings({ lang: el.dataset.lang }));
        render();
        openSettings();
        const box = sheet() && sheet().querySelector('#setnameen');
        if (el.dataset.lang === 'en' && box && !box.value) box.focus();
      }
    },
    'set-theme': async (el) => {
      S.settings.theme = el.dataset.theme; applyLangTheme();
      sheet().querySelectorAll('[data-act="set-theme"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === el.dataset.theme)));
      await safe(putSettings({ theme: el.dataset.theme }));
    },
    'finish-welcome': async (el) => {
      const name = (app.querySelector('#owner').value || '').trim();
      if (!name) { app.querySelector('#owner').focus(); return; }
      el.disabled = true;
      try {
        await putSettings({ name, lang: lang() });
        if (!S.chapters.length) await createChapter(t('defaultChapter'), true);
        S.view = 'home'; render(); playIntro();
        askPersistence();
      } catch (e) { el.disabled = false; toast(t('saveFailed')); }
    },
    'save-settings': async () => {
      const name = (sheet().querySelector('#setname').value || '').trim();
      const nameEn = (sheet().querySelector('#setnameen').value || '').trim().slice(0, 60);
      const patch = {};
      if (name && name !== S.settings.name) patch.name = name;
      if (nameEn !== (S.settings.nameEn || '')) patch.nameEn = nameEn;
      if (Object.keys(patch).length) await safe(putSettings(patch));
      closeSheet(); render();
    },
    'toggle-chapter': (el) => { S.openChapter = S.openChapter === el.dataset.id ? null : el.dataset.id; render(); },
    'play': (el) => { const e = S.entries.find((x) => x.id === el.dataset.id); if (e) openPlayer(e); },
    'play-chapter': (el) => playChapter(el.dataset.id),
    'rename-chapter': (el) => openChapterName(S.chapters.find((c) => c.id === el.dataset.id)),
    'new-chapter': () => openChapterName(null),
    'toggle-play': () => { if (audio.paused) safe(audio.play()); else audio.pause(); },
    'skip': (el) => { audio.currentTime = Math.max(0, audio.currentTime + Number(el.dataset.sec)); },
    'seek-to': (el) => { audio.currentTime = Number(el.dataset.sec); safe(audio.play()); },
    'rate': (el) => {
      audio.playbackRate = Number(el.dataset.rate);
      sheet().querySelectorAll('[data-act="rate"]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === audio.playbackRate)));
    },
    'edit-entry': (el) => { const e = S.entries.find((x) => x.id === el.dataset.id); if (e) openEdit(e); },
    'save-edit': (el) => saveEdit(el.dataset.id),
    'delete-entry': (el) => deleteEntry(el.dataset.id),
    'pick-mood': (el) => sheetPick('pick-mood', el.getAttribute('aria-pressed') === 'true' ? null : el.dataset.mood),
    'pick-chapter': (el) => {
      sheetPick('pick-chapter', el.dataset.id);
      const box = sheet().querySelector('[data-newch]');
      if (box) { box.hidden = el.dataset.id !== '__new'; if (!box.hidden) box.querySelector('input').focus(); }
    },
    'save-rec': (el) => saveRecording(el.dataset.later === '1'),
    'discard-rec': discardRecording,
    'close-sheet': closeSheet,
    'open-import': openImport,
    'backup': () => { makeBackup().catch((e) => { console.error(e); toast(t('backupFailed')); }); }
  };

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (el && actions[el.dataset.act]) { ev.preventDefault(); actions[el.dataset.act](el); return; }
    // Tapping the dimmed area closes a sheet, except the save sheet, which must be answered.
    if (ev.target.matches('[data-overlay]') && !saving) closeSheet();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && sheetRoot.firstChild && !saving) closeSheet();
  });

  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'owner') {
      const n = app.querySelector('[data-cover-name]');
      if (n) n.textContent = ev.target.value || t('yourName');
    }
    if (ev.target.matches('[data-seek]')) {
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (dur) audio.currentTime = (Number(ev.target.value) / 1000) * dur;
    }
  });

  document.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-import]') && ev.target.files && ev.target.files.length) runImport(ev.target.files);
    if (ev.target.matches('[data-restore]') && ev.target.files && ev.target.files[0]) restoreBackup(ev.target.files[0]);
  });

  document.addEventListener('submit', async (ev) => {
    const form = ev.target;
    if (form.dataset.form === 'name-en') {
      ev.preventDefault();
      const nameEn = form.querySelector('#asknameen').value.trim().slice(0, 60);
      if (nameEn) await safe(putSettings({ nameEn }));
      closeSheet(); render();
      return;
    }
    if (form.dataset.form === 'chapter') {
      ev.preventDefault();
      const title = form.querySelector('#chname').value.trim();
      const titleEn = form.querySelector('#chnameen').value.trim().slice(0, 120);
      if (!title) return;
      try {
        if (form.dataset.id) {
          const ch = S.chapters.find((c) => c.id === form.dataset.id);
          if (ch) { ch.title = title.slice(0, 120); ch.titleEn = titleEn; ch.auto = false; await DB.put('chapters', ch); }
        } else {
          const ch = await createChapter(title);
          ch.titleEn = titleEn; await DB.put('chapters', ch);
          S.openChapter = ch.id;
        }
        closeSheet(); render();
      } catch (e) { toast(t('saveFailed')); }
    }
  });

  // ---------------------------------------------------------------- tile frame
  // The tiled band around the app: a rounded hole is cut out of a full-screen tile layer.
  function sizeFrame() {
    const el = document.getElementById('frame');
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const b = parseFloat(css.getPropertyValue('--band')) || 16;
    const r = parseFloat(css.getPropertyValue('--frame-radius')) || 38;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const d = 'M0 0H' + w + 'V' + h + 'H0Z' +
      'M' + (b + r) + ' ' + b + 'H' + (w - b - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (w - b) + ' ' + (b + r) +
      'V' + (h - b - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (w - b - r) + ' ' + (h - b) +
      'H' + (b + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + b + ' ' + (h - b - r) +
      'V' + (b + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (b + r) + ' ' + b + 'Z';
    el.style.clipPath = 'path(evenodd, "' + d + '")';
    el.style.webkitClipPath = el.style.clipPath;
  }
  window.addEventListener('resize', sizeFrame);
  sizeFrame();

  // ---------------------------------------------------------------- start
  async function boot() {
    try { S.hasLogo = (await fetch('icons/ar-logo.png', { method: 'HEAD' })).ok; } catch (e) { S.hasLogo = false; }
    try { await loadState(); } catch (e) {
      console.error(e);
      app.innerHTML = '<section class="screen center"><div class="grow"></div><p>' + esc(t('noStorage')) + '</p><div class="grow"></div></section>';
      return;
    }
    S.view = S.settings.name ? 'home' : 'welcome';
    render();
    if (S.view === 'home') playIntro();
    await safe(recoverSessions());
    if (S.settings.name) askPersistence();
    if (S.view === 'home' || S.view === 'contents') render();
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  // Tiny hooks for automated tests; harmless in normal use.
  window.__aloud = { S, t, fmtClock, guessDate, hashId, DB };

  boot();
})();
