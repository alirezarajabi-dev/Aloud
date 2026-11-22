# Aloud · روزنگار

**A private voice journal.** Press record, talk about your day, give the page a title when you're done. Pages are grouped into the chapters of your life, and you can listen back to any day, or a whole chapter in a row.

**Your recordings never leave your phone.** There is no server and no account: everything is stored in your browser on your own device. This repository contains only the app's code.

روزنگاری صوتی و خصوصی: ضبط می‌کنی، آخرش یک عنوان می‌گذاری، و صفحه در فصلی از زندگی‌ات قرار می‌گیرد. صداها هیچ‌وقت از گوشی‌ات بیرون نمی‌روند. اینجا فقط کد اپ است.

## Features

- Persian and English interface (right-to-left for Persian)
- Cover with your name, a spine coloured by the mood of your pages
- Recording with timer, waveform, pause and "important moment" marks; the screen stays awake
- **Crash-safe:** every 5 seconds of a recording is saved, so a closed tab or a dead battery loses at most a few seconds
- Title, mood and chapter at the end of each recording (all optional)
- Contents by chapter; play one page or a whole chapter; speed 1×–2×; jump to marked moments
- "On this day": a page from a month or a year ago
- Import old recordings: choose a folder (for example from Just Press Record, with folders named like `2026-07-16`) and each file is dated automatically
- **Backup and restore:** one `.zip` with every recording, named by date and title, plus `journal.json`. On the iPhone it can be saved straight to Files or iCloud Drive. A reminder appears if you haven't backed up for a week.
- Light (paper) and dark themes; installable on the home screen; works offline

## Use it

Open the site in **Safari** on the iPhone → Share → **Add to Home Screen**. Use it from the home-screen icon from then on.

- Keep the screen open while recording: iPhones usually stop a web page's microphone when the screen locks or you switch apps. Anything recorded up to that moment is kept.
- Your journal is tied to **one web address on one device**. Back it up regularly; a backup can be restored on another phone or browser.
- Don't use Private browsing: Safari clears its storage when the private tab closes.

## Host it

It's a static site: plain HTML, CSS and JavaScript, no build step. Any static host works, in the site root or in a subfolder (all paths are relative).

- **GitHub Pages:** Settings → Pages → Deploy from a branch → `main` / root.
- **Any web host:** upload the files into a folder, e.g. `public_html/aloud/`.

Microphone access needs **HTTPS** (or `localhost` for testing):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Tests

```bash
npm test
```

## Files

```
index.html             app shell (with a strict Content Security Policy)
app.js                 screens, recorder, player, storage, import, backup
app.css                design, dark and light
i18n.js                Persian and English text
zip.js                 backup file writer and reader
sw.js                  offline cache for the app's own files
fonts/Afsaneh.ttf      cover font
icons/                 app icons
tests/                 tests for the backup format
```

## Fonts

Body text uses [Parastoo](https://fonts.google.com/specimen/Parastoo) and [Vazirmatn](https://fonts.google.com/specimen/Vazirmatn) (Open Font License) from Google Fonts. The cover title uses **Afsaneh** by Hossein Taghizadeh, which is marked "All rights reserved"; replace it, or get the designer's permission, before using this app commercially.

## License

Copyright © 2026 Alireza Rajabi. All rights reserved. See [LICENSE](LICENSE). The code may not be copied, reused, or redistributed.
