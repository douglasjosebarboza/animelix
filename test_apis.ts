import { AnilistAdapter } from './lib/anilist';
import { JikanAdapter } from './lib/jikan';

async function test() {
  console.log("Testing AniList...");
  try {
    const anilist = new AnilistAdapter();
    const res = await anilist.search("Naruto");
    console.log("AniList search success:", res.length, "results");
  } catch (e) {
    console.error("AniList search failed:", e);
  }

  console.log("\nTesting Jikan...");
  try {
    const jikan = new JikanAdapter();
    const res = await jikan.search("Naruto");
    console.log("Jikan search success:", res.length, "results");
  } catch (e) {
    console.error("Jikan search failed:", e);
  }
}

test();
