"""
main.py — 컴퓨존 AI PC Build Assistant FastAPI 서버
PRD 14절 MVP 엔드포인트:
  POST /api/recommend  ← 사용자 입력 → 견적 3종 + 리포트
  GET  /api/health     ← 서버 상태 확인

실행: uvicorn main:app --reload
문서: http://localhost:8000/docs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pipeline import recommend

app = FastAPI(title="컴퓨존 AI PC Build Assistant", version="1.0")

# CORS (프론트엔드 연결용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 입력 스키마 (PRD 10절) ──────────────────────────
class RecommendRequest(BaseModel):
    session_id: str = Field(default="anonymous", description="세션 ID (익명)")
    purpose: str = Field(description="game 또는 design")
    games: list[str] = Field(default_factory=list, description="게임명 리스트")
    programs: list[str] = Field(default_factory=list, description="프로그램명 리스트")
    budget: int = Field(description="예산 (원)")
    priority: str = Field(default="balance", description="value / balance / perf")

    model_config = {
        "json_schema_extra": {
            "example": {
                "session_id": "uuid-test-001",
                "purpose": "game",
                "games": ["valorant", "battleground"],
                "programs": [],
                "budget": 1500000,
                "priority": "balance",
            }
        }
    }


# ── 엔드포인트 ──────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "compuzone-ai-pc-builder", "version": "1.0"}


@app.post("/api/recommend")
def api_recommend(req: RecommendRequest):
    result = recommend(req.model_dump())
    # 면책 문구 (PRD 11절)
    result["disclaimer"] = "AI 추천은 참고용입니다. 실제 가격·재고는 변동될 수 있으며, 최종 구매 전 확인을 권장합니다."
    return result


@app.get("/")
def root():
    return {"message": "컴퓨존 AI PC Build Assistant API. 문서는 /docs 참조."}
