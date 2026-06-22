/**
 * importer/scrape.js
 * ─────────────────────────────────────────────────────────────────────────
 * Core scraping engine for Yupoo album pages.
 *
 * Responsibilities:
 *   1. Fetch the raw HTML of a Yupoo album page
 *      e.g. https://168dyfs.x.yupoo.com/albums/241571681?uid=1
 *   2. Parse out:
 *        - the album title              (e.g. "26-27波尔图主S-4XL")
 *        - the album id                 (e.g. "241571681")
 *        - every photo's hash id + the photo.yupoo.com base path
 *   3. Download every photo (the "medium" size, which is good enough for
 *      web display and far smaller than the originals) to
 *        public/images/<albumId>/<n>.jpg
 *   4. Return a plain JS object describing the jersey, ready to be merged
 *      into data/jerseys.json by importer/run.js
 *
 * NOTES ON YUPOO'S MARKUP
 * ─────────────────────────
 * Yupoo album pages embed each photo twice in the raw HTML:
 *   <img src="https://photo.yupoo.com/<scope>/<hash>/small.jpeg" ...>
 *   <img src="https://photo.yupoo.com/<scope>/<hash>/medium.jpeg" ...>
 * (small = thumbnail, medium = full preview). We only need the medium URLs;
 * we de-duplicate by photo hash since each appears in a few places on the
 * page (gallery grid + lightbox markup).
 *
 * Yupoo's hotlink/CDN protection blocks requests that don't look like they
 * came from a browser navigating yupoo.com itself, so all fetches below
 * send a realistic User-Agent + Referer header.
 * ─────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');

// Node.js 18+ ships a global `fetch` (undici) — no dependency needed.
// If you're on an older Node version, run `npm install node-fetch@2`
// and uncomment the line below.
// const fetch = require('node-fetch');
if (typeof fetch === 'undefined') {
  throw new Error(
    'global fetch is not available. You are likely on Node < 18. ' +
    'Either upgrade Node, or run `npm install node-fetch@2` and uncomment ' +
    'the require line at the top of importer/scrape.js.'
  );
}

// ── HTTP headers that satisfy Yupoo's basic bot/hotlink checks ────────────
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function imageHeaders(albumUrl) {
  return {
    ...BROWSER_HEADERS,
    Referer: albumUrl,
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  };
}

/**
 * Fetch raw HTML for any URL with retry-on-failure.
 */
async function fetchHtml(url, { retries = 3, delayMs = 1200 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      console.warn(`  [retry ${attempt}/${retries}] ${err.message}`);
      await sleep(delayMs * attempt);
    }
  }
  throw lastErr;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract the Yupoo album numeric ID from any album URL.
 *   https://168dyfs.x.yupoo.com/albums/241571681?uid=1  ->  "241571681"
 */
function extractAlbumId(albumUrl) {
  const m = albumUrl.match(/\/albums\/(\d+)/);
  if (!m) throw new Error(`Could not find album id in URL: ${albumUrl}`);
  return m[1];
}

/**
 * Extract the Yupoo "scope" (shop subdomain slug used in the CDN path),
 * e.g. for https://168dyfs.x.yupoo.com/... the scope is "168dyfs".
 */
function extractScope(albumUrl) {
  const m = albumUrl.match(/^https?:\/\/([a-z0-9-]+)\.x\.yupoo\.com/i);
  return m ? m[1] : null;
}

/**
 * Pull the album title out of the page <title> tag or og:title meta tag.
 * Yupoo titles look like:  "26-27波尔图主S-4XL | 相册 | 大悦服饰 | Supplier Product Catalog"
 * We only want the first segment before the first " | ".
 */
function extractTitle(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  let raw = og ? og[1] : null;

  if (!raw) {
    const t = html.match(/<title>([^<]+)<\/title>/i);
    raw = t ? t[1] : '';
  }

  // Keep only the part before the first pipe separator
  const firstSegment = raw.split('|')[0].trim();
  return firstSegment || 'Untitled Album';
}

/**
 * Extract every unique photo hash + its CDN scope from the album HTML.
 * Returns an array of { scope, hash, mediumUrl, smallUrl } in page order.
 *
 * Yupoo embeds photo URLs like:
 *   https://photo.yupoo.com/168dyfs/9e8f4ed4cf/medium.jpeg
 *   https://photo.yupoo.com/168dyfs/9e8f4ed4cf/small.jpeg
 */
function extractPhotos(html) {
  const re = /https:\/\/photo\.yupoo\.com\/([a-z0-9_-]+)\/([a-f0-9]+)\/(small|medium|large)\.jpe?g/gi;
  const seen = new Map(); // hash -> { scope, hash }
  let match;

  while ((match = re.exec(html)) !== null) {
    const [, scope, hash] = match;
    if (!seen.has(hash)) {
      seen.set(hash, { scope, hash });
    }
  }

  return Array.from(seen.values()).map(({ scope, hash }) => ({
    scope,
    hash,
    mediumUrl: `https://photo.yupoo.com/${scope}/${hash}/medium.jpeg`,
    smallUrl: `https://photo.yupoo.com/${scope}/${hash}/small.jpeg`,
  }));
}

/**
 * Extract the category name (used for tagging / filtering), if present.
 * Yupoo shows: 所属分类： [26-27俱乐部球迷](https://.../categories/5103216 "26-27俱乐部球迷")
 */
function extractCategory(html) {
  const m = html.match(/categories\/(\d+)["'][^>]*>([^<]+)</i);
  return m ? { id: m[1], nameRaw: m[2].trim() } : null;
}

/**
 * Download a single image to disk, skipping if it already exists.
 * Returns the local relative path (relative to /public).
 */
async function downloadImage(imageUrl, destAbsPath, refererUrl) {
  if (fs.existsSync(destAbsPath) && fs.statSync(destAbsPath).size > 0) {
    return; // already downloaded — importer is safely re-runnable
  }

  fs.mkdirSync(path.dirname(destAbsPath), { recursive: true });

  const res = await fetch(imageUrl, { headers: imageHeaders(refererUrl) });
  if (!res.ok) {
    throw new Error(`Failed to download ${imageUrl} — HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(destAbsPath, buffer);
}

/**
 * Main entry point: scrape one Yupoo album URL end-to-end.
 *
 * @param {string} albumUrl       Full Yupoo album URL
 * @param {string} imagesRootDir  Absolute path to public/images
 * @returns {Promise<object>}     Jersey record (without manual tags applied)
 */
async function scrapeAlbum(albumUrl, imagesRootDir) {
  console.log(`\nFetching album page:\n  ${albumUrl}`);
  const html = await fetchHtml(albumUrl);

  const albumId = extractAlbumId(albumUrl);
  const titleRaw = extractTitle(html);
  const photos = extractPhotos(html);
  const category = extractCategory(html);

  if (photos.length === 0) {
    console.warn(`  ⚠ No photos found for album ${albumId}. Page markup may have changed.`);
  } else {
    console.log(`  Found ${photos.length} photo(s). Title (raw): "${titleRaw}"`);
  }

  const albumImageDir = path.join(imagesRootDir, albumId);
  const localImages = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const filename = `${String(i + 1).padStart(2, '0')}.jpg`;
    const destAbsPath = path.join(albumImageDir, filename);

    process.stdout.write(`  Downloading image ${i + 1}/${photos.length}... `);
    try {
      await downloadImage(photo.mediumUrl, destAbsPath, albumUrl);
      console.log('done');
    } catch (err) {
      console.log(`FAILED (${err.message})`);
      continue;
    }

    // Path stored in JSON is relative to /public so the frontend can use
    // it directly as <img src="images/241571681/01.jpg">
    localImages.push(`images/${albumId}/${filename}`);

    // Be polite to Yupoo's CDN — small delay between downloads
    await sleep(150);
  }

  return {
    id: albumId,
    sourceUrl: albumUrl,
    titleRaw,
    category: category ? category.nameRaw : null,
    images: localImages,
    scrapedAt: new Date().toISOString(),
  };
}

module.exports = {
  fetchHtml,
  extractAlbumId,
  extractScope,
  extractTitle,
  extractPhotos,
  extractCategory,
  downloadImage,
  scrapeAlbum,
  sleep,
  BROWSER_HEADERS,
};
