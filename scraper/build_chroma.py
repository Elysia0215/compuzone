"""
Builds a local persistent ChromaDB collection from output/parts_db.json, so the
chatbot's product/category Q&A can eventually retrieve real Compuzone listings
via semantic search instead of the hardcoded PRODUCT_CATALOG in catalog.py.

Embedding model: if GEMINI_API_KEY is set (.env / .env.local, same as server.py),
this uses Gemini's text-embedding-004 model, which handles Korean product text
correctly. WITHOUT a key, it falls back to Chroma's bundled default embedder
(all-MiniLM-L6-v2) -- that model is English-only and gives poor/irrelevant
results on Korean text, so semantic search quality will suffer. This mirrors
server.py's own fallback design (rule-based Korean keyword matching when no key
is present), but there's no good non-Gemini fallback for Korean embeddings here,
so a GEMINI_API_KEY is effectively required for this collection to be useful.

NOTE: this collection is NOT wired into server.py yet -- see scraper/README.md
for what integration work remains.

Usage:
    python build_chroma.py [--source output/parts_db.json] [--db-path output/chroma_db]
"""
import argparse
import json
import os
import sys
from pathlib import Path

import chromadb
from dotenv import load_dotenv

COLLECTION_NAME = "compuzone_parts"
EMBEDDING_MODEL = "text-embedding-004"
BATCH_SIZE = 50


def embed_with_gemini(texts: list[str]) -> list[list[float]]:
    from google import genai

    client = genai.Client()
    vectors = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        response = client.models.embed_content(model=EMBEDDING_MODEL, contents=batch)
        vectors.extend(e.values for e in response.embeddings)
        print(f"  embedded {min(i + BATCH_SIZE, len(texts))}/{len(texts)}", file=sys.stderr)
    return vectors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=str(Path(__file__).parent / "output" / "parts_db.json"))
    parser.add_argument("--db-path", default=str(Path(__file__).parent / "output" / "chroma_db"))
    args = parser.parse_args()

    load_dotenv(".env.local")
    load_dotenv(".env")
    load_dotenv("../.env")
    load_dotenv("../.env.local")

    with open(args.source, encoding="utf-8") as f:
        parts = json.load(f)["parts"]

    ids, documents, metadatas = [], [], []
    for part in parts:
        ids.append(part["product_id"])
        documents.append(f"[{part['category']}] {part['name']} - {part.get('description', '')}")
        metadatas.append({
            "category": part["category"],
            "name": part["name"],
            "price": part["price"],
            "condition": part.get("condition", "unknown"),
        })

    client = chromadb.PersistentClient(path=args.db_path)
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass

    if os.environ.get("GEMINI_API_KEY"):
        print("GEMINI_API_KEY found -- embedding with text-embedding-004 (Korean-aware).", file=sys.stderr)
        embeddings = embed_with_gemini(documents)
        collection = client.create_collection(COLLECTION_NAME)
        collection.add(ids=ids, documents=documents, metadatas=metadatas, embeddings=embeddings)
    else:
        print(
            "WARNING: no GEMINI_API_KEY set -- falling back to Chroma's default "
            "English-only embedder. Korean semantic search results will be poor. "
            "Set GEMINI_API_KEY in .env/.env.local and re-run for real use.",
            file=sys.stderr,
        )
        collection = client.create_collection(COLLECTION_NAME)
        collection.add(ids=ids, documents=documents, metadatas=metadatas)

    print(f"Indexed {len(ids)} products into Chroma collection '{COLLECTION_NAME}' at {args.db_path}")


if __name__ == "__main__":
    main()
