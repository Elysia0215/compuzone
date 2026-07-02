"""
Scrapes live PC part listings from compuzone.co.kr's own site-search endpoint and
writes a parts_db.json compatible with server.py's build_configuration()/find_item().

Respectful scraping:
- compuzone.co.kr's robots.txt allows crawling (Allow: / , no Disallow, no Crawl-delay)
  as of 2026-07-02.
- We hit the same public search endpoint the site's own frontend JS calls
  (search/search_list.php) -- no auth bypass, no fingerprint spoofing, no proxy
  rotation, no CAPTCHA handling.
- Requests are serialized with a delay between them (REQUEST_DELAY_SEC) and a
  descriptive User-Agent identifying this as a bot.

This is a "minimum viable" seed scraper: a curated list of representative search
queries per category (not an exhaustive full-catalog crawl), chosen to give
build_configuration() enough tiers/sockets/wattages to make real selections.
Extend CATEGORY_CONFIG's "queries" lists for broader coverage.

Usage:
    python scrape_compuzone.py [--out output/parts_db.json] [--per-query 20]
"""
import argparse
import json
import re
import sys
import time
from datetime import date
from pathlib import Path

import requests
from bs4 import BeautifulSoup

SEARCH_URL = "https://www.compuzone.co.kr/search/search_list.php"
USER_AGENT = (
    "CompuzoneCatalogBot/1.0 "
    "(+student project data sync; contact: sesac2024ai12@gmail.com)"
)
REQUEST_DELAY_SEC = 1.0

# Bracket/keyword markers that mean "not a fresh, standard-condition listing" --
# used goods, refurbished units, floor demos, returns. We skip these so the
# catalog reflects normal new-item pricing.
EXCLUDE_MARKERS = ["중고", "리퍼", "전시상품", "반품", "렌탈"]

# (BigDivNo, MediumDivNo, DivNo) triples discovered by inspecting compuzone's own
# search_list.php responses on 2026-07-02 (DivNo=None spans every sub-bucket under
# that MediumDivNo, e.g. Cooler has separate air/liquid DivNo values).
CATEGORY_CONFIG = {
    "CPU": {
        "div": (4, 1012, 2033),
        "queries": ["라이젠5 CPU", "라이젠7 CPU", "라이젠9 CPU", "인텔 코어 i5 CPU", "인텔 코어 i7 CPU"],
    },
    "GPU": {
        "div": (89, 1126, 2608),
        "queries": [
            "RTX 4060 그래픽카드", "RTX 4060 Ti 그래픽카드", "RTX 4070 그래픽카드",
            "RTX 4070 SUPER 그래픽카드", "RTX 4080 SUPER 그래픽카드",
            "RTX 5060 그래픽카드", "RTX 5070 그래픽카드",
        ],
    },
    "Motherboard": {
        "div": (4, 1013, 2035),
        "queries": ["B650 메인보드", "B850 메인보드", "B760 메인보드", "A620 메인보드"],
    },
    "RAM": {
        "div": (4, 1014, 2036),
        "queries": ["DDR5 16GB 메모리", "DDR5 32GB 메모리", "DDR4 16GB 메모리"],
    },
    "SSD": {
        "div": (4, 1276, 3400),
        "queries": ["NVMe 500GB SSD", "NVMe 1TB SSD", "NVMe 2TB SSD"],
    },
    "Power": {
        "div": (4, 1148, 2754),
        "queries": ["600W 파워 골드", "750W 파워 골드", "850W 파워 골드", "1000W 파워 골드"],
    },
    "Cooler": {
        "div": (4, 1020, None),
        "queries": ["공랭 쿨러", "수랭 쿨러 CPU"],
    },
}

# Note: no \b at the start -- Python's \b treats Korean characters as word
# characters, so it never matches a boundary in strings like "소켓AM5" (no
# space between the Korean word for "socket" and the token itself).
SOCKET_PATTERN = re.compile(
    r"(?<![A-Za-z0-9])(AM5|AM4|LGA\s?1851|LGA\s?1700|LGA\s?1200|LGA\s?115x)(?![A-Za-z0-9])",
    re.IGNORECASE,
)
TDP_PATTERN = re.compile(r"(?:TDP|사용전력)\s*[:：]?\s*(\d{2,4})\s*W(?![A-Za-z0-9])", re.IGNORECASE)
WATTAGE_PATTERN = re.compile(r"(?<![A-Za-z0-9])(\d{3,4})W(?![A-Za-z0-9])")
CAPACITY_GB_PATTERN = re.compile(r"(\d{1,5})\s*GB(?![A-Za-z0-9])", re.IGNORECASE)
CAPACITY_TB_PATTERN = re.compile(r"(\d(?:\.\d+)?)\s*TB(?![A-Za-z0-9])", re.IGNORECASE)


def normalize_socket(spec_text: str) -> str | None:
    m = SOCKET_PATTERN.search(spec_text)
    if not m:
        return None
    return m.group(1).upper().replace(" ", "")


def fetch_listing(session: requests.Session, query: str, big_div: int, medium_div: int,
                   div_no: int | None, per_query: int) -> BeautifulSoup:
    params = {
        "actype": "list",
        "SearchType": "",
        "SearchText": query,
        "PreOrder": "",
        "PageCount": per_query,
        "StartNum": 0,
        "PageNum": 1,
        "ListType": "list",
        "BigDivNo": big_div,
        "MediumDivNo": medium_div,
    }
    if div_no is not None:
        params["DivNo"] = div_no
    resp = session.get(SEARCH_URL, params=params, timeout=15)
    resp.encoding = "euc-kr"
    return BeautifulSoup(resp.text, "html.parser")


def parse_products(soup: BeautifulSoup, exclude_used: bool = True) -> list[dict]:
    products = []
    for li in soup.find_all("li", id=re.compile(r"^li-pno-\d+$")):
        product_id = li["id"].replace("li-pno-", "")
        name_tag = li.select_one("a.prd_info_name.prdTxt")
        if not name_tag:
            continue
        name = name_tag.get_text(strip=True)

        if exclude_used and any(marker in name for marker in EXCLUDE_MARKERS):
            continue

        spec_tag = li.select_one(".prd_subTxt a")
        spec_text = spec_tag.get_text(" ", strip=True) if spec_tag else ""
        if exclude_used and any(marker in spec_text for marker in EXCLUDE_MARKERS):
            continue

        price_tag = li.select_one(".prd_price[data-price]")
        if not price_tag or not price_tag["data-price"].replace(",", "").isdigit():
            continue
        price = int(price_tag["data-price"].replace(",", ""))

        products.append({
            "product_id": f"cz_{product_id}",
            "name": name,
            "price": price,
            "spec_text": spec_text,
        })
    return products


def extract_category_fields(category: str, spec_text: str) -> dict:
    fields = {}
    if category in ("CPU", "GPU"):
        tdp_match = TDP_PATTERN.search(spec_text)
        fields["tdp"] = int(tdp_match.group(1)) if tdp_match else (65 if category == "CPU" else 150)
    if category in ("CPU", "Motherboard"):
        socket = normalize_socket(spec_text)
        if socket:
            fields["socket"] = socket
    if category == "Motherboard":
        fields["ram_gen"] = "DDR5" if "DDR5" in spec_text else ("DDR4" if "DDR4" in spec_text else None)
    if category == "RAM":
        fields["generation"] = "DDR5" if "DDR5" in spec_text else ("DDR4" if "DDR4" in spec_text else None)
        cap_match = CAPACITY_GB_PATTERN.search(spec_text)
        fields["capacity"] = int(cap_match.group(1)) if cap_match else None
    if category == "SSD":
        tb_match = CAPACITY_TB_PATTERN.search(spec_text)
        gb_match = CAPACITY_GB_PATTERN.search(spec_text)
        if tb_match:
            fields["capacity"] = int(float(tb_match.group(1)) * 1000)
        elif gb_match:
            fields["capacity"] = int(gb_match.group(1))
        else:
            fields["capacity"] = None
    if category == "Power":
        watt_match = WATTAGE_PATTERN.search(spec_text)
        fields["wattage"] = int(watt_match.group(1)) if watt_match else None
    return fields


def assign_tiers(parts: list[dict]) -> None:
    """Assigns a 1(entry)-5(flagship) tier per category based on price rank,
    matching the tier scale used by the original parts_db.json stub."""
    by_category: dict[str, list[dict]] = {}
    for part in parts:
        by_category.setdefault(part["category"], []).append(part)

    for category, items in by_category.items():
        if category not in ("CPU", "GPU", "Cooler"):
            continue
        items.sort(key=lambda p: p["price"])
        n = len(items)
        for idx, part in enumerate(items):
            bucket = min(4, (idx * 5) // max(n, 1))
            part["tier"] = bucket + 1


# GPU note: as of 2026-07-02 compuzone's standalone graphics-card listings
# (DivNo=2608) are almost entirely resale/bulk/refurbished units -- searches
# restricted to new-condition listings return ~0-2 results per model. We keep
# the used/refurb items for GPU only so the category isn't left nearly empty,
# and tag each part's real condition instead of silently hiding it.
CATEGORIES_ALLOWING_USED = {"GPU"}


def detect_condition(name: str, spec_text: str) -> str:
    combined = f"{name} {spec_text}"
    return "used_or_bulk" if any(marker in combined for marker in EXCLUDE_MARKERS) else "new"


def scrape_category(session: requests.Session, category: str, config: dict, per_query: int) -> list[dict]:
    big_div, medium_div, div_no = config["div"]
    exclude_used = category not in CATEGORIES_ALLOWING_USED
    seen_ids = set()
    results = []
    for query in config["queries"]:
        print(f"  querying '{query}'...", file=sys.stderr)
        soup = fetch_listing(session, query, big_div, medium_div, div_no, per_query)
        for raw in parse_products(soup, exclude_used=exclude_used):
            if raw["product_id"] in seen_ids:
                continue
            seen_ids.add(raw["product_id"])
            extra = extract_category_fields(category, raw["spec_text"])
            results.append({
                "product_id": raw["product_id"],
                "category": category,
                "name": raw["name"],
                "price": raw["price"],
                "stock": True,
                "condition": detect_condition(raw["name"], raw["spec_text"]),
                "description": raw["spec_text"][:200],
                **extra,
            })
        time.sleep(REQUEST_DELAY_SEC)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(Path(__file__).parent / "output" / "parts_db.json"))
    parser.add_argument("--per-query", type=int, default=20, help="Max listings fetched per search query")
    args = parser.parse_args()

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    all_parts = []
    for category, config in CATEGORY_CONFIG.items():
        print(f"Scraping {category}...", file=sys.stderr)
        all_parts.extend(scrape_category(session, category, config, args.per_query))

    assign_tiers(all_parts)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "_comment": "Live-scraped from compuzone.co.kr search listings. Categories match server.py's build_configuration()/find_item() exactly (CPU/GPU/Motherboard/RAM/SSD/Power/Cooler).",
        "_source": "https://www.compuzone.co.kr (public search endpoint)",
        "_scraped_at": date.today().isoformat(),
        "parts": all_parts,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    by_category = {}
    for part in all_parts:
        by_category[part["category"]] = by_category.get(part["category"], 0) + 1
    print(f"\nWrote {len(all_parts)} parts to {out_path}", file=sys.stderr)
    for category, count in by_category.items():
        print(f"  {category}: {count}", file=sys.stderr)


if __name__ == "__main__":
    main()
