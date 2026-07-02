# Compuzone scraper

Pulls real, current PC-part listings from compuzone.co.kr and turns them into
data the chatbot backend (`server.py`) can use, instead of the hand-written
stub data in `parts_db.json` / `catalog.py`.

This is a **minimum-viable, one-off script** -- it runs a curated set of search
queries per part category (not a full catalog crawl) and writes a snapshot.
Re-run it by hand whenever you want fresher prices/stock; there's no scheduler.

## How it scrapes (and why it's safe to run)

- compuzone.co.kr's `robots.txt` allows crawling (`Allow: /`, no `Disallow`, no
  `Crawl-delay`) as of 2026-07-02.
- It calls the same public search endpoint
  (`/search/search_list.php?actype=list...`) that the site's own frontend
  JavaScript calls when you use the search box -- no login bypass, no
  fingerprint spoofing, no proxy rotation, no CAPTCHA handling.
- Requests are serialized with a ~1s delay between them and a descriptive
  User-Agent identifying the bot.

If compuzone's site structure changes, `CATEGORY_CONFIG` in
`scrape_compuzone.py` (the `BigDivNo`/`MediumDivNo`/`DivNo` triples and the
HTML selectors in `parse_products`) will need to be re-derived.

## Setup

```bash
pip install -r requirements.txt
```

## Run

```bash
python scrape_compuzone.py            # writes output/parts_db.json
python build_chroma.py                # writes output/chroma_db/ (needs parts_db.json above)
```

`build_chroma.py` needs `GEMINI_API_KEY` set (`.env` / `.env.local`, same as
`server.py`) to produce useful results -- see "Embeddings need a Gemini key"
below.

## What to replace in the main project

**1. `parts_db.json` (project root) -- replace it with `output/parts_db.json`.**

This is a straight drop-in: `server.py`'s `build_configuration()` /
`find_item()` read `parts_db.json` at startup and filter on `category`,
`price`, `tier`, `socket`, `ram_gen`, `generation`, `capacity`, `wattage`, and
`tdp`. The old stub file used category names (`PSU`, `MB`, `CASE`) that don't
actually match what `find_item()` filters for (`Power`, `Motherboard`,
`Cooler`) -- so it silently fell through to the "no candidates" branch on
every real filter. `output/parts_db.json` uses the categories `find_item()`
actually expects, and adds the `socket`/`ram_gen`/`generation`/`capacity`/
`wattage` fields the old stub never populated. This is a functional fix, not
just a data refresh.

**2. `output/chroma_db/` -- NOT wired into `server.py` yet.** This step only
produces the vector collection. Hooking it up is separate follow-up work:
`catalog.py`'s hardcoded `PRODUCT_CATALOG` is still what `/api/chat/query_product`,
`/api/chat/query_category`, and `/api/chat/recommend_feedback` use for
grounding Gemini's answers ([server.py](../server.py) lines 553, 626, 463).
Replacing that with a query against this Chroma collection (`collection_name
= "compuzone_parts"`, at `scraper/output/chroma_db/`) is the next step, not
done here.

## Embeddings need a Gemini key

`build_chroma.py` embeds each product with Gemini's `text-embedding-004` model
when `GEMINI_API_KEY` is set -- this handles Korean product text correctly.
**Without a key**, it falls back to Chroma's bundled default embedder
(`all-MiniLM-L6-v2`), which is English-only and gives poor/irrelevant nearest
neighbors on Korean text (verified: querying "롤 하기 좋은 그래픽카드" returned
CPU coolers, not GPUs). There's no good non-Gemini fallback for Korean
embeddings here, so a real key is effectively required before this collection
is useful for anything beyond a structural smoke test.

## Known limitations (minimum-viable scope)

- **Category coverage**: `CATEGORY_CONFIG` in `scrape_compuzone.py` has a
  handful of representative search queries per category (e.g. a few CPU model
  families, a few GPU tiers). It's enough breadth for `build_configuration()`
  to make real tier/socket/wattage-based selections, not an exhaustive catalog.
  Add more strings to a category's `"queries"` list for broader coverage.
- **GPU condition**: as of 2026-07-02, compuzone's standalone graphics-card
  listings are almost entirely resale/bulk/refurbished units -- searches
  restricted to new-condition listings returned ~0-2 results per model. GPU is
  the one category where used/bulk items are kept (all others exclude them);
  each part has a `"condition": "new" | "used_or_bulk"` field so this is
  visible, not silently hidden.
- **`tier` (1-5) is a price-rank heuristic**, computed by bucketing each
  category's scraped items into price quintiles -- it's a proxy for
  "entry-level vs flagship," not a verified performance benchmark. With only
  a handful of GPUs scraped, an expensive used older-gen card can outrank a
  cheaper new current-gen one. Widening the GPU query list (more models across
  more price points) will make this more accurate.
- **`tdp` for GPUs defaults to 150W** when the listing's spec text doesn't
  state power draw explicitly (common on bulk/used listings).

## Re-running / extending

Just run both scripts again -- `scrape_compuzone.py` overwrites
`output/parts_db.json`, and `build_chroma.py` drops and recreates the Chroma
collection each time, so there's no manual cleanup needed. To scrape more
products, add more query strings to `CATEGORY_CONFIG` in
`scrape_compuzone.py`.
