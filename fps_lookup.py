"""
fps_lookup.py — FPS 예측 조회 모듈
GPU 모델명 + 게임명을 받아 fps_map.json에서 예측 FPS를 반환한다.
데이터가 없으면 유사 GPU tier 기반으로 근사치를 추정하고 fallback 플래그를 세운다.
"""

import json
from pathlib import Path

_DATA = json.loads(Path(__file__).with_name("fps_map.json").read_text(encoding="utf-8"))
_BENCH = _DATA["benchmarks"]
_LABELS = _DATA["game_labels"]

# GPU 성능 순서 (tier 근사 추정용)
_GPU_ORDER = ["RTX 4060", "RTX 4060 Ti", "RTX 4070", "RTX 4070 Super", "RTX 4080 Super"]


def lookup_fps(gpu: str, game: str) -> dict:
    """정확 매칭 우선, 없으면 유사 GPU 기반 근사 추정."""
    # 1. 정확 매칭
    for row in _BENCH:
        if row["gpu"] == gpu and row["game"] == game:
            return {
                "avg_fps": row["avg_fps"],
                "min_fps": row["min_fps"],
                "game_label": _LABELS.get(game, game),
                "fallback": False,
            }

    # 2. 같은 게임 다른 GPU → 가장 가까운 GPU로 근사
    same_game = [r for r in _BENCH if r["game"] == game]
    if same_game and gpu in _GPU_ORDER:
        target_idx = _GPU_ORDER.index(gpu)
        best = min(
            same_game,
            key=lambda r: abs(_GPU_ORDER.index(r["gpu"]) - target_idx)
            if r["gpu"] in _GPU_ORDER else 99,
        )
        return {
            "avg_fps": best["avg_fps"],
            "min_fps": best["min_fps"],
            "game_label": _LABELS.get(game, game),
            "fallback": True,
        }

    # 3. 게임 자체가 없음 → fallback
    return {
        "avg_fps": None,
        "min_fps": None,
        "game_label": _LABELS.get(game, game),
        "fallback": True,
    }


def make_headline(gpu: str, game: str) -> str:
    """리포트 최상단 헤드라인 문구 생성 (초보자 언어)."""
    r = lookup_fps(gpu, game)
    label = r["game_label"]

    if r["avg_fps"] is None:
        return f"{label}은 데이터가 없어 유사 게임 기준으로 추정했어요"

    fps = r["avg_fps"]
    suffix = " (유사 사양 기준 추정)" if r["fallback"] else ""

    if fps >= 240:
        feel = "초고주사율 모니터도 문제없어요"
    elif fps >= 144:
        feel = "부드러운 고주사율 플레이 가능해요"
    elif fps >= 60:
        feel = "쾌적하게 즐길 수 있어요"
    else:
        feel = "설정을 조금 낮추면 더 부드러워요"

    return f"{label} FHD 약 {fps}프레임 예상 — {feel}{suffix}"


if __name__ == "__main__":
    # 테스트
    tests = [
        ("RTX 4070 Super", "valorant"),
        ("RTX 4060", "cyberpunk2077"),
        ("RTX 4080 Super", "battleground"),
        ("RTX 4070", "minecraft"),  # 없는 게임 → fallback
    ]
    for gpu, game in tests:
        print(f"[{gpu} + {game}]")
        print("  →", make_headline(gpu, game))
        print("  raw:", lookup_fps(gpu, game))
        print()
