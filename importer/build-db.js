const fs = require("fs");
const path = require("path");

const IMAGE_DIR = path.join(__dirname, "../public/images");
const OUTPUT = path.join(__dirname, "../data/jerseys.json");

const albums = fs.readdirSync(IMAGE_DIR);

const data = albums
  .map((albumId) => {
    const folder = path.join(IMAGE_DIR, albumId);

    // STEP 1: read images
    const images = fs
      .readdirSync(folder)
      .filter((file) =>
        (file.endsWith(".jpg") || file.endsWith(".png")) &&
        !file.toLowerCase().includes("placeholder") &&
        !file.toLowerCase().includes("fake")
      )
      .sort();

    // STEP 2: SKIP broken/empty albums (THIS FIXES fake/empty ones)
    if (images.length < 2) return null;

    // STEP 3: CLEAN + REALISTIC DATA
    return {
      id: albumId,

      // FIXED TITLES (no more ugly IDs)
      title: `Soccer Jersey ${albumId.slice(-4)}`,
      team: "Unknown Team",
      season: "",
      category: "club",
      type: "home",
      region: "europe",

      images
    };
  })
  .filter(Boolean);

fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2));

console.log(`Built database with ${data.length} jerseys`);