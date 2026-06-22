/**
 * importer/catalog-urls.js
 * ─────────────────────────────────────────────────────────────────────────
 * Discovers album URLs automatically from a Yupoo "category" or "albums"
 * listing page, so you don't have to paste every individual album link
 * by hand.
 *
 * Usage pattern on this catalog:
 *   https://168dyfs.x.yupoo.com/categories/5103216   (a single category)
 *   https://168dyfs.x.yupoo.com/albums                (all albums, paged)
 *
 * Yupoo listing pages are paginated with a `?page=N` query param and embed
 * links to each album as:
 *   <a href="/albums/241571681?uid=1" ...>
 *
 * This module fetches each listing page, extracts every unique album URL,
 * and stops when a page returns no new albums (end of pagination).
 * ─────────────────────────────────────────────────────────────────────────
 */

const { fetchHtml, sleep } = require('./scrape');

/**
 * Extract every distinct /albums/<id> link from a listing page's HTML.
 */
function extractAlbumLinksFromListing(html, baseOrigin) {
  const re = /href=["']\/albums\/(\d+)(?:\?[^"']*)?["']/gi;
  const ids = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    ids.add(m[1]);
  }
  return Array.from(ids).map((id) => `${baseOrigin}/albums/${id}?uid=1`);
}

/**
 * Crawl a paginated category/listing URL and return every album URL found.
 *
 * @param {string} listingUrl   e.g. https://168dyfs.x.yupoo.com/categories/5103216
 * @param {object} opts
 * @param {number} opts.maxPages   safety cap on pagination depth (default 50)
 * @param {number} opts.delayMs    delay between page fetches (default 800ms)
 */
async function discoverAlbumUrls(listingUrl, opts = {}) {
  const { maxPages = 50, delayMs = 800 } = opts;

  const originMatch = listingUrl.match(/^https?:\/\/[a-z0-9.-]+/i);
  if (!originMatch) throw new Error(`Could not parse origin from ${listingUrl}`);
  const baseOrigin = originMatch[0];

  const allUrls = new Set();
  let page = 1;
  let previousCount = -1;

  while (page <= maxPages) {
    const separator = listingUrl.includes('?') ? '&' : '?';
    const pageUrl = page === 1 ? listingUrl : `${listingUrl}${separator}page=${page}`;

    console.log(`Scanning listing page ${page}: ${pageUrl}`);
    let html;
    try {
      html = await fetchHtml(pageUrl, { retries: 2 });
    } catch (err) {
      console.warn(`  Stopped: failed to fetch page ${page} (${err.message})`);
      break;
    }

    const found = extractAlbumLinksFromListing(html, baseOrigin);
    found.forEach((u) => allUrls.add(u));

    console.log(`  Found ${found.length} album link(s) on this page (total unique so far: ${allUrls.size})`);

    if (allUrls.size === previousCount) {
      console.log('  No new albums found — assuming end of pagination.');
      break;
    }
    previousCount = allUrls.size;

    page += 1;
    await sleep(delayMs);
  }

  return Array.from(allUrls);
}

module.exports = { discoverAlbumUrls, extractAlbumLinksFromListing };
