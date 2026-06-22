# Pitch Perfect Kits

A soccer jersey catalog built from a Yupoo supplier album, with all images
downloaded and hosted **locally** — no Yupoo URLs are ever used on the live
website, and no direct hotlinking occurs at runtime.

The project has two parts:

1. **Importer** (`importer/`) — a Node.js CLI tool that scrapes Yupoo album
   pages, downloads every photo to `public/images/<albumId>/`, translates
   the Chinese title to English, and writes a structured record to
   `data/jerseys.json` (mirrored to `public/jerseys.json`).
2. **Website** (`public/`) — a static site (vanilla HTML/CSS/JS) that reads
   `jerseys.json`, renders a responsive filterable grid, and opens a
   lazy-loaded gallery modal per jersey, all from local images.

This repo ships with 6 **sample** jerseys (clearly labeled "SAMPLE" on the
placeholder images) so you can run the site immediately and see how
everything fits together before importing your real catalog.

---

## 1. Requirements

- **Node.js 18 or newer** (uses the built-in global `fetch` — no extra
  HTTP dependency needed). Check your version with:
  ```bash
  node -v
  ```
- No other dependencies. `package.json` has an empty `dependencies` block
  by design.

---

## 2. Installation

```bash
# 1. Unzip / clone the project, then enter it
cd pitch-perfect-kits

# 2. (Optional) install — there's nothing to install, but this keeps
#    package-lock in sync if you add dependencies later
npm install

# 3. Preview the site locally with the sample data
npm run serve
```

Open **http://localhost:3000** — you should see the 6 sample jerseys with
the black & gold "Pitch Perfect Kits" design, working search, filters, and
a gallery modal when you click a card.

---

## 3. Importing your real catalog from Yupoo

The importer is a CLI script: `importer/run.js`. It accepts Yupoo **album**
URLs (the page that lists all photos for one jersey), e.g.:

```
https://168dyfs.x.yupoo.com/albums/241571681?uid=1
```

> **Note on Yupoo URL types:** Yupoo has two kinds of pages — a *single
> photo* page (e.g. `.../85209863?uid=1`) and the *album* page that photo
> belongs to (e.g. `.../albums/241571681?uid=1`). Always import the
> **album** URL, since that's what represents one full jersey listing with
> all of its photos. If you only have a single-photo link, open it in your
> browser and click through to "所属相册" (its album) to get the right URL.

### 3a. Import one album

```bash
node importer/run.js --album https://168dyfs.x.yupoo.com/albums/241571681?uid=1
```

### 3b. Import several albums at once

```bash
node importer/run.js \
  --album https://168dyfs.x.yupoo.com/albums/241571681?uid=1 \
  --album https://168dyfs.x.yupoo.com/albums/240388284?uid=1 \
  --album https://168dyfs.x.yupoo.com/albums/240249755?uid=1
```

### 3c. Import a batch list from a text file

Copy `urls.example.txt` to `urls.txt`, paste one album URL per line, then:

```bash
node importer/run.js --file urls.txt
```

### 3d. Auto-discover every album in a category

Yupoo groups albums into categories (visible in the left sidebar of the
catalog, e.g. "26-27俱乐部球迷"). You can point the importer at a category
URL and it will crawl every page of that listing and import every album it
finds:

```bash
node importer/run.js --catalog https://168dyfs.x.yupoo.com/categories/5103216
```

You can combine all of the above flags in a single run; duplicates are
automatically skipped.

### What happens during import

For each album URL, the importer:

1. Downloads the album page HTML.
2. Extracts the album title and every unique photo it contains.
3. Downloads each photo (medium resolution — sharp enough for web display,
   much lighter than the Yupoo originals) into
   `public/images/<albumId>/01.jpg`, `02.jpg`, etc.
4. Runs the Chinese→English translator (`importer/translate.js`) on the
   title, and derives:
   - `team` (e.g. "Barcelona")
   - `season` (e.g. "26-27")
   - `sizeRange` (e.g. "S-4XL")
   - `category` (`club` or `national`)
   - `region` (`europe`, `southamerica`, `africa`, `asia`, `northamerica`,
     `oceania`)
   - `type` (`home`, `away`, `third`, `player`, `training`, `special`,
     `gk`) — used to drive the website's filter pills
5. Writes/updates the record in `data/jerseys.json` (and mirrors it to
   `public/jerseys.json`, which is what the live site actually fetches).

The importer is **safe to re-run**: already-downloaded images are skipped,
and existing `jerseys.json` records are updated in place (matched by
Yupoo album ID) rather than duplicated. Progress is saved after every
album, so an interrupted run doesn't lose previously imported jerseys.

### Adding a new jersey later

Importing is fully reusable — to add more jerseys to an existing catalog,
just run the importer again with new album URLs. It merges into your
existing `jerseys.json` without touching anything already imported.

```bash
node importer/run.js --album https://168dyfs.x.yupoo.com/albums/<new-id>?uid=1
```

### Handling unrecognized team names

`importer/translate.js` contains a hand-maintained dictionary of Chinese
team/country names. The catalog will inevitably include teams not yet in
the dictionary. When that happens:

- The importer still creates a record and downloads the images.
- The record is flagged `"needsReview": true` in `jerseys.json`.
- The CLI output lists every flagged item at the end of the run, e.g.:
  ```
  3 record(s) flagged needsReview:true — these had a team name the
  importer didn't recognize. Open importer/translate.js and add an
  entry to TEAM_DICTIONARY, then re-run the import for those albums.
  ```

To fix: open `importer/translate.js`, add a line to `TEAM_DICTIONARY`
(format: `['中文名', 'English Name']`), then re-run the importer with that
album's URL — it will update the existing record with the corrected title.

---

## 4. Project structure

```
pitch-perfect-kits/
├── importer/
│   ├── scrape.js          # Fetches Yupoo HTML, extracts photos, downloads images
│   ├── translate.js       # Chinese → English title translation + tagging
│   ├── catalog-urls.js    # Crawls category/listing pages to discover album URLs
│   └── run.js             # CLI entry point — orchestrates the full import
├── data/
│   └── jerseys.json       # Canonical data file (source of truth)
├── public/                # Everything here is the deployed static site
│   ├── images/
│   │   └── <albumId>/
│   │       ├── 01.jpg
│   │       ├── 02.jpg
│   │       └── ...
│   ├── jerseys.json        # Mirror of data/jerseys.json, fetched by app.js
│   ├── index.html
│   ├── style.css
│   └── app.js
├── server.js               # Zero-dependency local dev server
├── package.json
├── vercel.json              # Vercel static deployment config
├── urls.example.txt         # Example batch-import URL list
└── README.md
```

---

## 5. The data format (`jerseys.json`)

Each jersey is a flat object:

```json
{
  "id": "241571681",
  "title": "26-27 Porto Home (S-4XL)",
  "titleRaw": "26-27波尔图主S-4XL",
  "team": "Porto",
  "season": "26-27",
  "sizeRange": "S-4XL",
  "category": "club",
  "region": "europe",
  "type": "home",
  "kitTypeLabels": ["Home"],
  "colors": [],
  "images": [
    "images/241571681/01.jpg",
    "images/241571681/02.jpg",
    "images/241571681/03.jpg"
  ],
  "sourceImported": true,
  "needsReview": false,
  "scrapedAt": "2026-06-20T21:08:00.000Z"
}
```

`images` paths are relative to `/public`, so the frontend loads them
directly as `<img src="images/241571681/01.jpg">` — entirely from your own
domain once deployed.

You can hand-edit `jerseys.json` at any time (e.g. to fix a title or
reorder images); the importer will respect your edits unless you re-import
that same album ID, which overwrites the record.

---

## 6. Website features

- **Responsive grid** — auto-fills columns down to 2-across on mobile.
- **Search** — matches title, team, and season (debounced as you type).
- **Filters** — Category (Club / National), Kit Type (Home / Away / Third
  / Player Version / Training / Special / Goalkeeper), and Region.
- **Sort** — Default, A→Z, Z→A, Season (Newest).
- **Gallery modal** — click any card to see every photo for that jersey
  in a larger view, with a thumbnail strip, arrow-key navigation, and
  touch-swipe support on mobile.
- **Lazy loading** — grid images load via `IntersectionObserver` only as
  they scroll into view, with a shimmer placeholder while loading.
- **Keyboard accessible** — cards are focusable and openable via Enter/Space,
  modal closes on Escape, visible focus rings throughout.
- **No external image hosts** — every `<img>` tag points at a local
  `images/...` path. There is no code path anywhere in `app.js` or
  `style.css` that references `yupoo.com`.

---

## 7. Local development

```bash
npm run serve
# or directly:
node server.js
```

This starts a minimal static file server at `http://localhost:3000`
serving the `public/` folder — no build step, no bundler. Edit any file in
`public/` and refresh your browser to see changes.

If you prefer another local server (e.g. VS Code's "Live Server"
extension, or `npx serve public`), that works too — the site is 100%
static.

---

## 8. Deploying to Vercel

This project deploys as a **static site** — no serverless functions, no
build step required.

### Option A — Vercel CLI

```bash
npm install -g vercel   # one-time global install
cd pitch-perfect-kits
vercel
```

Follow the prompts (link or create a project). Vercel will read
`vercel.json`, which sets:

```json
{
  "outputDirectory": "public"
}
```

so it deploys the contents of `public/` (including `jerseys.json` and all
`images/`) as-is. When ready for production:

```bash
vercel --prod
```

### Option B — Vercel Dashboard (Git-based)

1. Push this project to a GitHub/GitLab/Bitbucket repository.
   > **Tip:** `public/images/` can get large once you've imported the
   > full catalog. Git handles this fine for a few hundred MB, but if your
   > catalog grows very large, consider Git LFS for the `images/` folder.
2. Go to [vercel.com/new](https://vercel.com/new) and import the
   repository.
3. Framework Preset: choose **"Other"** (no framework needed).
4. Build Command: leave **empty**.
5. Output Directory: set to **`public`**.
6. Click **Deploy**.

Every subsequent push to your main branch redeploys automatically.

### Re-deploying after importing more jerseys

Since images live in `public/images/` and data lives in
`public/jerseys.json`, simply:

```bash
node importer/run.js --album <new-url>
git add public/
git commit -m "Add new jersey imports"
git push          # if using Git-based deploys
# or
vercel --prod      # if using CLI deploys
```

---

## 9. Notes on Yupoo & hotlink protection

Yupoo's CDN (`photo.yupoo.com`) blocks direct `<img>` hotlinking from
other websites — that's why a previous version of this site that pointed
`<img>` tags straight at `photo.yupoo.com` URLs failed to load images for
visitors. This project avoids that entirely by **downloading every image
to disk during import** and serving them from your own domain afterward.
The deployed website never requests anything from `yupoo.com` at runtime.

The importer itself *does* need to reach Yupoo (to scrape pages and
download the source images) — run it from a machine with normal internet
access. Once `public/images/` and `public/jerseys.json` are populated, the
website itself has no further dependency on Yupoo being reachable, online,
or even still existing.

---

## 10. Troubleshooting

**`fetch is not defined` when running the importer**
You're on Node < 18. Upgrade Node, or install `node-fetch@2` and uncomment
the import line at the top of `importer/scrape.js`.

**Importer downloads 0 photos for an album**
Yupoo occasionally changes its markup. Open the album URL in a browser,
view source, and confirm photo URLs still match the pattern
`https://photo.yupoo.com/<scope>/<hash>/medium.jpeg`. If the pattern
changed, update the regex in `extractPhotos()` in `importer/scrape.js`.

**A jersey's title looks wrong / team is in English already as "null"**
Add the missing Chinese→English mapping to `TEAM_DICTIONARY` in
`importer/translate.js`, then re-run the importer for that album's URL.

**Images show a broken-image icon on the live site**
Check that `public/images/<albumId>/...` actually contains the files (the
importer must be run from a machine with internet access to Yupoo first)
and that they were committed/deployed alongside the rest of `public/`.
