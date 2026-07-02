"""
pipeline.py — PRD 9절 AI 파이프라인 5단계 구현
[입력 JSON] → Step1 분류 → Step2 성능판단 → Step3 예산배분 → Step4 부품매칭 → Step5 출력생성
LLM(Step5)은 선택적. LLM 없이도 룰 기반으로 완전히 동작한다.
"""

import json
from pathlib import Path
from fps_lookup import lookup_fps, make_headline

_PARTS = json.loads(Path(__file__).with_name("parts_db.json").read_text(encoding="utf-8"))["parts"]

# ── PRD 9절 예산 배분표 ─────────────────────────────
_BUDGET_ALLOC = {
    ("game", "value"):    {"GPU": 0.38, "CPU": 0.18, "RAM": 0.15, "SSD": 0.15, "ETC": 0.14},
    ("game", "balance"):  {"GPU": 0.40, "CPU": 0.20, "RAM": 0.15, "SSD": 0.15, "ETC": 0.10},
    ("game", "perf"):     {"GPU": 0.45, "CPU": 0.25, "RAM": 0.15, "SSD": 0.10, "ETC": 0.05},
    ("design", "value"):  {"GPU": 0.10, "CPU": 0.28, "RAM": 0.25, "SSD": 0.22, "ETC": 0.15},
    ("design", "balance"):{"GPU": 0.15, "CPU": 0.30, "RAM": 0.25, "SSD": 0.20, "ETC": 0.10},
    ("design", "perf"):   {"GPU": 0.15, "CPU": 0.35, "RAM": 0.25, "SSD": 0.20, "ETC": 0.05},
}

# 견적 3종 타입
_TYPES = ["value", "balance", "perf"]
_TYPE_LABEL = {"value": "가성비형", "balance": "균형형", "perf": "성능형"}


# ── Step 1: 유형 분류 ───────────────────────────────
def step1_classify(purpose: str, games: list[str], programs: list[str]) -> dict:
    if purpose == "game":
        # 경쟁형(발로란트/롤/오버워치) vs 고사양(배그/사이버펑크)
        competitive = {"valorant", "lol", "overwatch2"}
        high_end = {"battleground", "cyberpunk2077"}
        tags = set()
        for g in games:
            if g in competitive:
                tags.add("competitive")
            elif g in high_end:
                tags.add("high_end")
        return {"type": "game", "sub": list(tags) or ["general"]}
    else:
        return {"type": "design", "sub": ["creative"]}


# ── Step 2: 성능 판단 (게임=GPU 우선, 디자인=CPU/RAM 우선) ──
def step2_performance(classify: dict) -> dict:
    if classify["type"] == "game":
        return {"priority_part": "GPU"}
    return {"priority_part": "CPU"}


# ── Step 3: 예산 배분 ───────────────────────────────
def step3_budget(purpose: str, priority: str, budget: int) -> dict:
    key = (purpose, priority)
    alloc = _BUDGET_ALLOC.get(key, _BUDGET_ALLOC[("game", "balance")])
    return {cat: int(budget * pct) for cat, pct in alloc.items()}


# ── Step 4: 부품 매칭 ───────────────────────────────
def _pick_part(category: str, max_price: int) -> dict | None:
    """예산 내 가장 높은 tier 부품 선택. 없으면 가장 저렴한 것."""
    candidates = [p for p in _PARTS if p["category"] == category and p["stock"]]
    affordable = [p for p in candidates if p["price"] <= max_price]
    if affordable:
        return max(affordable, key=lambda p: (p["tier"], p["price"]))
    if candidates:
        return min(candidates, key=lambda p: p["price"])
    return None


def step4_match(purpose: str, priority: str, budget: int) -> dict:
    alloc = step3_budget(purpose, priority, budget)
    parts = []

    gpu = _pick_part("GPU", alloc["GPU"]) if purpose == "game" else _pick_part("GPU", int(budget * 0.15))
    cpu = _pick_part("CPU", alloc["CPU"])
    ram = _pick_part("RAM", alloc["RAM"])
    ssd = _pick_part("SSD", alloc["SSD"])
    # 기타 예산으로 파워·메인보드·케이스
    etc_budget = alloc["ETC"] + alloc.get("GPU", 0) * 0  # 단순화
    mb = _pick_part("MB", budget)
    case = _pick_part("CASE", budget)

    # 파워: GPU TDP 기반 최소 용량 산정
    gpu_tdp = gpu["tdp"] if gpu else 0
    need_watt = int((gpu_tdp + 150) * 1.4)  # 여유율
    psu = _pick_psu(need_watt)

    for p in [gpu, cpu, ram, ssd, mb, psu, case]:
        if p:
            parts.append(p)

    total = sum(p["price"] for p in parts)
    fallback = total > budget * 1.1  # 예산 10% 초과 시 fallback 플래그

    return {"parts": parts, "total_price": total, "gpu": gpu, "fallback": fallback}


def _pick_psu(need_watt: int) -> dict | None:
    psus = [p for p in _PARTS if p["category"] == "PSU" and p["stock"]]
    ok = [p for p in psus if p.get("watt", 0) >= need_watt]
    if ok:
        return min(ok, key=lambda p: p["watt"])
    return max(psus, key=lambda p: p.get("watt", 0)) if psus else None


# ── 호환성 룰셋 (PRD 12절 R-01~R-05 일부) ──────────────
def check_warnings(parts: list[dict], purpose: str) -> str | None:
    gpu = next((p for p in parts if p["category"] == "GPU"), None)
    cpu = next((p for p in parts if p["category"] == "CPU"), None)
    psu = next((p for p in parts if p["category"] == "PSU"), None)
    ssd = next((p for p in parts if p["category"] == "SSD"), None)

    # R-01: GPU tier - CPU tier >= 2
    if gpu and cpu and gpu["tier"] - cpu["tier"] >= 2:
        return "그래픽카드 성능을 CPU가 따라가지 못할 수 있어요. CPU를 한 단계 올리면 더 안정적이에요."
    # R-02: 시스템 TDP x 1.25 > PSU watt
    if psu:
        sys_tdp = sum(p.get("tdp", 0) for p in parts)
        if sys_tdp * 1.25 > psu.get("watt", 9999):
            return "소비전력이 파워보다 많아요. 파워 용량을 올리면 안정적으로 쓸 수 있어요."
    # R-05: 게임 목적 + SSD 500GB 이하
    if purpose == "game" and ssd and "500GB" in ssd["name"]:
        return "인기 게임 3~4개 깔면 저장공간이 꽉 찰 수 있어요. 1TB를 권장해요."
    return None


# ── Step 5: 출력 생성 (LLM 없이 템플릿 기반) ────────────
def step5_generate(match: dict, purpose: str, games: list[str], rec_type: str) -> dict:
    parts = match["parts"]
    gpu = match["gpu"]
    warning = check_warnings(parts, purpose)

    # 게임 목적이면 FPS 헤드라인 생성
    if purpose == "game" and gpu and games:
        primary_game = games[0]
        headline = make_headline(gpu["name"], primary_game)
        fps_info = lookup_fps(gpu["name"], primary_game)
        detail = ""
        if len(games) > 1:
            second = make_headline(gpu["name"], games[1])
            detail = second
    else:
        headline = "작업용 구성 완료 — 포토샵·영상 편집에 버벅임 없어요"
        detail = "여러 프로그램을 동시에 열어도 여유로워요"

    reason = _make_reason(purpose, gpu, rec_type)

    return {
        "type": rec_type,
        "type_label": _TYPE_LABEL[rec_type],
        "total_price": match["total_price"],
        "parts": [
            {"category": p["category"], "name": p["name"], "price": p["price"], "product_id": p["product_id"]}
            for p in parts
        ],
        "performance": {"headline": headline, "detail": detail},
        "report": {"reason": reason, "warning": warning},
    }


def _make_reason(purpose: str, gpu: dict, rec_type: str) -> str:
    if purpose == "game" and gpu:
        base = f"{gpu['description']}"
        if rec_type == "value":
            return f"{base} 예산 대비 가장 효율적인 조합이에요."
        elif rec_type == "perf":
            return f"{base} 예산 한도 내 최고 성능을 뽑았어요."
        return f"{base} 성능과 가격의 균형이 좋은 조합이에요."
    return "작업 프로그램에 맞춰 CPU와 메모리에 예산을 집중했어요."


# ── 메인 파이프라인 ─────────────────────────────────
def recommend(user_input: dict) -> dict:
    purpose = user_input["purpose"]
    games = user_input.get("games", [])
    programs = user_input.get("programs", [])
    budget = user_input["budget"]

    classify = step1_classify(purpose, games, programs)
    step2_performance(classify)

    recommendations = []
    any_fallback = False
    for rec_type in _TYPES:
        match = step4_match(purpose, rec_type, budget)
        any_fallback = any_fallback or match["fallback"]
        rec = step5_generate(match, purpose, games, rec_type)
        recommendations.append(rec)

    return {
        "session_id": user_input.get("session_id", "test-session"),
        "recommendations": recommendations,
        "fallback_used": any_fallback,
    }


if __name__ == "__main__":
    # 지훈 시나리오 테스트
    sample = {
        "session_id": "uuid-test-001",
        "purpose": "game",
        "games": ["valorant", "battleground"],
        "programs": [],
        "budget": 1500000,
        "priority": "balance",
    }
    result = recommend(sample)
    print(json.dumps(result, ensure_ascii=False, indent=2))
