const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

const BASE = "https://168dyfs.x.yupoo.com/albums";

async function fetchPage(page = 1) {
  const url = page === 1 ? BASE : `${BASE}?page=${page}`;
  const res = await axios.get(url);
  return res.data;
}

async function run() {
  console.log("Starting full catalog scrape...");

  const links = new Set();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    console.log(`Scraping page ${page}...`);

    const html = await fetchPage(page);
    const $ = cheerio.load(html);

    let foundOnPage = 0;

    $("a").each((_, el) => {
      const href = $(el).attr("href");

      if (href && href.includes("/albums/")) {
        const full = href.startsWith("http")
          ? href
          : `https://168dyfs.x.yupoo.com${href}`;

        links.add(full.split("?")[0] + "?uid=1");
        foundOnPage++;
      }
    });

    console.log(`Found ${foundOnPage} on page ${page}`);

    // STOP CONDITION (important)
    if (foundOnPage === 0 || page > 50) {
      hasMore = false;
    } else {
      page++;
    }
  }

  console.log(`Total links found: ${links.size}`);

  fs.writeFileSync("urls.txt", [...links].join("\n"));

  console.log("Saved full urls.txt");
}

run();