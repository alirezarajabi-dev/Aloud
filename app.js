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
  const fmtDayTime = (iso) => fmtDay(iso) + SEP() + fmtDate(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  // Weekday first in both languages (the Persian locale would put it last).
  const fmtLong = (iso) => fmtDate(iso, { weekday: 'long' }) + (lang() === 'fa' ? '، ' : ', ') + fmtDate(iso, { day: 'numeric', month: lang() === 'fa' ? 'long' : 'short', year: 'numeric' });
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
    return (c === 1 ? '1 notebook' : c + ' notebooks') + ' · ' + (p === 1 ? '1 page' : p + ' pages');
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
    camera: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    x: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    speakerLow: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9v6h4l5 4V5L9 9z"/></svg>',
    speakerHigh: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    leaf: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/></svg>',
    note: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
    check: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    trash: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10 11v5M14 11v5"/></svg>',
    hand: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 14a8 8 0 0 1-8 8"/><path d="M18 11v-1a2 2 0 0 0-4 0"/><path d="M14 10V9a2 2 0 0 0-4 0v1"/><path d="M10 9.5V4a2 2 0 0 0-4 0v10"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
    spark: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
    down: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    pen: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    stop: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    close: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
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
  // On iPhone a picked file (or a slice of a backup zip) is only borrowed: after the app restarts it can vanish.
  // Copying the bytes makes the phone keep its own copy.
  async function ownCopy(blob, type) {
    return new Blob([await blob.arrayBuffer()], { type: type || blob.type || '' });
  }
  async function readable(rec) {
    if (!rec || !rec.blob) return false;
    try { await rec.blob.slice(0, 16).arrayBuffer(); return true; } catch (e) { return false; }
  }
  // Calm music ("Sunrise", in music.js) made right here in the browser — no music file, no one else's song.
  // It plays only in your ears; the microphone records your voice alone (best with headphones).
  const Ambient = {
    track: (() => { try { const v = localStorage.getItem('aloud-music'); return v === '1' || v === '2' ? Number(v) : 0; } catch (e) { return 0; } })(),
    get on() { return this.track > 0; },
    // Volume bar, 0–100. Starts gentle: just a feeling underneath.
    vol: (() => { try { const v = Number(localStorage.getItem('aloud-music-vol')); return Number.isFinite(v) && localStorage.getItem('aloud-music-vol') !== null ? v : 35; } catch (e) { return 35; } })(),
    setVol(v) {
      this.vol = Math.max(0, Math.min(100, Math.round(v)));
      try { localStorage.setItem('aloud-music-vol', String(this.vol)); } catch (e) { /* private mode */ }
      if (this.song) this.song.setVolume(this.vol / 100);
    },
    ctx: null, song: null,
    prime() { // must run inside the tap, so iPhone allows sound
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { this.ctx = null; }
    },
    start() {
      this.prime(); if (!this.ctx || this.song || !window.AloudMusic) return;
      this.song = window.AloudMusic.create(this.ctx, this.ctx.destination, this.track);
      this.song.start(this.vol / 100);
    },
    stop(fade) {
      if (!this.song) return;
      this.song.stop(fade == null ? 0.5 : fade); this.song = null;
    },
    // After a recording: silence at once and switch the music engine off entirely, so nothing
    // keeps sounding when iPhone moves the sound back to the speaker.
    halt() {
      this.stop(0.25);
      const c = this.ctx; this.ctx = null;
      if (c) setTimeout(() => { try { c.close(); } catch (e) { /* closed */ } }, 350);
    },
    choose(n) {
      this.prime();
      this.track = n === 1 || n === 2 ? n : 0;
      try { localStorage.setItem('aloud-music', String(this.track)); } catch (e) { /* private mode */ }
      this.stop();
      if (this.on && ((Rec.active && !Rec.paused) || !audio.paused)) this.start();
    }
  };

  // Music: off, piece 1 or piece 2.
  function musicChooser(hint) {
    return '<div class="music-choose"><span class="mc-label">' + I.note + esc(t('calmMusic')) + '</span>' +
      '<div class="seg three mc-seg">' + [0, 1, 2].map((n) => '<button data-act="music" data-n="' + n + '" aria-pressed="' + (Ambient.track === n) + '">' +
        esc(n ? num(n) : t('off')) + '</button>').join('') + '</div>' +
      '<label class="mc-vol"><span class="sr-only">' + esc(t('musicVolume')) + '</span>' + I.speakerLow +
      '<input type="range" min="0" max="100" step="1" value="' + Ambient.vol + '" data-music-vol aria-label="' + esc(t('musicVolume')) + '">' + I.speakerHigh + '</label>' +
      '<small class="muted">' + esc(hint) + '</small></div>';
  }

  // Gratitude: a daily kind of page. Older pages simply titled "شکرگزاری" / "Gratitude" count too.
  const GRAT_WORDS = ['شکرگزاری', 'شکر گزاری', 'gratitude'];
  const isGratitude = (e) => !!e && (e.kind === 'gratitude' || GRAT_WORDS.includes(String(e.title || '').trim().toLowerCase()));
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const gratitudeToday = () => S.entries.some((e) => isGratitude(e) && sameDay(new Date(e.startedAt), new Date()));

  // Pages are kept in true time order (by the moment they were recorded), never by text.
  const when = (e) => { const n = Date.parse(e.startedAt); return Number.isNaN(n) ? 0 : n; };
  function sortEntries(list) { return list.sort((a, b) => when(a) - when(b) || String(a.id).localeCompare(String(b.id))); }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const nowIso = () => new Date().toISOString();

  async function loadCoverPhoto() {
    if (S.coverUrl) { URL.revokeObjectURL(S.coverUrl); S.coverUrl = null; }
    const rec = await DB.get('kv', 'coverPhoto');
    const blob = await photoBlob(rec);
    if (blob) S.coverUrl = URL.createObjectURL(blob);
  }

  // iPhone Home Screen apps can lose a stored Blob after a restart, so the photo is kept as raw bytes.
  async function photoBlob(rec) {
    if (!rec) return null;
    if (rec.buf) return new Blob([rec.buf], { type: rec.type || 'image/jpeg' });
    if (!rec.blob) return null;
    try {
      const buf = await rec.blob.arrayBuffer();
      await DB.put('kv', { buf, type: rec.blob.type || 'image/jpeg' }, 'coverPhoto');
      return new Blob([buf], { type: rec.blob.type || 'image/jpeg' });
    } catch (e) { return null; }
  }
  async function savePhoto(blob) {
    await DB.put('kv', { buf: await blob.arrayBuffer(), type: blob.type || 'image/jpeg' }, 'coverPhoto');
  }

  // Square-crops and shrinks a chosen picture so it stays small on the phone.
  async function makeCoverPhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const out = 640;
      const c = document.createElement('canvas');
      c.width = out; c.height = out;
      c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
      return await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.86));
    } finally { URL.revokeObjectURL(url); }
  }

  async function setCoverPhoto(file) {
    try {
      const blob = await makeCoverPhoto(file);
      if (!blob) throw new Error('no_blob');
      await savePhoto(blob);
      await loadCoverPhoto();
      toast(t('photoSaved'));
      if (sheet()) openSettings();
      render();
    } catch (e) { console.error(e); toast(t('photoFailed')); }
  }

  async function loadState() {
    S.settings = (await DB.get('kv', 'settings')) || {};
    await safe(loadCoverPhoto());
    S.chapters = (await DB.all('chapters')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    S.entries = sortEntries(await DB.all('entries'));
  }

  async function putSettings(patch) {
    S.settings = Object.assign({}, S.settings, patch);
    if (!S.settings.createdAt) S.settings.createdAt = nowIso();
    await DB.put('kv', S.settings, 'settings');
  }

  // Chapters the app makes by itself follow the interface language; chapters you name keep your words.
  const AUTO_TITLES = ['فصل اول', 'Chapter One', 'دفتر اول', 'Notebook One'];
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
      kind: meta.kind === 'gratitude' ? 'gratitude' : undefined,
      source: meta.source || 'recorded',
      importKey: meta.importKey || null,
      createdAt: nowIso()
    };
    const own = await ownCopy(blob, entry.mime);
    await DB.tx(['entries', 'audio'], 'readwrite', ([es, as]) => { es.put(entry); as.put({ id: entry.id, blob: own }); });
    S.entries.push(entry);
    sortEntries(S.entries);
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
    if (meta) meta.content = theme === 'dark' ? '#10201F' : '#F7F4EE';
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
    return ''; // the simpler design keeps only the gilded rule on the cover
  }

  function coverHtml(small) {
    const name = (lang() === 'en' && S.settings.nameEn) || S.settings.name || t('yourName');
    const meta = S.entries.length
      ? pagesText(S.entries.length)
      : t('noPagesYet');
    const photo = S.coverUrl
      ? '<span class="cover-photo"><img src="' + S.coverUrl + '" alt=""></span>'
      : (small ? '<img class="orn-med" src="orn/medallion.svg" alt="" aria-hidden="true">'
        : '<span class="cover-photo empty"><span class="ph">' + I.camera + '<span>' + esc(t('addCoverPhotoShort')) + '</span></span></span>');
    const photoSlot = small ? photo
      : '<label class="photo-slot" for="coverfile-home" data-no-act aria-label="' + esc(S.coverUrl ? t('changePhoto') : t('addCoverPhoto')) + '">' + photo + '</label>';
    const inner = spineHtml() + '<div class="frame" aria-hidden="true"></div>' + cornersHtml() +
      '<span class="title">' + photoSlot +
      '<span class="t1">' + esc(t('journalOf')) + '</span><span class="t2' + (name.length > 7 ? ' long' : '') + '" data-cover-name>' + esc(name) + '</span></span>' +
      (small ? '' : bookSwitch()) + '<span class="meta">' + esc(meta) + '</span>';
    if (small) return '<div class="cover small" aria-hidden="true">' + inner + '</div>';
    // A div (not a button) so the photo circle inside it can be its own tap target.
    return '<div class="cover" data-act="open-book" role="button" tabindex="0" aria-label="' + esc(t('openBook')) + '">' + inner + '</div>';
  }

  function langPill() {
    const fa = lang() === 'fa';
    return '<button class="pill raised" data-act="toggle-lang" aria-label="' + (fa ? 'Switch to English' : 'تغییر به فارسی') + '">' +
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
    if (v !== 'contents') S.sel = null;
    const focus = app.querySelector('[autofocus]');
    if (focus) focus.focus();
    renderMini();
    if (window.__settleJewel) window.__settleJewel();
    cueHand();
    clearInterval(S.clockTimer);
    if (v === 'home') {
      S.clockTimer = setInterval(() => {
        const el = app.querySelector('[data-clock]');
        if (el) el.textContent = fmtCal(new Date(), defaultCal(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
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
      // Moving from Safari to the home-screen app (they keep separate storage on the iPhone): bring the journal back from a backup.
      '<div class="restore-box"><span class="muted small">' + esc(t('haveBackup')) + '</span>' +
      '<label class="small-btn raised" for="restorefile-welcome">' + esc(t('restoreFromBackup')) + '</label>' +
      '<input id="restorefile-welcome" class="sr-only" type="file" accept=".zip,application/zip" data-restore></div>' +
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

  function needsBackup() {
    if (!S.entries.length) return false;
    const last = S.settings.lastBackupAt ? new Date(S.settings.lastBackupAt) : null;
    return !last || (Date.now() - last) / 86400000 >= 7;
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
  // Reads the line aloud with the phone's own voice, if it has one for this language.
  function speak(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      const want = lang() === 'fa' ? 'fa' : 'en';
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(want));
      if (!voice && want === 'fa') return; // no Persian voice on this phone: show only
      const u = new SpeechSynthesisUtterance(text);
      u.lang = want === 'fa' ? 'fa-IR' : 'en-US';
      if (voice) u.voice = voice;
      u.rate = 0.92;
      u.pitch = 1.02;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { /* speech not available */ }
  }

  function todayHope() {
    const hopes = (window.HOPE && window.HOPE[lang()]) || [];
    if (!hopes.length) return '';
    // One line a day, the same all day long.
    const now = new Date();
    const day = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(now.getFullYear(), 0, 0)) / 86400000);
    return hopes[day % hopes.length];
  }

  // ----- opening: the journal opens; tap to reveal today's line; then the cover closes with your photo on it
  function playIntro(force) {
    if (document.querySelector('.intro')) return;
    if (!force) return; // the book opens only when you tap it
    if (false) {
      if (S.introPlayed) return;
      S.introPlayed = true;
      // On its own it opens once a day; tapping the book opens it any time.
      const today = new Date().toDateString();
      try { if (localStorage.getItem('aloud-intro') === today) return; localStorage.setItem('aloud-intro', today); } catch (e) { /* private mode */ }
    }
    // The opening is the heart of the app, so it plays even when the phone asks for less motion.
    const calm = false;
    const quote = todayHope();
    const wrap = document.createElement('div');
    wrap.className = 'intro';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', t('todaysLine'));
    let sparks = '';
    for (let i = 0; i < 16; i++) sparks += '<span class="spark" aria-hidden="true">' + I.spark + '</span>';
    const words = quote.split(' ').map((w) => '<span class="w">' + esc(w) + '</span>').join(' ');
    wrap.innerHTML = '<div class="intro-book"><div class="intro-page">' + cornersHtml() +
      '<img class="orn-head" src="orn/headpiece.svg" alt="" aria-hidden="true"><span class="eyebrow">' + esc(fmtCal(new Date(), defaultCal(), { weekday: 'long', day: 'numeric', month: 'long' })) + '</span>' +
      '<div class="intro-quote" dir="auto">' + sparks + '<span class="q-mark" aria-hidden="true">“</span><span class="q-text">' + words + '</span></div>' +
      '</div>' +
      '<div class="intro-cover">' + coverHtml(true) + '</div></div>' +
      '<button type="button" class="intro-skip" data-skip>' + esc(t('close')) + '</button>';
    document.body.appendChild(wrap);
    const timers = [];
    let closing = false;
    let closedEarly = false;
    const leave = () => {
      timers.forEach(clearTimeout);
      wrap.classList.add('out');
      const from = wrap.querySelector('.intro-quote');
      const fromBox = from && wrap.classList.contains('revealed') ? from.getBoundingClientRect() : null;
      setTimeout(() => { wrap.remove(); if (S.view === 'home') { render(); if (fromBox && !closedEarly) flyLineHome(fromBox); } }, 650);
    };
    // The cover swings shut again; your photo shines on it; then the app opens.
    const closeBook = () => {
      if (closing) return;
      closing = true;
      timers.forEach(clearTimeout);
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      if (calm) { leave(); return; }
      wrap.classList.remove('open');
      wrap.classList.add('closing');
      timers.push(setTimeout(() => wrap.classList.add('shine'), 1250));
      timers.push(setTimeout(leave, 2700));
    };
    wrap.querySelectorAll('.spark').forEach((sp) => {
      sp.style.left = (5 + Math.random() * 90) + '%';
      sp.style.top = (-15 + Math.random() * 130) + '%';
      sp.style.animationDelay = (Math.random() * 1.6).toFixed(2) + 's';
      sp.style.setProperty('--s', (0.5 + Math.random() * 0.9).toFixed(2));
    });
    const reveal = () => {
      if (wrap.classList.contains('revealed') || closing) return;
      wrap.classList.add('revealed');
      markSeen();
      wrap.querySelectorAll('.q-text .w').forEach((w, i) => { w.style.animationDelay = (0.35 + i * 0.16).toFixed(2) + 's'; });
      speak(quote);
      const n = quote.split(' ').length;
      const shown = 600 + n * 160 + 900;
      timers.push(setTimeout(() => wrap.classList.add('settled'), shown));
      // Give time to read, then close the book by itself.
      timers.push(setTimeout(closeBook, shown + 4200));
    };
    // Tap anywhere on the page (not only the words) to reveal; iPhone Safari is picky about small targets.
    const page = wrap.querySelector('.intro-page');
    page.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('[data-go]') || wrap.classList.contains('revealed')) { closeBook(); return; }
      reveal();
    });
    wrap.querySelector('[data-skip]').addEventListener('click', (e) => { e.stopPropagation(); closing = true; leave(); });
    if (calm) wrap.classList.add('open', 'calm');
    else timers.push(setTimeout(() => wrap.classList.add('open'), 750));
    // As soon as the cover opens, today's line appears by itself — no extra tap.
    timers.push(setTimeout(() => { wrap.classList.add('ready'); reveal(); }, calm ? 0 : 1900));
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
  // In Persian, the Gregorian calendar is shown the way it is written: in English, left to right.
  const latinGreg = (cal) => cal === 'gregory' && lang() === 'fa';
  function fmtNative(date, cal, opts) {
    return latinGreg(cal) ? new Intl.DateTimeFormat('en-US-u-ca-gregory', opts).format(date) : fmtCal(date, cal, opts);
  }
  // "October – November 2026" / "آبان – آذر ۱۴۰۵"
  function monthSpan(a, b, cal) {
    const m1 = fmtNative(a, cal, { month: 'long' }); const m2 = fmtNative(b, cal, { month: 'long' }); const y = fmtNative(b, cal, { year: 'numeric' });
    return (m1 === m2 ? m1 : m1 + ' – ' + m2) + ' ' + y;
  }
  const otherCal = (cal) => (cal === 'persian' ? 'gregory' : 'persian');
  const defaultCal = () => (lang() === 'fa' ? 'persian' : 'gregory');

  function dateBar() {
    const now = new Date();
    const main = defaultCal();
    const second = otherCal(main);
    return '<button class="datebar raised" data-act="calendar">' +
      // Weekday first, then the date, built by hand: the Persian locale would put the weekday last.
      '<span class="db-text"><b>' + esc(fmtCal(now, main, { weekday: lang() === 'fa' ? 'long' : 'short' }) + (lang() === 'fa' ? '، ' : ', ') + fmtCal(now, main, { day: 'numeric', month: lang() === 'fa' ? 'long' : 'short', year: 'numeric' })) + '</b>' +
      '<small dir="' + (latinGreg(second) ? 'ltr' : 'auto') + '">' + esc(fmtNative(now, second, { day: 'numeric', month: 'long', year: 'numeric' })) + '</small></span>' +
      '<span class="db-side"><span class="db-time" data-clock>' + esc(fmtCal(now, main, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })) + '</span>' +
      '<span class="tag">' + I.cal + esc(t('calendar')) + '</span></span></button>';
  }

  // Today's line stays hidden until the book is opened once that day; then it rests here until tomorrow.
  const todayKey = () => new Date().toDateString();
  function seenToday() { try { return localStorage.getItem('aloud-seen') === todayKey(); } catch (e) { return true; } }
  function markSeen() { try { localStorage.setItem('aloud-seen', todayKey()); localStorage.setItem('aloud-learned', '1'); } catch (e) { /* private mode */ } }
  function learned() { try { return localStorage.getItem('aloud-learned') === '1'; } catch (e) { return true; } }
  // A small switch at the book's corner: off each new morning, green once today's line has been read.
  function bookSwitch() {
    return '<button class="hope-switch' + (seenToday() ? ' on' : '') + '" data-act="open-book" aria-label="' + esc(t('openBook')) + '"><span class="knob"></span>' +
      // While the switch is off, a hand now and then taps right on it (see cueHand).
      (seenToday() ? '' : '<span class="tap-cue" aria-hidden="true"><i class="ripple"></i><i class="ripple r2"></i>' + I.hand + '</span>') + '</button>';
  }
  // After the book closes, today's line drifts down from where the book was and settles into its card.
  function flyLineHome(fromBox) {
    const target = app.querySelector('.hope-card [data-hope]');
    const cover = app.querySelector('.cover-area .cover');
    if (!target) return;
    const to = target.getBoundingClientRect();
    const start = cover ? cover.getBoundingClientRect() : fromBox;
    const ghost = document.createElement('div');
    ghost.className = 'line-ghost';
    ghost.textContent = target.textContent;
    ghost.dir = 'auto';
    ghost.style.left = to.left + 'px'; ghost.style.top = to.top + 'px'; ghost.style.width = to.width + 'px';
    document.body.appendChild(ghost);
    target.style.opacity = '0';
    const dx = (start.left + start.width / 2) - (to.left + to.width / 2);
    const dy = (start.top + start.height * 0.55) - (to.top + to.height / 2);
    const anim = ghost.animate([
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.55)', opacity: 0, filter: 'blur(4px)' },
      { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.55) + 'px) scale(0.8)', opacity: 1, filter: 'blur(0)', offset: 0.35 },
      { transform: 'translate(0,0) scale(1)', opacity: 1, filter: 'blur(0)' }
    ], { duration: 1600, easing: 'cubic-bezier(.25,.8,.3,1)' });
    const done = () => { ghost.remove(); target.style.opacity = ''; const card = target.closest('.hope-card'); if (card) card.classList.add('landed'); };
    anim.onfinish = done; anim.oncancel = done;
  }

  // The hand comes a moment after the home screen opens, taps the switch twice and leaves.
  // If nothing happens for a while it shows once more, then stays away.
  let cueTimers = [];
  function cueHand() {
    cueTimers.forEach(clearTimeout); cueTimers = [];
    const play = () => {
      const cue = app.querySelector('.hope-switch:not(.on) .tap-cue');
      if (!cue || sheet() || document.querySelector('.intro')) return;
      cue.classList.remove('play'); void cue.offsetWidth; cue.classList.add('play');
    };
    if (S.view !== 'home' || seenToday()) return;
    cueTimers.push(setTimeout(play, 1500));
    cueTimers.push(setTimeout(play, 1500 + 3400 + 10000));
  }

  function hopeCard() {
    const line = todayHope();
    if (!line) return '';
    // Until the switch on the book is turned on today, the card only points to the book.
    if (!seenToday()) {
      return '<div class="hope-card raised waiting"><span class="hc-label"><i aria-hidden="true"></i>' + esc(t('todaysLine')) + '</span>' +
        '<span class="hc-wait">' + esc(t('lineInBook')) + '</span></div>';
    }
    return '<div class="hope-card raised"><span class="hc-label"><i aria-hidden="true"></i>' + esc(t('todaysLine')) + '</span>' +
      '<span class="hc-text" data-hope dir="auto">' + esc(line) + '</span></div>';
  }


  // Personal AR logo in a navy-and-gold ring. Uses icons/ar-logo.png when present.
  function badgeHtml() {
    return '<span class="badge" aria-hidden="true">' + (S.hasLogo ? '<img src="icons/ar-logo.png" alt="">' : '<span class="ar">A<i>R</i></span>') + '</span>';
  }

  function dock(active) {
    return '<nav class="dock raised" aria-label="' + esc(t('appName')) + '">' +
      '<button class="dock-item' + (active === 'contents' ? ' on' : '') + '" data-act="contents">' + I.book + '<span>' + esc(t('contents')) + '</span></button>' +
      '<button class="dock-rec" data-act="record"><span class="dock-rec-btn">' + I.mic + '</span><span>' + esc(t('newPage')) + '</span></button>' +
      '<button class="dock-item' + (active === 'calendar' ? ' on' : '') + '" data-act="calendar">' + I.cal + '<span>' + esc(t('calendar')) + '</span></button>' +
      '</nav>';
  }

  function viewHome() {
    return '<section class="screen home">' +
      '<header class="topbar"><span class="brand-title">' + esc(t('appTitle')) + '</span>' +
      '<div class="top-actions">' + langPill() +
      '<button class="iconbtn raised" data-act="settings" aria-label="' + esc(t('settings')) + '">' + I.gear + (needsBackup() ? '<i class="badge-dot" aria-hidden="true"></i>' : '') + '</button></div></header>' +
      dateBar() +
      '<div class="cover-area"><div class="cover-holder">' + coverHtml(false) + '</div>' +
      '<button class="soft-btn raised grat-btn' + (gratitudeToday() ? ' done' : '') + '" data-act="record-gratitude">' +
      '<span class="grat-ico" aria-hidden="true">' + (gratitudeToday() ? I.check : I.leaf) + '</span>' + esc(t('gratitudeToday')) + '</button></div>' +
      hopeCard() +
      // Visually hidden (not display:none) so iPhone Safari still opens it from the photo circle.
      '<input id="coverfile-home" class="sr-only" type="file" accept="image/*" data-cover-photo>' +
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
    for (let i = 0; i < 7; i++) wk.push(fmtNative(addDays(new Date(2026, 0, 4 + weekStart), i), cal, { weekday: latinGreg(cal) ? 'short' : 'narrow' }));
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="cal-cell empty"></span>';
    days.forEach((d) => {
      const k = dayKey(d);
      const has = byDay.has(k);
      const sec = calParts(d, otherCal(cal)).d;
      cells += '<button class="cal-cell' + (k === todayK ? ' today-cell' : '') + (k === S.calSelected ? ' sel' : '') + '" data-act="cal-day" data-key="' + k + '" aria-label="' + esc(fmtNative(d, cal, { day: 'numeric', month: 'long' })) + '">' +
        '<span class="n">' + esc(fmtNative(d, cal, { day: 'numeric' })) + '</span>' +
        '<span class="n2">' + esc(lang() === 'fa' && !latinGreg(otherCal(cal)) ? num(sec) : String(sec)) + '</span>' +
        (has ? '<span class="dot' + (byDay.get(k).some(isGratitude) ? ' gold' : '') + '" aria-hidden="true"></span>' : '') + '</button>';
    });
    const sel = byDay.get(S.calSelected) || [];
    // The day's pages look exactly like rows in the contents: title, then time and length on their own line.
    const list = sel.length ? '<div class="plist raised cal-list">' + sel.slice().reverse().map(pageRow).join('') + '</div>'
      : '<div class="empty small">' + esc(t('noPagesThisDay')) + '</div>';
    openSheet(
      // Like a wall calendar: the right arrow goes forward, the left arrow goes back, in both languages.
      '<div class="cal-head" dir="ltr"><button class="iconbtn flip-always" data-act="cal-prev" aria-label="' + esc(t('prevMonth')) + '">' + I.back + '</button>' +
      '<div class="cal-title"><span class="cal-month" dir="' + (latinGreg(cal) ? 'ltr' : 'auto') + '">' + esc(fmtNative(start, cal, { month: 'long' }) + ' ' + fmtNative(start, cal, { year: 'numeric' })) + '</span>' +
      '<span class="cal-month2" dir="' + (latinGreg(otherCal(cal)) ? 'ltr' : 'rtl') + '">' + esc(monthSpan(start, days[days.length - 1], otherCal(cal))) + '</span></div>' +
      '<button class="iconbtn" data-act="cal-next" aria-label="' + esc(t('nextMonth')) + '">' + I.back + '</button></div>' +
      '<div class="seg"><button data-act="cal-mode" data-mode="persian" aria-pressed="' + (cal === 'persian') + '">' + esc(t('solar')) + '</button>' +
      '<button data-act="cal-mode" data-mode="gregory" aria-pressed="' + (cal === 'gregory') + '">' + esc(t('gregorian')) + '</button></div>' +
      '<div class="cal-grid' + (latinGreg(cal) ? ' latin' : '') + '" role="grid" dir="' + (latinGreg(cal) || lang() === 'en' ? 'ltr' : 'rtl') + '">' + wk.map((w) => '<span class="cal-wd">' + esc(w) + '</span>').join('') + cells + '</div>' +
      '<div>' + list + '</div>' +
      '<button class="btn btn-ghost" data-act="close-sheet">' + esc(t('close')) + '</button>'
    );
    bindCalendarSwipe();
  }

  function bindCalendarSwipe() {
    const g = sheet() && sheet().querySelector('.cal-grid');
    if (g) onSwipe(g, (d) => moveMonth(d), true); // swipe left = next month, matching the arrows
  }

  function moveMonth(dir) {
    const cal = S.calMode;
    const start = monthStart(S.calAnchor, cal);
    S.calAnchor = dir < 0 ? addDays(start, -1) : addDays(monthDays(start, cal).slice(-1)[0], 1);
    openCalendar(true);
  }

  function pageRow(e) {
    const d = new Date(e.startedAt);
    const cal = defaultCal();
    const selecting = !!S.sel;
    const picked = selecting && S.sel.has(e.id);
    return '<div class="prow' + (S.playingId === e.id ? ' playing' : '') + (picked ? ' picked' : '') + '" data-row="' + esc(e.id) + '">' +
      '<button class="prow-main" data-act="' + (selecting ? 'sel-toggle' : 'play') + '" data-id="' + esc(e.id) + '">' +
      (selecting ? '<span class="selbox" aria-hidden="true">' + (picked ? I.check : '') + '</span>' : '') +
      '<span class="dtile"><b>' + esc(fmtCal(d, cal, { day: 'numeric' })) + '</b><small>' + esc(fmtCal(d, cal, { month: 'short' })) + '</small></span>' +
      '<span class="ptxt"><span dir="auto" class="pt' + (e.title ? '' : ' untitled') + '">' + (isGratitude(e) ? '<i class="grat-mark" aria-label="' + esc(t('gratitude')) + '">' + I.leaf + '</i>' : '') + esc(e.title || t('untitledTap')) + '</span>' +
      '<span class="pm"><i class="mdot ' + moodClass(e.mood) + '" aria-hidden="true"></i>' + esc(fmtLen(e.durationSec) + SEP() + fmtDate(e.startedAt, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })) + '</span></span></button>' +
      (selecting ? '' :
        '<button class="pbtn edit raised" data-act="edit-entry" data-id="' + esc(e.id) + '" aria-label="' + esc(t('edit')) + '">' + I.pen + '</button>' +
        '<button class="pbtn play" data-act="play" data-id="' + esc(e.id) + '" aria-label="' + esc(t('play')) + '">' + I.play + '</button>') + '</div>';
  }


  // Pages folded by month: the newest month is open, older months stay closed until tapped.
  const monthKey = (e) => { const d = new Date(e.startedAt); const cal = defaultCal(); return fmtCal(d, cal, { month: 'long' }) + ' ' + fmtCal(d, cal, { year: 'numeric' }); };
  const scopeIds = () => S.entries.filter((x) => monthKey(x) === S.selMonth).map((x) => x.id);
  function monthGroups(list) {
    const cal = defaultCal();
    const groups = [];
    for (const e of list) {
      const d = new Date(e.startedAt);
      const key = monthKey(e);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(e); else groups.push({ key, items: [e] });
    }
    // Each month opens and closes on its own; nothing else moves. Only the newest month starts open.
    if (!S.openMonths) S.openMonths = {};
    const ids = groups.map((g) => g.key);
    return groups.map((g, i) => {
      // While selecting, only the month being selected in is open; the others wait.
      if (S.sel) {
        const mine = ids[i] === S.selMonth;
        return '<div class="mgroup raised' + (mine ? ' open' : ' dim') + '">' +
          '<div class="mhead"><b>' + esc(g.key) + '</b><span class="muted">' + esc(pagesText(g.items.length)) + '</span></div>' +
          (mine ? '<div class="plist">' + g.items.map(pageRow).join('') + '</div>' : '') + '</div>';
      }
      const open = ids[i] in S.openMonths ? S.openMonths[ids[i]] : i === 0;
      return '<div class="mgroup raised' + (open ? ' open' : '') + '">' +
        '<button type="button" class="mhead" data-act="toggle-month" data-id="' + esc(ids[i]) + '" aria-expanded="' + open + '"><b>' + esc(g.key) + '</b><span class="muted">' + esc(pagesText(g.items.length)) + '</span>' + I.down + '</button>' +
        '<div class="plist">' + (S.filter === 'gratitude' ? '<button class="month-play" data-act="play-month" data-ids="' + esc(g.items.slice().reverse().map((x) => x.id).join(',')) + '">' + I.play + esc(t('playMonthGratitude', { m: g.key })) + '</button>' : '') +
        g.items.map(pageRow).join('') + '</div></div>';
    }).join('');
  }

  // Selection mode, reached by holding a page: pick several pages, or all, and delete them together.
  function selBar(list) {
    const n = S.sel.size;
    const all = n === scopeIds().length && n > 0;
    return '<div class="selbar raised"><b>' + esc(t('nSelected', { n: num(n) })) + '</b>' +
      '<span class="selbar-btns"><button class="small-btn raised" data-act="sel-all">' + esc(all ? t('selectNone') : t('selectAll')) + '</button>' +
      '<button class="small-btn danger" data-act="sel-delete"' + (n ? '' : ' disabled') + '>' + esc(t('delete')) + '</button>' +
      '<button class="small-btn raised" data-act="sel-cancel">' + esc(t('cancel')) + '</button></span></div>';
  }

  // Holding a page opens its actions.
  function openPageActions(e) {
    openSheet('<h2 dir="auto">' + esc(entryTitle(e)) + '</h2>' +
      '<span class="muted small">' + esc(fmtLong(e.startedAt)) + '</span>' +
      '<div class="action-list">' +
      '<button class="action raised" data-act="pa-rename" data-id="' + esc(e.id) + '">' + I.pen + '<span>' + esc(t('rename')) + '</span></button>' +
      '<button class="action raised" data-act="pa-select" data-id="' + esc(e.id) + '">' + I.check + '<span>' + esc(t('select')) + '</span></button>' +
      '<button class="action raised" data-act="pa-select-all" data-id="' + esc(e.id) + '">' + I.check + '<span>' + esc(t('selectAll')) + '</span></button>' +
      '<button class="action raised danger" data-act="pa-delete" data-id="' + esc(e.id) + '">' + I.trash + '<span>' + esc(t('delete')) + '</span></button>' +
      '</div><button class="btn btn-ghost" data-act="close-sheet">' + esc(t('close')) + '</button>');
  }

  // A calm in-app question instead of the browser's pop-up.
  function confirmDelete(ids) {
    openSheet('<h2>' + esc(ids.length > 1 ? t('deleteNTitle', { n: num(ids.length) }) : t('delete')) + '</h2>' +
      '<p class="muted">' + esc(ids.length > 1 ? t('deleteNConfirm', { n: num(ids.length) }) : t('deleteConfirm')) + '</p>' +
      '<div class="btn-row"><button class="btn btn-danger" data-act="do-delete" data-ids="' + esc(ids.join(',')) + '">' + esc(t('delete')) + '</button>' +
      '<button class="btn btn-ghost" data-act="close-sheet">' + esc(t('cancel')) + '</button></div>');
  }

  function viewContents() {
    // A journal: every page in date order, folded by month. No notebooks to pick or open.
    const all = S.entries.slice().reverse();
    const list = S.filter === 'gratitude' ? all.filter(isGratitude) : all;
    const memory = onThisDay();
    const chips = all.some(isGratitude) ? '<div class="seg filter-seg"><button data-act="filter" data-f="" aria-pressed="' + (S.filter !== 'gratitude') + '">' + esc(t('all')) + '</button>' +
      '<button data-act="filter" data-f="gratitude" aria-pressed="' + (S.filter === 'gratitude') + '">' + I.leaf + esc(t('gratitude')) + '</button></div>' : '';
    return '<section class="screen list">' +
      '<header class="topbar"><button class="iconbtn raised flip-rtl" data-act="back" aria-label="' + esc(t('back')) + '">' + I.back + '</button>' +
      '<span class="brand-title grow">' + esc(t('contents')) + '</span></header>' +
      (S.sel ? selBar(list) : backupBanner() + chips) +
      (memory && !S.sel && S.filter !== 'gratitude' ? '<button class="memory raised" data-act="play" data-id="' + esc(memory.e.id) + '"><span class="pbtn play" aria-hidden="true">' + I.play + '</span>' +
        '<span class="ptxt"><span class="hc-label">' + esc(t('onThisDay', { when: memory.when })) + '</span><span class="pt" dir="auto">' + esc(entryTitle(memory.e)) + '</span></span></button>' : '') +
      (list.length ? monthGroups(list) : '<div class="empty">' + esc(t('noPagesYet')) + '</div>') +
      '</section>' + dock('contents');
  }


  function viewRecorder() {
    const grat = Rec.kind === 'gratitude';
    const pageNo = S.entries.length + 1;
    return '<section class="screen' + (grat ? ' grat' : '') + '">' +
      '<div class="rec-head">' + (grat ? '<span class="ch">' + I.leaf + esc(t('gratitude')) + '</span>' : '') +
      '<span class="pg">' + esc(grat ? t('gratitudeHint') : t('pageN', { n: num(pageNo) })) + '</span>' +
      '<span class="muted small">' + esc(fmtLong(Rec.startedAt || new Date().toISOString())) + '</span></div>' +
      '<div class="grow"></div>' +
      '<div class="rec-state"><span class="rec-dot live" data-rec-dot></span><span data-rec-state>' + esc(t('recording')) + '</span></div>' +
      '<div class="timer" data-timer>' + fmtClock(0) + '</div>' +
      '<canvas class="wave" data-wave width="800" height="192" aria-hidden="true"></canvas>' +
      '<div class="note" data-marks>' + esc(t('keepOpen')) + '</div>' +
      musicChooser(t('withHeadphones')) +
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

    async start(kind) {
      this.kind = kind || 'page';
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { toast(t('micUnsupported')); return; }
      // The sound engine is made inside the tap, so iPhone lets it run.
      try { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); safe(this.ctx.resume()); } catch (e) { this.ctx = null; }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
      } catch (e) {
        if (this.ctx) safe(this.ctx.close());
        this.ctx = null; this.chainOut = null;
        toast(t('micDenied'));
        return;
      }
      this.recStream = await this.cleanVoice();
      this.fellBack = false;
      this.makeRecorder(this.recStream);
      this.mime = (this.mr.mimeType || this.pickMime() || 'audio/webm').split(';')[0];
      this.chunks = []; this.seq = 0; this.bookmarks = []; this.elapsedBefore = 0; this.paused = false; this.interrupted = false;
      this.sessionId = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      this.startedAt = new Date().toISOString();
      this.active = true;
      const ch = currentChapter();
      await safe(DB.put('sessions', { id: this.sessionId, mime: this.mime, startedAt: this.startedAt, bookmarks: [], elapsed: 0, chapterId: ch ? ch.id : null }));

      this.wire();
      // If the cleaned-up sound fails to start (iPhone can do this on the very first press),
      // carry on at once with the microphone as it is — no leaving the screen, no second press.
      try { this.mr.start(5000); } catch (e) { this.fallback(); }
      this.segStart = Date.now();
      this.setupMeter();
      this.lockScreen();
      S.view = 'recorder';
      render();
    },

    makeRecorder(stream) {
      const want = this.pickMime();
      try {
        // Speech needs little data: mono AAC at 48 kbps (~21 MB an hour) or Opus at 32 kbps (~14 MB an hour)
        // sounds clear while keeping files small.
        const bits = /opus|webm|ogg/.test(want) ? 32000 : 48000;
        this.mr = want ? new MediaRecorder(stream, { mimeType: want, audioBitsPerSecond: bits }) : new MediaRecorder(stream, { audioBitsPerSecond: bits });
      } catch (e) {
        this.mr = new MediaRecorder(stream);
      }
    },

    fallback() {
      if (this.fellBack || this.recStream === this.stream) { this.interrupted = true; this.stop(); return; }
      this.fellBack = true;
      const old = this.mr;
      if (old) { old.ondataavailable = null; old.onstop = null; old.onerror = null; try { if (old.state !== 'inactive') old.stop(); } catch (e) { /* already stopped */ } }
      this.recStream = this.stream;
      this.makeRecorder(this.stream);
      this.mime = (this.mr.mimeType || this.mime).split(';')[0];
      this.chunks = []; this.seq = 0;
      safe(DB.dropSession(this.sessionId).then(() => DB.put('sessions', { id: this.sessionId, mime: this.mime, startedAt: this.startedAt, bookmarks: this.bookmarks, elapsed: 0, chapterId: null })));
      this.wire();
      try { this.mr.start(5000); } catch (e) { this.interrupted = true; this.active && this.finish(); }
    },

    wire() {
      const ch = currentChapter();
      this.mr.ondataavailable = (ev) => {
        if (!ev.data || !ev.data.size) return;
        this.chunks.push(ev.data);
        const seq = this.seq++;
        safe(DB.put('chunks', { session: this.sessionId, seq, blob: ev.data }));
        safe(DB.put('sessions', { id: this.sessionId, mime: this.mime, startedAt: this.startedAt, bookmarks: this.bookmarks, elapsed: Math.round(this.elapsed() / 1000), chapterId: ch ? ch.id : null }));
      };
      this.mr.onstop = () => this.finish();
      // An error before any sound was saved means the cleaned path failed: switch, don't quit.
      this.mr.onerror = () => { if (!this.chunks.length && !this.fellBack) this.fallback(); else { this.interrupted = true; this.stop(); } };
      this.stream.getAudioTracks().forEach((tr) => { tr.onended = () => { if (this.active) { this.interrupted = true; this.stop(); } }; });
    },

    bindView() {
      clearInterval(this.tick);
      this.tick = setInterval(() => {
        const el = app.querySelector('[data-timer]');
        if (el) el.textContent = fmtClock(this.elapsed() / 1000);
      }, 250);
      this.draw();
    },

    // Cleaner speech before it is saved: rumble below 85 Hz removed, hiss above 8 kHz softened,
    // levels evened out, and room noise lowered while you are silent. If anything here is not
    // supported, the microphone is recorded as it is.
    async cleanVoice() {
      this.chainOut = null;
      try {
        const c = this.ctx;
        if (!c || !c.createMediaStreamDestination) return this.stream;
        const src = c.createMediaStreamSource(this.stream);
        const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85; hp.Q.value = 0.7;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8000; lp.Q.value = 0.5;
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -26; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.25;
        const makeup = c.createGain(); makeup.gain.value = 1.6;
        src.connect(hp); hp.connect(lp); lp.connect(comp);
        let last = comp;
        if (c.audioWorklet) {
          try {
            await c.audioWorklet.addModule('voice-gate.js');
            const gate = new AudioWorkletNode(c, 'voice-gate', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
            comp.connect(gate); last = gate;
          } catch (e) { /* no gate on this browser */ }
        }
        last.connect(makeup);
        const dest = c.createMediaStreamDestination(); dest.channelCount = 1;
        makeup.connect(dest);
        if (c.state !== 'running') { try { await c.resume(); } catch (e) { /* stays suspended */ } }
        if (c.state !== 'running') return this.stream; // a silent engine would record nothing
        this.chainOut = makeup;
        return dest.stream;
      } catch (e) { return this.stream; }
    },

    setupMeter() {
      try {
        if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); }
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 512;
        if (this.chainOut) this.chainOut.connect(this.analyser); else this.ctx.createMediaStreamSource(this.stream).connect(this.analyser);
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
      // Show it plainly: the button lights up gold with a ring, then rests again for the next moment,
      // and a small number on it counts the moments marked so far.
      const btn = app.querySelector('[data-act="rec-mark"]');
      if (btn) {
        btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit');
        btn.innerHTML = I.markFill + '<b class="mark-count">' + esc(num(this.bookmarks.length)) + '</b><i class="mark-ring" aria-hidden="true"></i>';
        clearTimeout(this.markTimer);
        this.markTimer = setTimeout(() => { btn.classList.remove('hit'); }, 900);
      }
      if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    },

    togglePause() {
      if (!this.mr || !this.active) return;
      if (this.paused) {
        this.mr.resume(); this.paused = false; this.segStart = Date.now();
        if (Ambient.on) Ambient.start();   // music carries on with the recording
      } else {
        this.mr.pause(); this.elapsedBefore = this.elapsed(); this.paused = true;
        Ambient.stop(0.4);                 // and rests while it is paused
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
      Ambient.halt(); // the music stops the moment you press Stop, before the microphone closes
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
      this.ctx = null; this.chainOut = null;
      if (this.wake) safe(this.wake.release());
      this.wake = null;
      const blob = new Blob(this.chunks, { type: this.mime });
      const rec = {
        sessionId: this.sessionId, blob, mime: this.mime, startedAt: this.startedAt,
        durationSec: Math.round(this.elapsedBefore / 1000), bookmarks: this.bookmarks.slice(), interrupted: this.interrupted
      };
      this.chunks = [];
      Ambient.halt();
      S.view = 'home';
      render();
      if (!blob.size) { safe(DB.dropSession(rec.sessionId)); this.sessionId = null; toast(t('recInterrupted')); return; }
      if (this.kind === 'gratitude') { saveGratitude(rec); return; }
      openSaveSheet(rec);
    }
  };

  // In automatic mode the screen turns dark at 7 pm and light at 7 am, even while the app stays open.
  let shownDay = new Date().toDateString();
  setInterval(() => {
    if (Rec.active || document.visibilityState !== 'visible') return;
    applyLangTheme();
    // A new day: today's line hides again and waits for the book to be opened.
    if (new Date().toDateString() !== shownDay) { shownDay = new Date().toDateString(); if (S.view === 'home' && !sheet() && !document.querySelector('.intro')) render(); }
  }, 30000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (Rec.active && !Rec.wake) Rec.lockScreen();
      if (!Rec.active) applyLangTheme();
    }
  });
  window.addEventListener('beforeunload', (e) => { if (Rec.active) { e.preventDefault(); e.returnValue = ''; } });

  // ---------------------------------------------------------------- sheets
  // Sheets slide up from the bottom. Each open sheet is one step in the browser history,
  // so Back (button, or the edge swipe) closes it; pulling it down closes it too.
  let sheetCleanup = null;
  let sheetModal = false;
  function openSheet(html, onClose, opts) {
    const already = !!sheetRoot.firstChild;
    if (already && sheetCleanup) { const fn = sheetCleanup; sheetCleanup = null; fn(); }
    sheetModal = !!(opts && opts.modal);
    const open = sheet();
    if (already && open) {
      // A sheet that is already up only changes its contents: no closing, no sliding up again, no jump.
      const keep = open.scrollTop;
      open.innerHTML = '<div class="grab" aria-hidden="true"></div>' + html;
      open.scrollTop = keep;
      sheetCleanup = onClose || null;
      const f0 = sheetRoot.querySelector('[autofocus]'); if (f0) f0.focus();
      return;
    }
    sheetRoot.innerHTML = '<div class="overlay" data-overlay><div class="sheet" role="dialog" aria-modal="true">' +
      '<div class="grab" aria-hidden="true"></div>' + html + '</div></div>';
    sheetCleanup = onClose || null;
    if (!already) pushStep({ sheet: 1 });
    const f = sheetRoot.querySelector('[autofocus]');
    if (f) f.focus();
    bindSheetDrag();
  }
  function closeSheetDom() {
    if (sheetCleanup) { const fn = sheetCleanup; sheetCleanup = null; fn(); }
    sheetRoot.innerHTML = '';
    sheetModal = false;
  }
  function closeSheet() {
    if (!sheetRoot.firstChild) return;
    closeSheetDom();
    popStep();
  }

  // ---- history (Back button and edge swipe)
  let ignorePops = 0;
  function pushStep(state) { try { history.pushState(state, ''); } catch (e) { /* ignore */ } }
  function popStep() {
    if (history.state && (history.state.sheet || history.state.view)) { ignorePops++; history.back(); }
  }
  function go(view) {
    if (view === S.view) return;
    if (view === 'home') { if (history.state && history.state.view && history.state.view !== 'home') { history.back(); return; } S.view = 'home'; render(); return; }
    pushStep({ view });
    S.view = view;
    render();
    const sc = app.querySelector('.screen'); if (sc) sc.scrollTop = 0;
  }
  window.addEventListener('popstate', (e) => {
    if (ignorePops > 0) { ignorePops--; return; }
    if (sheetRoot.firstChild) {
      if (sheetModal) { pushStep({ sheet: 1 }); return; } // the save sheet must be answered
      closeSheetDom();
      return;
    }
    if (S.view === 'recorder') { pushStep({ view: 'recorder' }); return; }
    const v = (e.state && e.state.view) || 'home';
    S.view = (v === 'welcome' && S.settings.name) ? 'home' : v;
    render();
  });

  // ---- pull a sheet down to close it
  function bindSheetDrag() {
    const sh = sheet();
    if (!sh) return;
    let y0 = null; let dy = 0;
    sh.addEventListener('touchstart', (ev) => {
      if (sheetModal) return;
      const fromHandle = ev.target.closest('.grab, .sheet-head');
      if (sh.scrollTop > 0 && !fromHandle) return;
      y0 = ev.touches[0].clientY; dy = 0; sh.style.transition = 'none';
    }, { passive: true });
    sh.addEventListener('touchmove', (ev) => {
      if (y0 === null) return;
      dy = Math.max(0, ev.touches[0].clientY - y0);
      sh.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });
    sh.addEventListener('touchend', () => {
      if (y0 === null) return;
      y0 = null; sh.style.transition = '';
      if (dy > 110) closeSheet(); else sh.style.transform = '';
    });
  }

  // ---- edge swipe back for the home-screen app (Safari already has its own)
  (function edgeBack() {
    let x0 = null; let y0 = 0;
    document.addEventListener('touchstart', (ev) => {
      const tch = ev.touches[0];
      x0 = tch.clientX < 24 ? tch.clientX : null; y0 = tch.clientY;
    }, { passive: true });
    document.addEventListener('touchend', (ev) => {
      if (x0 === null) return;
      const tch = ev.changedTouches[0];
      if (tch.clientX - x0 > 90 && Math.abs(tch.clientY - y0) < 60 && window.navigator.standalone) history.back();
      x0 = null;
    }, { passive: true });
  })();

  // ---- horizontal swipe helper (calendar months, player pages)
  function onSwipe(el, fn, ltrAlways) {
    let x0 = null; let y0 = 0;
    el.addEventListener('touchstart', (ev) => { x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', (ev) => {
      if (x0 === null) return;
      const dx = ev.changedTouches[0].clientX - x0; const dy = ev.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        // "Forward" is to the left in English and to the right in Persian.
        const forward = lang() === 'fa' && !ltrAlways ? dx > 0 : dx < 0;
        fn(forward ? 1 : -1);
      }
    }, { passive: true });
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
    // The journal is simply ordered by date; pages are no longer filed by hand.
    const pick = sheetValue('pick-chapter');
    if (!pick) return null;
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
      '<div class="sheet-head"><b>' + esc(t('savedCheck')) + '</b><span class="muted small">' + esc(fmtLen(rec.durationSec) || fmtClock(rec.durationSec)) + SEP() + esc(fmtDate(rec.startedAt, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })) + '</span></div>' +
      (rec.interrupted ? '<div class="note">' + esc(t('recInterrupted')) + '</div>' : '') +
      '<div class="field"><label for="ttl">' + esc(t('whatAbout')) + '</label>' +
      '<input id="ttl" class="big-input" type="text" maxlength="200" dir="auto" placeholder="' + esc(t('titleExample')) + '" autofocus enterkeyhint="done"></div>' +
      '<details class="more"><summary class="raised-soft"><span><b>' + esc(t('moreOptions')) + '</b><small data-more-summary>' + esc(t('moodNone')) + '</small></span>' + I.down + '</summary>' +
      '<div class="more-body"><div class="field"><span class="label">' + esc(t('moodOptional')) + '</span>' + moodButtons(null) + '</div></div></details>' +
      '<button class="btn btn-primary btn-big" data-act="save-rec">' + esc(t('save')) + '</button>' +
      '<div class="sheet-foot"><button class="small-btn raised" data-act="save-rec" data-later="1">' + esc(t('saveUntitled')) + '</button>' +
      '<button class="text-danger" data-act="discard-rec">' + esc(t('discard')) + '</button></div>',
      null, { modal: true }
    );
  }

  // Gratitude needs no questions: it is named and dated by itself, and the home button gets its tick.
  async function saveGratitude(rec) {
    try {
      await addEntry({ title: t('gratitude'), kind: 'gratitude', mood: null, chapterId: null,
        startedAt: rec.startedAt, durationSec: rec.durationSec, bookmarks: rec.bookmarks }, rec.blob);
      await safe(DB.dropSession(rec.sessionId));
      Rec.sessionId = null;
      render();
      toast(t('gratitudeSaved'));
    } catch (e) { console.error(e); toast(t('saveFailed')); }
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
      // Swap the sheet's history step for the contents page, so Back then returns home.
      closeSheetDom();
      S.openChapter = entry.chapterId;
      S.view = 'contents';
      try { history.replaceState({ view: 'contents' }, ''); } catch (e) { /* ignore */ }
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

  function updateMoreSummary() {
    const el = sheet() && sheet().querySelector('[data-more-summary]');
    if (!el) return;
    const m = sheetValue('pick-mood');
    el.textContent = m ? t('moods.' + m) : t('moodNone');
  }

  // ----- player
  let playerEntry = null;
  let switchingPage = false;
  function openPlayer(entry, fromQueue) {
    if (!fromQueue) S.queue = [];
    if (Ambient.on) Ambient.prime();
    const autoplay = true;
    playerEntry = entry;
    S.playingId = entry.id;
    if (audio.dataset.id !== entry.id) {
      if (audio.dataset.url) URL.revokeObjectURL(audio.dataset.url);
      audio.dataset.id = entry.id;
      audio.dataset.url = '';
      audio.removeAttribute('src');
      DB.get('audio', entry.id).then(async (rec) => {
        if (audio.dataset.id !== entry.id) return;
        // A page whose sound was lost (it only borrowed a file that iPhone later cleared) says so plainly.
        if (!(await readable(rec))) { toast(t('soundMissing')); return; }
        const url = URL.createObjectURL(rec.blob);
        audio.dataset.url = url;
        audio.src = url;
        if (autoplay) safe(audio.play());
      });
    }
    const marks = (entry.bookmarks || []).map((s) => '<button class="chip" data-act="seek-to" data-sec="' + s + '">' + I.markFill + esc(fmtClock(s)) + '</button>').join('');
    const ch = S.chapters.find((c) => c.id === entry.chapterId);
    switchingPage = !!playerEntry;
    openSheet(
      '<div><span class="muted small">' + esc(fmtLong(entry.startedAt)) + '</span>' +
      '<h2 class="player-title" dir="auto">' + esc(entryTitle(entry)) + '</h2>' +
      '<span class="muted small">' + esc(fmtLong(entry.startedAt) + SEP() + fmtDate(entry.startedAt, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })) + '</span></div>' +
      '<div><input class="seek" type="range" min="0" max="1000" value="0" step="1" data-seek aria-label="seek">' +
      '<div class="times"><span data-cur>' + fmtClock(0) + '</span><span data-dur>' + fmtClock(entry.durationSec) + '</span></div></div>' +
      '<div class="play-row" dir="ltr">' +
      '<button class="iconbtn" data-act="skip" data-sec="-15" aria-label="-15s">' + I.rew + '</button>' +
      '<button class="playbtn" data-act="toggle-play" data-playbtn aria-label="play">' + (audio.paused ? I.play : I.pause) + '</button>' +
      '<button class="iconbtn" data-act="skip" data-sec="15" aria-label="+15s">' + I.fwd + '</button></div>' +
      musicChooser(t('musicNotInFile')) +
      '<div class="field"><span class="label">' + esc(t('speed')) + '</span><div class="chips">' +
      [1, 1.25, 1.5, 2].map((r) => '<button class="chip" data-act="rate" data-rate="' + r + '" aria-pressed="' + (audio.playbackRate === r) + '">' + esc(num(r)) + '×</button>').join('') + '</div></div>' +
      (marks ? '<div class="field"><span class="label">' + esc(t('bookmarks')) + '</span><div class="chips">' + marks + '</div></div>' : '') +
      '<div class="btn-row"><button class="btn btn-ghost" data-act="stop-audio">' + I.stop + esc(t('stopPlaying')) + '</button>' +
      '<button class="btn btn-ghost" data-act="edit-entry" data-id="' + esc(entry.id) + '">' + I.pen + esc(t('edit')) + '</button></div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-ghost" data-act="close-sheet">' + esc(t('close')) + '</button></div>',
      // Closing the player (button, pull down or Back) stops the sound: closed means closed.
      () => { playerEntry = null; if (!switchingPage) stopAudio(); }
    );
    switchingPage = false;
    syncPlayer();
    if (audio.src && (fromQueue || audio.paused)) safe(audio.play());
    const sh = sheet();
    if (sh && !sh.dataset.swipe) {
      sh.dataset.swipe = '1'; // bound once; the sheet now stays and only its contents change
      onSwipe(sh, (d) => {
        if (!playerEntry) return;
        const list = S.entries;
        const i = list.findIndex((x) => x.id === playerEntry.id);
        const next = list[i + d];
        if (next) openPlayer(next);
      });
    }
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
  // Calm music under a page while it plays (the file itself stays your voice only).
  audio.addEventListener('play', () => { if (Ambient.on && !Rec.active) Ambient.start(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !Rec.active && audio.paused) Ambient.stop(0.2); });
  audio.addEventListener('pause', () => { if (!Rec.active && !(audio.ended && S.queue.length)) Ambient.stop(); });
  ['play', 'pause', 'ended', 'emptied'].forEach((ev) => audio.addEventListener(ev, renderMini));

  // Small player above the dock: pause or stop from anywhere while listening.
  function renderMini() {
    const root = document.getElementById('mini-root');
    if (!root) return;
    const e = S.playingId && S.entries.find((x) => x.id === S.playingId);
    const show = e && audio.getAttribute('src') && (S.view === 'home' || S.view === 'contents');
    document.body.classList.toggle('has-mini', !!show);
    if (!show) { root.innerHTML = ''; return; }
    root.innerHTML = '<div class="mini" role="region" aria-label="' + esc(t('nowPlaying')) + '">' +
      '<button class="mini-btn" data-act="toggle-play" aria-label="' + esc(audio.paused ? t('play') : t('pause')) + '">' + (audio.paused ? I.play : I.pause) + '</button>' +
      '<button class="mini-title" data-act="play" data-id="' + esc(e.id) + '"><span dir="auto">' + esc(entryTitle(e)) + '</span><span class="tiny muted">' + esc(fmtDayTime(e.startedAt)) + '</span></button>' +
      '<button class="mini-btn ghost" data-act="stop-audio" aria-label="' + esc(t('stopPlaying')) + '">' + I.close + '</button></div>';
  }

  function stopAudio() {
    audio.pause();
    if (!Rec.active) Ambient.stop(0.3);
    audio.removeAttribute('src');
    audio.load();
    if (audio.dataset.url) { URL.revokeObjectURL(audio.dataset.url); audio.dataset.url = ''; }
    delete audio.dataset.id;
    S.queue = [];
    S.playingId = null;
    renderMini();
    syncPlayer();
    if (S.view === 'contents') render();
  }
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
  // ISO time -> value for <input type="datetime-local"> in local time
  function localInput(iso) {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function openEdit(entry) {
    openSheet(
      '<h2>' + esc(t('edit')) + '</h2>' +
      '<div class="field"><label for="ttl">' + esc(t('titleLabel')) + '</label>' +
      '<input id="ttl" type="text" maxlength="200" dir="auto" value="' + esc(entry.title || '') + '" placeholder="' + esc(t('titleExample')) + '" autofocus></div>' +
      '<div class="field"><label for="when">' + esc(t('dateTime')) + '</label>' +
      '<input id="when" type="datetime-local" class="when" value="' + esc(localInput(entry.startedAt)) + '">' +
      '<span class="muted tiny">' + esc(fmtLong(entry.startedAt)) + '</span></div>' +
      '<div class="field"><span class="label">' + esc(t('moodOptional')) + '</span>' + moodButtons(entry.mood) + '</div>' +
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
      const when = s.querySelector('#when').value;
      if (when && !Number.isNaN(new Date(when).getTime())) patch.startedAt = new Date(when).toISOString();
      await updateEntry(id, patch);
      sortEntries(S.entries);
      closeSheet();
      render();
    } catch (e) { toast(t('saveFailed')); }
  }

  function deleteEntry(id) { closeSheetDom(); confirmDelete([id]); }
  async function doDelete(ids) {
    try {
      for (const id of ids) {
        await removeEntry(id);
        if (audio.dataset.id === id) { audio.pause(); audio.removeAttribute('src'); delete audio.dataset.id; }
      }
      S.sel = null;
      closeSheet();
      render();
      toast(t('deletedN', { n: num(ids.length) }));
    } catch (e) { toast(t('saveFailed')); }
  }

  // ----- chapters
  function openChapterName(ch) {
    const auto = isAutoChapter(ch);
    const fa = ch ? (auto ? 'دفتر اول' : ch.title) : '';
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
      '<div class="sheet-head"><b>' + esc(t('settings')) + '</b><button class="iconbtn raised close-x" data-act="save-settings" aria-label="' + esc(t('close')) + '">' + I.x + '</button></div>' +
      '<section class="group"><h3>' + esc(t('groupMe')) + '</h3>' +
      '<div class="photo-row"><label class="cover-photo preview" for="coverfile">' + (S.coverUrl ? '<img src="' + S.coverUrl + '" alt="">' : '<span class="ph">' + I.camera + '</span>') + '</label>' +
      '<div class="photo-btns"><label class="small-btn raised" for="coverfile">' + I.camera + esc(S.coverUrl ? t('changePhoto') : t('choosePhoto')) + '</label>' +
      (S.coverUrl ? '<button class="small-btn raised" data-act="remove-photo">' + esc(t('removePhoto')) + '</button>' : '') + '</div></div>' +
      '<input id="coverfile" class="sr-only" type="file" accept="image/*" data-cover-photo>' +
      '<div class="field"><label for="setname">' + esc(t('nameFaLabel')) + '</label>' +
      '<input id="setname" type="text" maxlength="60" dir="auto" value="' + esc(S.settings.name || '') + '"></div>' +
      '<div class="field"><label for="setnameen">' + esc(t('nameEnLabel')) + '</label>' +
      '<input id="setnameen" type="text" maxlength="60" dir="ltr" autocomplete="off" placeholder="Alireza" value="' + esc(S.settings.nameEn || '') + '"></div></section>' +
      '<section class="group"><h3>' + esc(t('groupLang')) + '</h3><div class="seg">' +
      '<button data-act="set-lang" data-lang="fa" aria-pressed="' + (lang() === 'fa') + '">فارسی</button>' +
      '<button data-act="set-lang" data-lang="en" aria-pressed="' + (lang() === 'en') + '">English</button></div></section>' +
      '<section class="group"><h3>' + esc(t('theme')) + '</h3><div class="seg three">' +
      ['light', 'dark', 'auto'].map((k) => '<button data-act="set-theme" data-theme="' + k + '" aria-pressed="' + (th === k) + '">' +
        esc(t(k === 'auto' ? 'themeAutoShort' : k === 'dark' ? 'themeDark' : 'themeLight')) + '</button>').join('') + '</div>' +
      '<p class="hint">' + esc(t(th === 'auto' ? 'themeAutoHint' : th === 'dark' ? 'themeDarkHint' : 'themeLightHint')) + '</p></section>' +
      '<section class="group"><h3>' + esc(t('groupData')) + '</h3>' +
      '<span class="muted small">' + esc(t('backupHint')) + '</span>' +
      (window.navigator.standalone === false && S.entries.length ? '<span class="note small">' + esc(t('moveHint')) + '</span>' : '') +
      '<span class="muted tiny" data-storage></span>' +
      '<div class="btn-row"><button class="small-btn dark" data-act="backup">' + esc(t('backupNow')) + '</button>' +
      '<label class="small-btn raised" for="restorefile">' + esc(t('restore')) + '</label>' +
      '<button class="small-btn raised" data-act="open-import">' + esc(t('importTitle')) + '</button></div>' +
      '<input id="restorefile" class="sr-only" type="file" accept=".zip,application/zip" data-restore></section>'
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
      files.push({ name, blob: rec.blob, size: rec.blob.size, crc: await window.RZip.blobCrc(rec.blob), date: new Date(e.startedAt) });
      manifest.entries.push(Object.assign({}, e, { file: name }));
    }
    const photo = await safe(photoBlob(await DB.get('kv', 'coverPhoto')));
    if (photo) { files.push({ name: 'cover.jpg', blob: photo, size: photo.size, crc: await window.RZip.blobCrc(photo) }); manifest.coverPhoto = 'cover.jpg'; }
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
    if (S.view === 'home' || S.view === 'contents') render();
    showStorage();
  }

  // Restores from a backup .zip, reading one recording at a time (fine for large journals).
  async function restoreBackup(file) {
    try {
      toast(t('readingZip'));
      const list = await window.RZip.blobEntries(file);
      const byName = new Map(list.map((i) => [i.name, i]));
      const jm = byName.get('journal.json');
      if (!jm) throw new Error('not_aloud');
      const manifest = JSON.parse(await (await jm.blob('application/json')).text());
      if (!manifest || manifest.app !== 'aloud') throw new Error('not_aloud');
      if (manifest.coverPhoto && byName.get(manifest.coverPhoto) && !S.coverUrl) {
        await savePhoto(await byName.get(manifest.coverPhoto).blob('image/jpeg'));
        await loadCoverPhoto();
      }
      for (const ch of manifest.chapters || []) {
        if (!S.chapters.some((c) => c.id === ch.id)) { await DB.put('chapters', ch); S.chapters.push(ch); }
      }
      let added = 0;
      for (const e of manifest.entries || []) {
        const item = byName.get(e.file);
        if (!item) continue;
        const have = S.entries.find((x) => x.id === e.id);
        // A page already here keeps its title and date, but always takes the backup's sound,
        // so any page whose sound was lost is repaired.
        const entry = have || Object.assign({}, e);
        delete entry.file;
        const blob = await ownCopy(await item.blob(entry.mime || 'audio/mp4'), entry.mime || 'audio/mp4');
        await DB.tx(['entries', 'audio'], 'readwrite', ([es, as]) => { es.put(entry); as.put({ id: entry.id, blob }); });
        if (!have) S.entries.push(entry);
        added++;
      }
      sortEntries(S.entries);
      const ms = manifest.settings || {};
      if (!S.settings.name && ms.name) await putSettings({ name: ms.name, nameEn: ms.nameEn || '', lang: ms.lang || lang(), theme: ms.theme || S.settings.theme });
      await askPersistence();
      toast(t('restored', { n: num(added) }));
      closeSheetDom();
      S.view = S.settings.name ? 'home' : 'welcome';
      try { history.replaceState({ view: S.view }, ''); } catch (e) { /* ignore */ }
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
      (canPickFolder() ? '' : '<ol class="steps small">' + t('importZipSteps').map((x) => '<li>' + esc(x) + '</li>').join('') + '</ol>') +
      '<div class="btn-row">' +
      (canPickFolder() ? '<label class="btn btn-primary" for="impdir">' + esc(t('chooseFolder')) + '</label>' : '') +
      '<label class="btn ' + (canPickFolder() ? 'btn-ghost' : 'btn-primary') + '" for="impfiles">' + esc(t('chooseFilesOrZip')) + '</label></div>' +
      (canPickFolder() ? '<input id="impdir" class="sr-only" type="file" webkitdirectory multiple data-import>' : '') +
      '<input id="impfiles" class="sr-only" type="file" accept="audio/*,.m4a,.mp3,.wav,.aac,.zip,application/zip" multiple data-import>' +
      '<div data-import-status class="muted small"></div><div class="progress" hidden data-import-bar><span></span></div>' +
      '<button class="btn btn-ghost" data-act="close-sheet">' + esc(t('close')) + '</button>'
    );
  }

  // iPhone and iPad browsers cannot pick a whole folder; they get files or a zipped folder instead.
  function canPickFolder() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const input = document.createElement('input');
    return !ios && 'webkitdirectory' in input;
  }

  function guessDate(file) {
    const relPath = file.relPath || file.webkitRelativePath || file.name;
    const dm = /(\d{4})-(\d{2})-(\d{2})/.exec(relPath);
    const base = String(file.name).split('/').pop();
    const tm = /(?:^|[^\d])(\d{1,2})[-_.:](\d{2})[-_.:](\d{2})(?:[^\d]|$)/.exec(base);
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

  const isAudioName = (n) => { const b = String(n).split('/').pop(); const ext = (b.split('.').pop() || '').toLowerCase(); return !b.startsWith('.') && !String(n).includes('__MACOSX') && !!EXT_MIME[ext]; };

  async function runImport(fileList) {
    const status = sheet().querySelector('[data-import-status]');
    const bar = sheet().querySelector('[data-import-bar]');
    // Each item: { name, relPath, size, lastModified, getBlob(type) }
    const items = [];
    for (const f of Array.from(fileList)) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (ext === 'zip' || f.type === 'application/zip') {
        status.textContent = t('readingZip');
        try {
          const entries = await window.RZip.blobEntries(f);
          entries.filter((e) => isAudioName(e.name)).forEach((e) => items.push({
            name: e.name.split('/').pop(), relPath: e.name, size: e.size, lastModified: e.date.getTime(), getBlob: (type) => e.blob(type)
          }));
        } catch (e) { console.warn(e); toast(t('zipFailed')); }
      } else if (isAudioName(f.name) || (f.type && f.type.startsWith('audio/'))) {
        items.push({ name: f.name, relPath: f.webkitRelativePath || f.name, size: f.size, lastModified: f.lastModified, getBlob: async (type) => (f.type === type ? f : new Blob([f], { type })) });
      }
    }
    if (!items.length) { status.textContent = t('importNone'); return; }
    let chapterId;
    try { chapterId = await resolveChapter(); } catch (e) { toast(t('saveFailed')); return; }
    const list = items.map((it) => ({ it, date: guessDate(it) })).sort((a, b) => a.date - b.date);
    bar.hidden = false;
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      const { it, date } = list[i];
      status.textContent = t('importing', { i: num(i + 1), n: num(list.length) });
      bar.firstChild.style.width = Math.round((i / list.length) * 100) + '%';
      const ext = (it.name.split('.').pop() || '').toLowerCase();
      const mime = EXT_MIME[ext] || 'audio/mp4';
      try {
        const importKey = hashId(it.relPath + '|' + it.size + '|' + it.lastModified);
        if (S.entries.some((e) => e.importKey === importKey)) continue;
        const blob = await it.getBlob(mime);
        const durationSec = await audioDuration(blob);
        await addEntry({ startedAt: date.toISOString(), durationSec, chapterId, title: '', source: 'import', importKey }, blob);
        ok++;
      } catch (e) { console.warn('import failed', it.name, e); }
    }
    bar.firstChild.style.width = '100%';
    status.textContent = t('imported', { n: num(ok) });
    render();
  }

  // ---------------------------------------------------------------- events
  const actions = {
    'contents': () => go('contents'),
    'open-book': (el) => {
      if (el && el.classList && el.classList.contains('hope-switch') && !el.classList.contains('on')) { el.classList.add('on'); setTimeout(() => playIntro(true), 380); return; }
      playIntro(true);
    },
    'home': () => go('home'),
    'back': () => { if (history.state && history.state.view && history.state.view !== 'home') history.back(); else go('home'); },
    'open-chapter': (el) => { S.openChapter = el.dataset.id; render(); const sc = app.querySelector('.screen'); if (sc) sc.scrollTop = 0; },
    'settings': openSettings,
    'calendar': () => openCalendar(false),
    'cal-prev': () => moveMonth(-1),
    'cal-next': () => moveMonth(1),
    'cal-mode': (el) => { S.calMode = el.dataset.mode; openCalendar(true); },
    'cal-day': (el) => { S.calSelected = el.dataset.key; openCalendar(true); },
    'record': () => { if (!audio.paused) stopAudio(); if (Ambient.on) Ambient.prime(); Rec.start('page').then(() => { if (Ambient.on && Rec.active) Ambient.start(); }); },
    'record-gratitude': () => { if (!audio.paused) stopAudio(); if (Ambient.on) Ambient.prime(); Rec.start('gratitude').then(() => { if (Ambient.on && Rec.active) Ambient.start(); }); },
    'music': (el) => {
      Ambient.choose(Number(el.dataset.n));
      el.parentNode.querySelectorAll('[data-act="music"]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.n) === Ambient.track)));
    },
    'filter': (el) => { S.filter = el.dataset.f === 'gratitude' ? 'gratitude' : ''; render(); },
    'play-month': (el) => {
      const ids = el.dataset.ids.split(',').filter(Boolean);
      const list = ids.map((id) => S.entries.find((x) => x.id === id)).filter(Boolean);
      if (!list.length) return;
      S.queue = list.slice(1).map((e) => e.id); const q = S.queue.slice();
      openPlayer(list[0], true); S.queue = q;
    },
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
      const hint = el.closest('.group') && el.closest('.group').querySelector('.hint');
      if (hint) hint.textContent = t(el.dataset.theme === 'auto' ? 'themeAutoHint' : el.dataset.theme === 'dark' ? 'themeDarkHint' : 'themeLightHint');
      await safe(putSettings({ theme: el.dataset.theme }));
    },
    'finish-welcome': async (el) => {
      const name = (app.querySelector('#owner').value || '').trim();
      if (!name) { app.querySelector('#owner').focus(); return; }
      el.disabled = true;
      try {
        await putSettings({ name, lang: lang() });
        if (!S.chapters.length) await createChapter(t('defaultChapter'), true);
        S.view = 'home';
        try { history.replaceState({ view: 'home' }, ''); } catch (e) { /* ignore */ }
        render(); playIntro();
        askPersistence();
      } catch (e) { console.error(e); el.disabled = false; toast(t('saveFailed')); }
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
    'toggle-month': (el) => {
      if (!S.openMonths) S.openMonths = {};
      const g = el.closest('.mgroup');
      const on = !g.classList.contains('open');
      g.classList.toggle('open', on); el.setAttribute('aria-expanded', on);
      S.openMonths[el.dataset.id] = on;
    },
    'toggle-play': () => { if (audio.paused) safe(audio.play()); else audio.pause(); },
    'stop-audio': () => stopAudio(),
    'remove-photo': async () => {
      await safe(DB.del('kv', 'coverPhoto'));
      await safe(loadCoverPhoto());
      openSettings(); render();
    },
    'delete-chapter': async (el) => {
      if (entriesOf(el.dataset.id).length) return;
      await safe(DB.del('chapters', el.dataset.id));
      S.chapters = S.chapters.filter((c) => c.id !== el.dataset.id);
      render();
    },
    'skip': (el) => { audio.currentTime = Math.max(0, audio.currentTime + Number(el.dataset.sec)); },
    'seek-to': (el) => { audio.currentTime = Number(el.dataset.sec); safe(audio.play()); },
    'rate': (el) => {
      audio.playbackRate = Number(el.dataset.rate);
      sheet().querySelectorAll('[data-act="rate"]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === audio.playbackRate)));
    },
    'edit-entry': (el) => { const e = S.entries.find((x) => x.id === el.dataset.id); if (e) openEdit(e); },
    'save-edit': (el) => saveEdit(el.dataset.id),
    'delete-entry': (el) => deleteEntry(el.dataset.id),
    'do-delete': (el) => doDelete(el.dataset.ids.split(',').filter(Boolean)),
    'pa-rename': (el) => { closeSheetDom(); const e = S.entries.find((x) => x.id === el.dataset.id); if (e) { openEdit(e); setTimeout(() => { const i = sheet() && sheet().querySelector('#ttl'); if (i) { i.focus(); i.select(); } }, 350); } },
    'pa-select': (el) => { closeSheet(); const e = S.entries.find((x) => x.id === el.dataset.id); S.selMonth = monthKey(e); S.sel = new Set([e.id]); render(); },
    'pa-select-all': (el) => { closeSheet(); const e = S.entries.find((x) => x.id === el.dataset.id); S.selMonth = monthKey(e); S.sel = new Set(scopeIds()); render(); },
    'pa-delete': (el) => { closeSheetDom(); confirmDelete([el.dataset.id]); },
    'sel-toggle': (el) => {
      const id = el.dataset.id;
      if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
      const keep = app.querySelector('.screen') ? app.querySelector('.screen').scrollTop : 0;
      render(); const sc = app.querySelector('.screen'); if (sc) sc.scrollTop = keep;
    },
    'sel-all': () => {
      const ids = scopeIds();
      S.sel = S.sel.size === ids.length ? new Set() : new Set(ids);
      const keep = app.querySelector('.screen') ? app.querySelector('.screen').scrollTop : 0;
      render(); const sc = app.querySelector('.screen'); if (sc) sc.scrollTop = keep;
    },
    'sel-delete': () => { if (S.sel && S.sel.size) confirmDelete([...S.sel]); },
    'sel-cancel': () => { S.sel = null; render(); },
    'pick-mood': (el) => { sheetPick('pick-mood', el.getAttribute('aria-pressed') === 'true' ? null : el.dataset.mood); updateMoreSummary(); },
    'pick-chapter': (el) => {
      sheetPick('pick-chapter', el.dataset.id);
      const box = sheet().querySelector('[data-newch]');
      if (box) { box.hidden = el.dataset.id !== '__new'; if (!box.hidden) box.querySelector('input').focus(); }
      updateMoreSummary();
    },
    'save-rec': (el) => saveRecording(el.dataset.later === '1'),
    'discard-rec': discardRecording,
    'close-sheet': closeSheet,
    'open-import': openImport,
    'backup': () => { makeBackup().catch((e) => { console.error(e); toast(t('backupFailed')); }); }
  };

  // Hold a page for half a second to see what you can do with it.
  let holdTimer = 0; let holdStart = null; let holdFired = false;
  document.addEventListener('pointerdown', (ev) => {
    const row = ev.target.closest && ev.target.closest('.prow[data-row]');
    holdFired = false;
    if (!row || S.sel || S.view !== 'contents') return;
    holdStart = { x: ev.clientX, y: ev.clientY };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      const e = S.entries.find((x) => x.id === row.dataset.row);
      if (!e) return;
      holdFired = true;
      try { navigator.vibrate && navigator.vibrate(12); } catch (err) { /* ignore */ }
      row.classList.add('held'); setTimeout(() => row.classList.remove('held'), 300);
      openPageActions(e);
    }, 480);
  });
  document.addEventListener('pointermove', (ev) => {
    if (holdStart && Math.hypot(ev.clientX - holdStart.x, ev.clientY - holdStart.y) > 10) { clearTimeout(holdTimer); holdStart = null; }
  });
  ['pointerup', 'pointercancel'].forEach((n) => document.addEventListener(n, () => { clearTimeout(holdTimer); holdStart = null; }));
  document.addEventListener('contextmenu', (ev) => { if (ev.target.closest && ev.target.closest('.prow')) ev.preventDefault(); });

  document.addEventListener('click', (ev) => {
    if (holdFired) { holdFired = false; ev.preventDefault(); ev.stopPropagation(); return; }
    if (ev.target.closest('[data-no-act]')) return; // e.g. the photo circle on the cover opens the photo picker
    const el = ev.target.closest('[data-act]');
    if (el && actions[el.dataset.act]) { ev.preventDefault(); actions[el.dataset.act](el); return; }
    // Tapping the dimmed area closes a sheet, except the save sheet, which must be answered.
    if (ev.target.matches('[data-overlay]') && !saving) closeSheet();
  });

  document.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('div.cover[data-act]')) { ev.preventDefault(); playIntro(true); return; }
    if (ev.key === 'Escape' && sheetRoot.firstChild && !saving) closeSheet();
  });

  document.addEventListener('input', (ev) => {
    if (ev.target.matches && ev.target.matches('[data-music-vol]')) { Ambient.setVol(Number(ev.target.value)); return; }
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
    if (ev.target.matches('[data-cover-photo]') && ev.target.files && ev.target.files[0]) setCoverPhoto(ev.target.files[0]);
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

  // ---------------------------------------------------------------- the travelling rosette
  // One rosette rolls slowly along the gold frame line, turning as it goes.
  (function rosette() {
    const el = document.getElementById('jewel');
    if (!el) return;
    const SPEED = 38;   // px per second along the frame (about a minute per lap)
    let last = 0;
    function geometry() {
      const css = getComputedStyle(document.documentElement);
      const inset = (parseFloat(css.getPropertyValue('--inset')) || 14) + 0.75;
      const W = window.innerWidth; const H = window.innerHeight;
      const r = 33.25;
      const w = W - 2 * inset; const h = H - 2 * inset;
      const sx = w - 2 * r; const sy = h - 2 * r; const arc = Math.PI * r / 2;
      return { inset, r, sx, sy, arc, L: 2 * sx + 2 * sy + 4 * arc };
    }
    // Point on the rounded rectangle, clockwise from the top-left end of the top edge.
    function pointAt(g, s) {
      const { inset: b, r, sx, sy, arc } = g;
      const segs = [
        (u) => [b + r + u, b],                                                                   // top
        (u) => { const a = -Math.PI / 2 + u / r; return [b + r + sx + r * Math.cos(a), b + r + r * Math.sin(a)]; },
        (u) => [b + 2 * r + sx, b + r + u],                                                      // right
        (u) => { const a = u / r; return [b + r + sx + r * Math.cos(a), b + r + sy + r * Math.sin(a)]; },
        (u) => [b + r + sx - u, b + 2 * r + sy],                                                 // bottom
        (u) => { const a = Math.PI / 2 + u / r; return [b + r + r * Math.cos(a), b + r + sy + r * Math.sin(a)]; },
        (u) => [b, b + r + sy - u],                                                              // left
        (u) => { const a = Math.PI + u / r; return [b + r + r * Math.cos(a), b + r + r * Math.sin(a)]; }
      ];
      const lens = [sx, arc, sy, arc, sx, arc, sy, arc];
      for (let i = 0; i < 8; i++) { if (s <= lens[i]) return segs[i](s); s -= lens[i]; }
      return segs[0](0);
    }
    // The logo moves only while a recording is running, and stays wherever it stopped — even after the app closes.
    let g = geometry();
    let frac = (g.sx + g.arc + g.sy / 2) / g.L; // starts at home
    let running = false; let lastSave = 0;
    const moving = () => !!(Rec.active && !Rec.paused) && !document.hidden;
    function place() { const [x, y] = pointAt(g, frac * g.L); el.style.transform = 'translate(' + (x - 15).toFixed(1) + 'px,' + (y - 15).toFixed(1) + 'px)'; }
    function save() { try { localStorage.setItem('aloud-jewel', frac.toFixed(5)); } catch (e) { /* ignore */ } }
    // Its home is the middle of the right-hand side. When a recording stops, it travels on along the frame
    // until it reaches home, and rests there.
    const homeFrac = () => (g.sx + g.arc + g.sy / 2) / g.L;
    let gliding = 0;
    function settle() {
      if (moving() || gliding) return;
      const target = homeFrac();
      const d = (target - frac + 1) % 1;
      if (d * g.L < 2 || d * g.L > g.L - 2) { frac = target; place(); return; }
      const from = frac; const dur = Math.min(4000, Math.max(700, d * g.L / 260 * 1000)); const t0 = performance.now();
      const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      const tick = (now) => {
        if (moving()) { gliding = 0; return; }
        const u = Math.min(1, (now - t0) / dur);
        frac = (from + d * ease(u)) % 1; place();
        if (u < 1) gliding = requestAnimationFrame(tick); else { gliding = 0; frac = target; save(); }
      };
      gliding = requestAnimationFrame(tick);
    }
    let settleTimer = 0;
    window.__settleJewel = () => { clearTimeout(settleTimer); settleTimer = setTimeout(settle, 450); };
    function frame(ts) {
      if (!moving()) { running = false; last = 0; save(); window.__settleJewel(); return; }
      if (last) frac = (frac + SPEED * Math.min(0.1, (ts - last) / 1000) / g.L) % 1;
      last = ts;
      place();
      if (ts - lastSave > 1000) { lastSave = ts; save(); }
      requestAnimationFrame(frame);
    }
    function check() { if (!running && moving()) { if (gliding) { cancelAnimationFrame(gliding); gliding = 0; } running = true; last = 0; requestAnimationFrame(frame); } }
    window.addEventListener('resize', () => { g = geometry(); place(); window.__settleJewel(); });
    document.addEventListener('visibilitychange', check);
    setInterval(check, 400);
    place();
  })();

  // ---------------------------------------------------------------- start
  async function boot() {
    try { await loadState(); } catch (e) {
      console.error(e);
      app.innerHTML = '<section class="screen center"><div class="grow"></div><p>' + esc(t('noStorage')) + '</p><div class="grow"></div></section>';
      return;
    }
    S.view = S.settings.name ? 'home' : 'welcome';
    try { history.replaceState({ view: S.view }, ''); } catch (e) { /* ignore */ }
    render();
    if (S.view === 'home') playIntro();
    await safe(recoverSessions());
    if (S.settings.name) askPersistence();
    if (S.view === 'home' || S.view === 'contents') render();
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        // A Home Screen app is often resumed rather than reopened, so look for a new version on every return.
        document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      }).catch(() => {});
    });
    // When a new version takes over, reload once — but only on the quiet home screen, never mid-recording.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      const quiet = () => S.view === 'home' && !document.querySelector('.sheet, .intro') && !playerEntry;
      const tryReload = () => { if (!reloaded && quiet()) { reloaded = true; location.reload(); } };
      tryReload();
      if (!reloaded) document.addEventListener('visibilitychange', () => { if (document.hidden) tryReload(); });
    });
  }

  // Tiny hooks for automated tests; harmless in normal use.
  window.__aloud = { S, t, fmtClock, guessDate, hashId, DB, Rec, Ambient };

  boot();
})();
