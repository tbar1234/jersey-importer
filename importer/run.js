#!/usr/bin/env node
/**
 * importer/run.js
 * ─────────────────────────────────────────────────────────────────────────
 * CLI importer entry point.
 *
 * USAGE
 * ─────
 *   # Import a single jersey album by URL
 *   node importer/run.js --album https://168dyfs.x.yupoo.com/albums/241571681?uid=1
 *
 *   # Import multiple albums at once
 *   node importer/run.js --album <url1> --album <url2> --album <url3>
 *
 *   # Import every album listed in a text file (one URL per line)
 *   node importer/run.js --file urls.txt
 *
 *   # Auto-discover every album under a Yupoo category/listing page
 *   node importer/run.js --catalog https://168dyfs.x.yupoo.com/categories/5103216
 *
 *   # Combine flags freely — duplicates are skipped automatically.
 *
 * WHAT IT DOES
 * ────────────
 *   For every album URL collected from the flags above, this script:
 *     1. Scrapes the album page (title + photo list)
 *     2. Downloads every photo into public/images/<albumId>/
 *     3. Translates the Chinese title to English & derives filter tags
 *     4. Upserts a record into data/jerseys.json (matched by album id, so
 *        re-running the importer updates existing entries instead of
 *        duplicating them)
 *
 * This script is intentionally idempotent / safely re-runnable:
 *   - Already-downloaded images are skipped (scrape.js checks file existence)
 *   - Existing jerseys.json records are updated in place, not duplicated
 * ─────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');

const { scrapeAlbum, sleep } = require('./scrape');
const { discoverAlbumUrls } = require('./catalog-urls');
const {
  translateTitle,
  deriveCategory,
  deriveRegion,
  deriveTypeTag,
} = require('./translate');

const ROOT_DIR = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT_DIR, 'public', 'images');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'jerseys.json');
const PUBLIC_DATA_FILE = path.join(ROOT_DIR, 'public', 'jerseys.json');

// ── Parse CLI args ─────────────────────────────────────────────────────────
function parseArgs(argv) {
  const albums = [];
  const catalogs = [];
  let file = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--album') {
      albums.push(argv[++i]);
    } else if (arg === '--catalog') {
      catalogs.push(argv[++i]);
    } else if (arg === '--file') {
      file = argv[++i];
    }
  }
  return { albums, catalogs, file };
}

function loadUrlsFromFile(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
  if (!fs.existsSync(abs)) {
    console.error(`URL file not found: ${abs}`);
    return [];
  }
  return fs
    .readFileSync(abs, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function loadExistingData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`Could not parse existing ${DATA_FILE}, starting fresh. (${err.message})`);
    }
  }
  return [];
}

function saveData(records) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf8');

  // Also mirror into /public so the static frontend can fetch it directly
  // at runtime via `fetch('jerseys.json')`.
  fs.mkdirSync(path.dirname(PUBLIC_DATA_FILE), { recursive: true });
  fs.writeFileSync(PUBLIC_DATA_FILE, JSON.stringify(records, null, 2), 'utf8');
}

/**
 * Convert a raw scrape result + translation into the final jersey record
 * shape used by the website.
 */
function buildJerseyRecord(scraped) {
  const translation = translateTitle(scraped.titleRaw);

  const record = {
    id: scraped.id,
    title: translation.titleEn,
    titleRaw: scraped.titleRaw,
    team: translation.team,
    season: translation.season,
    sizeRange: translation.sizeRange,
    category: deriveCategory(translation.team),
    region: deriveRegion(translation.team),
    type: deriveTypeTag(translation.kitTypes),
    kitTypeLabels: translation.kitTypes,
    colors: translation.colors,
    images: scraped.images,
    sourceImported: true, // marks this came from the Yupoo importer
    needsReview: translation.needsReview,
    scrapedAt: scraped.scrapedAt,
  };

  return record;
}

/**
 * Import a single album URL: scrape, translate, return a record.
 * Throws if scraping fails entirely (caller should catch & continue).
 */
async function importAlbum(albumUrl) {
  const scraped = await scrapeAlbum(albumUrl, IMAGES_DIR);
  const record = buildJerseyRecord(scraped);

  if (record.needsReview) {
    console.log(
      `  ⚠ NEEDS REVIEW — team not fully recognized. Raw title: "${scraped.titleRaw}". ` +
      `Add a translation entry in importer/translate.js if this is a new team.`
    );
  } else {
    console.log(`  ✓ Translated title: "${record.title}"`);
  }

  return record;
}

/**
 * Upsert a record into the in-memory list (matched by id).
 */
function upsertRecord(records, newRecord) {
  const idx = records.findIndex((r) => r.id === newRecord.id);
  if (idx >= 0) {
    records[idx] = newRecord;
  } else {
    records.push(newRecord);
  }
}

async function main() {
  const { albums, catalogs, file } = parseArgs(process.argv.slice(2));

  let albumUrls = [...albums];

  if (file) {
    albumUrls = albumUrls.concat(loadUrlsFromFile(file));
  }

  for (const catalogUrl of catalogs) {
    console.log(`\nDiscovering albums under catalog: ${catalogUrl}`);
    const discovered = await discoverAlbumUrls(catalogUrl);
    console.log(`Discovered ${discovered.length} album(s).`);
    albumUrls = albumUrls.concat(discovered);
  }

  // De-duplicate while preserving order
  albumUrls = Array.from(new Set(albumUrls));

  if (albumUrls.length === 0) {
    console.log(`
No album URLs supplied. Usage examples:

  node importer/run.js --album https://168dyfs.x.yupoo.com/albums/241571681?uid=1
  node importer/run.js --album <url1> --album <url2>
  node importer/run.js --file urls.txt
  node importer/run.js --catalog https://168dyfs.x.yupoo.com/categories/5103216
`);
    process.exit(1);
  }

  console.log(`\n${albumUrls.length} album(s) queued for import.\n${'='.repeat(60)}`);

  const records = loadExistingData();
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < albumUrls.length; i++) {
    const albumUrl = albumUrls[i];
    console.log(`\n[${i + 1}/${albumUrls.length}] ${albumUrl}`);

    try {
      const record = await importAlbum(albumUrl);
      upsertRecord(records, record);
      saveData(records); // save incrementally so progress isn't lost on crash
      successCount += 1;
    } catch (err) {
      console.error(`  ✗ FAILED to import ${albumUrl}: ${err.message}`);
      failCount += 1;
    }

    // Be polite to Yupoo's servers between albums
    if (i < albumUrls.length - 1) await sleep(500);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Import complete: ${successCount} succeeded, ${failCount} failed.`);
  console.log(`Data written to:\n  ${DATA_FILE}\n  ${PUBLIC_DATA_FILE}`);

  const flagged = records.filter((r) => r.needsReview);
  if (flagged.length) {
    console.log(`\n${flagged.length} record(s) flagged needsReview:true — these had a team`);
    console.log(`name the importer didn't recognize. Open importer/translate.js and add`);
    console.log(`an entry to TEAM_DICTIONARY, then re-run the import for those albums.`);
    flagged.forEach((r) => console.log(`  - [${r.id}] "${r.titleRaw}"`));
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
