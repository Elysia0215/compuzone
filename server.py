# server.py
# A lightweight FastAPI-based backend server replacing server.py (Flask)

import os
import json
from typing import Any, Optional
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from google import genai
from google.genai import types
from catalog import PRODUCT_CATALOG

# Load environment variables from .env.local first, then .env (supporting parent directory)
load_dotenv('.env.local')
load_dotenv('.env')
load_dotenv('../.env')

app = FastAPI(title="Compuzone AI PC Build Assistant API")

# Enable CORS for frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PORT = 8000  # Development API port

# ----------------------------------------------------
# Gemini AI Client Helper
# ----------------------------------------------------
_ai_client = None

def get_gemini_client():
    global _ai_client
    if _ai_client is None:
        if os.environ.get("GEMINI_API_KEY"):
            try:
                # The genai.Client automatically loads GEMINI_API_KEY from environment variables
                _ai_client = genai.Client()
                print("Gemini API Client successfully initialized.")
            except Exception as e:
                print(f"Failed to initialize Gemini API Client: {e}")
    return _ai_client

# ----------------------------------------------------
# Pydantic Schemas for API Requests & Structured JSON Outputs
# ----------------------------------------------------
class ClassifyRequest(BaseModel):
    message: str

class ClassifyResponse(BaseModel):
    intent: str = Field(description="The classified user intent name: 'menu', 'recommend', 'product', 'category', 'counselor', 'as', or 'general'")

class GeneralChatMsg(BaseModel):
    role: str
    text: str

class GeneralChatRequest(BaseModel):
    messages: list[GeneralChatMsg]

class PCSpecs(BaseModel):
    cpu: str
    gpu: str
    ram: str
    ssd: str
    power: str
    mb: str

class RevisedEstimate(BaseModel):
    title: str = Field(description="A short, engaging title for this revised build")
    price: int = Field(description="Total calculated price of the parts in Korean Won (MUST be an integer)")
    specs: PCSpecs
    reason: str = Field(description="Friendly explanation in Korean (polite ~해요 style) of what changes were made and why this perfectly fits their feedback.")

class RecommendFeedbackRequest(BaseModel):
    userFeedback: str
    currentSpecs: dict[str, str]
    budget: int = 1500000
    usage: str = ""

class ProductQueryRequest(BaseModel):
    productName: str

class CategoryQueryRequest(BaseModel):
    categoryName: str

class RecommendRequest(BaseModel):
    session_id: str
    purpose: str  # "game" or "design"
    games: list[str] = []
    programs: list[str] = []
    budget: int
    priority: str  # "가성비", "균형", "성능"

# ----------------------------------------------------
# Gunho's Data Integration & FPS Normalization Helper
# ----------------------------------------------------
def normalize_gpu_for_fps(gpu_name: str) -> str:
    g_upper = gpu_name.upper()
    if "4080 SUPER" in g_upper or "4080S" in g_upper:
        return "RTX 4080 Super"
    if "4070 SUPER" in g_upper or "4070S" in g_upper:
        return "RTX 4070 Super"
    if "4070" in g_upper:
        return "RTX 4070"
    if "4060 TI" in g_upper or "4060TI" in g_upper:
        return "RTX 4060 Ti"
    if "4060" in g_upper:
        return "RTX 4060"
    if "5060" in g_upper:
        return "RTX 4060 Ti"
    return "RTX 4060"

def normalize_game_for_fps(game_name: str) -> str:
    g_lower = game_name.lower()
    if "valorant" in g_lower or "발로" in g_lower:
        return "valorant"
    if "battle" in g_lower or "배그" in g_lower or "배틀" in g_lower or "pubg" in g_lower:
        return "battleground"
    if "lol" in g_lower or "리그" in g_lower or "레전드" in g_lower:
        return "lol"
    if "overwatch" in g_lower or "오버워치" in g_lower:
        return "overwatch2"
    if "cyber" in g_lower or "사이버" in g_lower or "사펑" in g_lower:
        return "cyberpunk2077"
    return g_lower

# Load parts_db.json data
parts_list = []
try:
    parts_db_path = os.path.join(os.path.dirname(__file__), "parts_db.json")
    if os.path.exists(parts_db_path):
        with open(parts_db_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict) and "parts" in data:
                parts_list = data["parts"]
            else:
                parts_list = data
        print(f"Successfully loaded {len(parts_list)} parts from parts_db.json.")
    else:
        print("Warning: parts_db.json file not found.")
except Exception as e:
    print(f"Error loading parts_db.json: {e}")

# ----------------------------------------------------
# AI PC Recommendation Core Matching Engine
# ----------------------------------------------------
def build_configuration(purpose: str, items: list[str], budget_val: int, build_type: str) -> dict:
    """
    Builds a customized PC specification from parts_db.json based on:
    - purpose: 'game' or 'design'
    - items: list of games/programs selected
    - budget_val: target budget
    - build_type: 'cheap', 'balance', 'perf'
    """
    # 1. Determine target budget for the package
    if build_type == "cheap":
        target_budget = max(800000, int(budget_val * 0.70))
    elif build_type == "balance":
        target_budget = max(850000, int(budget_val * 0.85))
    else:
        target_budget = max(900000, int(budget_val * 0.98))

    # 2. Percentage allocations (CPU, GPU, RAM, SSD, MB, Power, Cooler)
    if purpose == "game":
        if build_type == "cheap":
            pct = {"GPU": 0.38, "CPU": 0.18, "RAM": 0.15, "SSD": 0.15, "MB": 0.08, "Power": 0.04, "Cooler": 0.02}
        elif build_type == "balance":
            pct = {"GPU": 0.40, "CPU": 0.20, "RAM": 0.15, "SSD": 0.15, "MB": 0.05, "Power": 0.03, "Cooler": 0.02}
        else:
            pct = {"GPU": 0.45, "CPU": 0.25, "RAM": 0.15, "SSD": 0.10, "MB": 0.03, "Power": 0.01, "Cooler": 0.01}
    else:  # design
        if build_type == "cheap":
            pct = {"GPU": 0.10, "CPU": 0.28, "RAM": 0.25, "SSD": 0.22, "MB": 0.08, "Power": 0.04, "Cooler": 0.03}
        elif build_type == "balance":
            pct = {"GPU": 0.15, "CPU": 0.30, "RAM": 0.25, "SSD": 0.20, "MB": 0.05, "Power": 0.03, "Cooler": 0.02}
        else:
            pct = {"GPU": 0.15, "CPU": 0.35, "RAM": 0.25, "SSD": 0.20, "MB": 0.03, "Power": 0.01, "Cooler": 0.01}

    # 3. Minimum Tier calculation based on select targets
    min_cpu_tier = 1
    min_gpu_tier = 1

    for game in items:
        g_lower = game.lower()
        if any(x in g_lower for x in ["pubg", "battleground", "배그", "lostark", "로스트아크"]):
            min_cpu_tier = max(min_cpu_tier, 3)
            min_gpu_tier = max(min_gpu_tier, 3)
        elif any(x in g_lower for x in ["steam", "스팀", "aaa", "고사양"]):
            min_cpu_tier = max(min_cpu_tier, 4)
            min_gpu_tier = max(min_gpu_tier, 4)
        elif any(x in g_lower for x in ["lol", "롤", "valorant", "발로란트", "overwatch", "오버워치"]):
            min_cpu_tier = max(min_cpu_tier, 2)
            min_gpu_tier = max(min_gpu_tier, 2)

    for prog in items:
        p_lower = prog.lower()
        if any(x in p_lower for x in ["premiere", "프리미어", "blender", "블렌더", "3d", "영상"]):
            min_cpu_tier = max(min_cpu_tier, 4)
            min_gpu_tier = max(min_gpu_tier, 3)
        elif any(x in p_lower for x in ["photoshop", "포토샵", "illustrator", "일러스트", "figma", "피그마", "이미지"]):
            min_cpu_tier = max(min_cpu_tier, 3)
            min_gpu_tier = max(min_gpu_tier, 2)

    # Helper function to find best matching item
    def find_item(category: str, budget_cap: int, min_tier: int = 1, socket_req: str = None, ram_gen_req: str = None, capacity_req: int = None, generation_req: str = None, wattage_req: int = None, cooler_tier_req: int = None) -> dict:
        candidates = [p for p in parts_list if p["category"] == category]
        
        # Apply filters
        if socket_req:
            candidates = [p for p in candidates if p.get("socket") == socket_req]
        if ram_gen_req:
            candidates = [p for p in candidates if p.get("ram_gen") == ram_gen_req]
        if generation_req:
            candidates = [p for p in candidates if p.get("generation") == generation_req]
        if capacity_req:
            candidates = [p for p in candidates if p.get("capacity") == capacity_req]
        if wattage_req:
            candidates = [p for p in candidates if p.get("wattage", 0) >= wattage_req]
        if cooler_tier_req:
            candidates = [p for p in candidates if p.get("tier", 0) >= cooler_tier_req]
            
        # Filter by tier if applicable
        if category in ["CPU", "GPU"]:
            candidates = [p for p in candidates if p.get("tier", 0) >= min_tier]

        # Loosen filters if candidates empty
        if not candidates:
            candidates = [p for p in parts_list if p["category"] == category]
            if socket_req and category in ["Motherboard", "Cooler"]:
                candidates = [p for p in candidates if p.get("socket") == socket_req]

        # Filter by price cap
        budget_candidates = [p for p in candidates if p["price"] <= budget_cap]
        if budget_candidates:
            # We have candidate within cap. Sort by tier descending, price ascending.
            budget_candidates.sort(key=lambda x: (-x.get("tier", 0), x["price"]))
            return budget_candidates[0]
        else:
            # No candidate fits price cap. Sort by price ascending (cheapest available) to save budget.
            candidates.sort(key=lambda x: x["price"])
            return candidates[0]

    # --- Match CPU & GPU first ---
    cpu_cap = int(target_budget * pct["CPU"])
    selected_cpu = find_item("CPU", cpu_cap, min_cpu_tier)

    gpu_cap = int(target_budget * pct["GPU"])
    selected_gpu = find_item("GPU", gpu_cap, min_gpu_tier)

    # --- Map MB and RAM based on socket ---
    socket = selected_cpu.get("socket", "LGA1700")
    if socket == "AM5":
        ram_gen = "DDR5"
    elif socket == "AM4":
        ram_gen = "DDR4"
    else:  # LGA1700
        ram_gen = "DDR4" if build_type == "cheap" else "DDR5"

    mb_cap = int(target_budget * pct["MB"])
    selected_mb = find_item("Motherboard", mb_cap, socket_req=socket, ram_gen_req=ram_gen)

    # --- RAM Allocation (Dual Channel) ---
    ram_cap = int(target_budget * pct["RAM"])
    ram_capacity = 8 if build_type == "cheap" else 16
    selected_ram = find_item("RAM", int(ram_cap / 2), generation_req=ram_gen, capacity_req=ram_capacity)
    ram_count = 2

    # --- SSD Allocation ---
    ssd_cap = int(target_budget * pct["SSD"])
    ssd_capacity = 500 if build_type == "cheap" else 1000
    selected_ssd = find_item("SSD", ssd_cap, capacity_req=ssd_capacity)

    # --- Power Supply Allocation ---
    wattage_needed = int((selected_cpu.get("tdp", 65) + selected_gpu.get("tdp", 150)) * 1.25 + 50)
    power_cap = int(target_budget * pct["Power"])
    selected_power = find_item("Power", power_cap, wattage_req=wattage_needed)

    # --- CPU Cooler Allocation ---
    cooler_tier = 4 if selected_cpu.get("tdp", 65) > 100 else 2
    cooler_cap = int(target_budget * pct["Cooler"])
    selected_cooler = find_item("Cooler", cooler_cap, cooler_tier_req=cooler_tier)

    # Assemble specs
    parts_picked = [
        {"category": "CPU", "name": selected_cpu["name"], "price": selected_cpu["price"], "product_id": selected_cpu["product_id"]},
        {"category": "GPU", "name": selected_gpu["name"], "price": selected_gpu["price"], "product_id": selected_gpu["product_id"]},
        {"category": "MB", "name": selected_mb["name"], "price": selected_mb["price"], "product_id": selected_mb["product_id"]},
        {"category": "RAM", "name": f"{selected_ram['name']} x{ram_count}", "price": selected_ram["price"] * ram_count, "product_id": selected_ram["product_id"]},
        {"category": "SSD", "name": selected_ssd["name"], "price": selected_ssd["price"], "product_id": selected_ssd["product_id"]},
        {"category": "Power", "name": selected_power["name"], "price": selected_power["price"], "product_id": selected_power["product_id"]},
        {"category": "Cooler", "name": selected_cooler["name"], "price": selected_cooler["price"], "product_id": selected_cooler["product_id"]}
    ]

    total_price = sum(item["price"] for item in parts_picked)

    # Compatibility Rule Checking (R-01 to R-05)
    warnings = []
    # R-01: GPU vs CPU bottleneck
    if abs(selected_gpu.get("tier", 0) - selected_cpu.get("tier", 0)) >= 2:
        warnings.append(
            "원인: 그래픽카드 등급에 비해 CPU 계산 속도 등급 차이가 크게 발생합니다.\n"
            "영향: 부품 간 성능 불균형으로 그래픽카드의 잠재 성능을 100% 발휘하지 못할 가능성이 있습니다.\n"
            "해결책: CPU 등급을 올리거나, 그래픽카드를 한 단계 낮춰 금액적 밸런스를 조절해 주세요."
        )
    # R-02: PSU Wattage check
    if (selected_cpu.get("tdp", 65) + selected_gpu.get("tdp", 150) + 50) * 1.25 > selected_power.get("wattage", 500):
        warnings.append(
            "원인: 시스템의 합산 최대 소비전력이 선택한 파워 서플라이의 정격 출력보다 높습니다.\n"
            "영향: 고화질 게임이나 그래픽 렌더링 시 전력 부족으로 시스템이 갑자기 강제 셧다운될 수 있습니다.\n"
            "해결책: 파워 서플라이 정격 용량을 100W~200W 이상 높은 사양으로 변경해 안정성을 확보하십시오."
        )
    # R-03: DDR mismatch
    if selected_mb.get("ram_gen") != selected_ram.get("generation"):
        warnings.append(
            "원인: 마더보드가 장착할 수 있는 램 슬롯 유형과 장착 예정인 램 규격이 맞지 않습니다.\n"
            "영향: 메모리가 메인보드 홈에 들어가지 않아 물리적으로 꽂히지 않습니다.\n"
            "해결책: 메인보드 소켓과 호환되는 규격(DDR4 또는 DDR5)의 메모리로 종류를 맞춰주십시오."
        )
    # R-04: CPU Cooler check
    if selected_cpu.get("tdp", 65) > 100 and selected_cooler.get("tier", 0) < 4:
        warnings.append(
            "원인: CPU의 대량 발열량 대비 장착한 공랭 쿨러의 쿨링 흡수력이 낮습니다.\n"
            "영향: CPU 열이 축적되어 시스템 속도가 급감하는 스로틀링(Throttle) 혹은 하드웨어 오작동의 원인이 됩니다.\n"
            "해결책: 대장급 듀얼 타워 공랭 쿨러나 3열 수랭(AIO) 쿨러로 쿨러 사양을 강화해 주십시오."
        )
    # R-05: Game + SSD size <= 500
    if purpose == "game" and selected_ssd.get("capacity", 1000) <= 500:
        warnings.append(
            "원인: 최근 출시되는 게임 1개당 요구 저장 용량이 100GB~150GB 이상으로 비대합니다.\n"
            "영향: 500GB SSD는 윈도우 OS 설치 후 게임 3~4개만 깔아도 잔여 저장 용량이 부족할 수 있습니다.\n"
            "해결책: 가급적 저장 용량을 1TB 이상인 대용량 NVMe SSD 상품으로 등급업을 고려해 주십시오."
        )

    warning_text = "\n\n".join(warnings) if warnings else None

    return {
        "type": build_type,
        "total_price": total_price,
        "parts": parts_picked,
        "warning": warning_text,
        "cpu_name": selected_cpu["name"],
        "gpu_name": selected_gpu["name"]
    }


# ==========================================
# 1. INTENT ROUTER ENDPOINT
# ==========================================
@app.post('/api/chat/classify')
async def classify(request: ClassifyRequest):
    message = request.message
    ai = get_gemini_client()
    
    if not ai:
        msg = message.lower()
        intent = "general"
        if any(x in msg for x in ["어디", "위치", "메뉴", "바로가기", "견적 어디서"]):
            intent = "menu"
        elif any(x in msg for x in ["추천", "견적", "조립", "맞춤 pc", "컴퓨터 맞추"]):
            intent = "recommend"
        elif any(x in msg for x in ["5060", "4070", "4060", "rtx", "ryzen", "라이젠", "i5", "i7", "인텔", "삼성 램", "990pro"]):
            intent = "product"
        elif any(x in msg for x in ["cpu", "gpu", "메인보드", "메모리", "파워", "ssd", "품목", "부품이 뭐"]):
            intent = "category"
        elif any(x in msg for x in ["상담", "사람", "직원", "상담사", "고객센터", "전화"]):
            intent = "counselor"
        elif any(x in msg for x in ["as", "a/s", "보증", "고장", "수리", "as 언제까지"]):
            intent = "as"
        return {"intent": intent, "source": "fallback_rules"}

    try:
        system_prompt = """
        You are an expert intent classifier for Compuzone (컴퓨존), a leading Korean PC & electronics shop chatbot named "Komi".
        Classify the user's message into EXACTLY one of these intents:
        - "menu": The user is searching for a menu, links, or asking "어디서 견적 짜나요?", "빠른 견적 어디에 있어요?".
        - "recommend": The user wants a product recommendation, computer custom build estimation, or mentions buying a complete set ("컴퓨터 하나 맞춰줘", "게임용 컴퓨터 추천", "견적 추천").
        - "product": The user is asking about a specific hardware product model (e.g., "RTX 5060 어때요?", "Ryzen 7500F 성능 괜찮나요?", "삼성 DDR5 램 질문이요").
        - "category": The user is asking general questions about a PC hardware category/item type (e.g., "CPU가 뭐예요?", "메인보드가 왜 필요한가요?").
        - "counselor": The user wants to talk to a human counselor or customer service (e.g., "사람이랑 얘기할래요", "상담원 연결해줘").
        - "as": The user is asking about warranty, repair, or A/S status (e.g., "내 PC A/S 언제까지예요?", "주문한 컴퓨터 고장난 것 같아요").
        - "general": Basic greetings, small talk, or general queries that don't fit above.
        """

        response = ai.models.generate_content(
            model='gemini-3.5-flash',
            contents=message,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_schema=ClassifyResponse
            )
        )
        parsed = response.parsed
        intent = parsed.intent if parsed and parsed.intent else "general"
        return {"intent": intent, "source": "gemini"}
    except Exception as e:
        print(f"Gemini Intent Router Error: {e}")
        return {"intent": "general", "source": "error_fallback"}

# ==========================================
# 2. GENERAL CHAT (KOMI PERSONA) ENDPOINT
# ==========================================
@app.post('/api/chat/general')
async def general_chat(request: GeneralChatRequest):
    messages = request.messages
    ai = get_gemini_client()
    
    if not ai:
        last_msg = messages[-1].text if messages else ""
        reply = "안녕하세요! 컴퓨존의 귀여운 챗봇 코미예요! 🤖 현재 기본 모드로 동작 중입니다. 궁금한 점이 있으시다면 언제든 말씀해주세요!"
        if "안녕" in last_msg:
            reply = "반가워요! 저는 컴퓨존의 마스코트 챗봇 코미입니다! 오늘도 행복한 하루 되세요. 💻 어떤 컴퓨터 부품이나 견적이 필요하신가요?"
        elif "고마워" in last_msg or "감사" in last_msg:
            reply = "천만에요! 코미가 힘이 되었다니 기뻐요. 다른 컴퓨터 상담도 필요하시면 언제든 불러주세요! 🌟"
        return {"text": reply, "source": "fallback"}

    try:
        chat_history = []
        for msg in messages:
            role = "user" if msg.role == "user" else "model"
            chat_history.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg.text)]
                )
            )

        system_instruction = """
        You are "코미" (Komi), the friendly and cute robotic mascot chatbot of Compuzone (컴퓨존), South Korea's number 1 computer store.
        - Keep your tone bright, cheerful, polite, and helpful (using polite Korean terms: "~해요", "~입니다!", "~지요").
        - You love computer hardware and understand everything about gaming, video editing, programming, AI, and office PCs.
        - Answer concisely (usually under 3-4 sentences) unless the user asks for a detailed explanation.
        - Do not break character. Use cute robotic gestures if appropriate like "🤖" or "반가워요!".
        - If users ask about complex configurations, direct them naturally to the dynamic PC recommendation flow (상품추천) or counselor connection (상담원 연결).
        """

        response = ai.models.generate_content(
            model='gemini-3.5-flash',
            contents=chat_history,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction
            )
        )
        return {"text": response.text, "source": "gemini"}
    except Exception as e:
        print(f"Gemini General Chat Error: {e}")
        return {
            "text": "죄송해요, 코미 회로에 잠깐 문제가 생긴 것 같아요! 잠시 후 다시 말씀해주실 수 있을까요? 🥺",
            "source": "error"
        }

# ==========================================
# 3. PC RECOMMENDATION RE-RECOMMEND LOOP
# ==========================================
@app.post('/api/chat/recommend_feedback')
async def recommend_feedback(request: RecommendFeedbackRequest):
    user_feedback = request.userFeedback
    current_specs = request.currentSpecs
    budget = request.budget
    usage = request.usage

    fallback_revision = {
        "title": "피드백 반영 실속 견적",
        "price": max(1000000, min(2500000, budget - 150000)),
        "specs": {
            "cpu": "AMD Ryzen 5 7500F",
            "gpu": "MSI GeForce RTX 5060 (8GB)",
            "ram": "Samsung DDR5 16GB",
            "ssd": "Micron Crucial 500GB",
            "power": "FSP HYPER K PRO 500W",
            "mb": "MSI PRO H610M-E DDR4"
        },
        "reason": f"사용자님의 피드백 \"{user_feedback}\"을 반영하여 전력 효율이 우수한 RTX 5060 그래픽카드로 교체하고 메인보드를 효율적인 등급으로 조정하여 더 정교하게 다듬은 견적입니다!"
    }

    ai = get_gemini_client()
    if not ai:
        return {"revised": fallback_revision, "source": "fallback"}

    try:
        system_instruction = f"""
        You are "코미", the expert PC custom builder. The user wants to adjust their current PC build.
        Here is the Compuzone product catalog with real specs and prices:
        {json.dumps(PRODUCT_CATALOG, ensure_ascii=False, indent=2)}

        Analyze the user's feedback: "{user_feedback}"
        Current specs: {json.dumps(current_specs, ensure_ascii=False)}
        User purpose/usage: {usage}
        User budget limit: {budget} KRW (won)

        Adjust the parts appropriately.
        - If they ask for "더 저렴하게" (cheaper), downgrade GPU, CPU or SSD safely while preserving their primary usage.
        - If they ask for "더 높은 성능" (higher performance), upgrade CPU or GPU up to the limit of their budget.
        - If they ask for specific features (e.g. quiet, gaming performance, more RAM), make appropriate choices.
        
        You must return a revised JSON object matching this structure EXACTLY:
        {{
          "title": "A short, engaging title for this revised build (e.g., '가성비 소음 억제 세트')",
          "price": number (Total calculated price of the parts in Korean Won, MUST be a number),
          "specs": {{
            "cpu": "CPU model name",
            "gpu": "GPU model name",
            "ram": "RAM model name & capacity",
            "ssd": "SSD model name & capacity",
            "power": "Power supply model & wattage",
            "mb": "Motherboard model"
          }},
          "reason": "Friendly explanation (in Korean, polite ~해요 style) of what changes were made and why this perfectly fits their feedback."
        }}
        """

        prompt = f"사용자 피드백: {user_feedback}\n기존 견적: {json.dumps(current_specs, ensure_ascii=False)}"
        response = ai.models.generate_content(
            model='gemini-3.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=RevisedEstimate
            )
        )
        
        parsed = response.parsed
        revised = {
            "title": parsed.title,
            "price": parsed.price,
            "specs": {
                "cpu": parsed.specs.cpu,
                "gpu": parsed.specs.gpu,
                "ram": parsed.specs.ram,
                "ssd": parsed.specs.ssd,
                "power": parsed.specs.power,
                "mb": parsed.specs.mb
            },
            "reason": parsed.reason
        }
        return {"revised": revised, "source": "gemini"}
    except Exception as e:
        print(f"Gemini Re-recommend Feedback Error: {e}")
        return {"revised": fallback_revision, "source": "error"}

# ==========================================
# 4. SPECIFIC PRODUCT QUESTION ENDPOINT
# ==========================================
@app.post('/api/chat/query_product')
async def query_product(request: ProductQueryRequest):
    product_name = request.productName
    matched_product = None
    name_lower = product_name.lower()
    for p in PRODUCT_CATALOG:
        prod_name_lower = p["name"].lower()
        prod_id_part = p["id"].split("-")[-1].lower()
        if name_lower in prod_name_lower or prod_id_part in name_lower or name_lower in prod_id_part:
            matched_product = p
            break

    ai = get_gemini_client()
    if not ai:
        if matched_product:
            ai_explanation = f"해당 상품은 {matched_product['description']} 장단점으로는 {', '.join(matched_product['pros'])} 등이 있습니다."
            return {
                "product": matched_product,
                "aiExplanation": ai_explanation,
                "source": "catalog_fallback"
            }
        return JSONResponse({"error": "상품을 찾을 수 없습니다.", "source": "fallback"}, status_code=404)

    try:
        system_prompt = f"""
        You are "코미", the hardware advisor at Compuzone.
        The user is asking about: "{product_name}"
        Here is our official product catalog data for matching if possible:
        {json.dumps(PRODUCT_CATALOG, ensure_ascii=False, indent=2)}

        Explain the role of this hardware component inside a PC, what gaming performance can be expected (e.g. "롤, 발로란트에는 충분하지만 4K 영상 편집에는 아쉽습니다"), and provide a concise summary.
        - Answer in polite, friendly Korean. Keep it cute and cute robotic 🤖.
        - Keep it structured under 4 sentences.
        """

        response = ai.models.generate_content(
            model='gemini-3.5-flash',
            contents=product_name,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt
            )
        )

        res_product = matched_product or {
            "id": "custom",
            "name": product_name,
            "category": "기타 부품",
            "price": 0,
            "specs": {},
            "description": "사용자가 입력한 커스텀 제품 사양 질문입니다.",
            "pros": ["기능성 우수"],
            "cons": ["가격대 변동 가능"],
            "recommendedUsers": ["해당 스펙이 꼭 필요한 실속 지향 유저"],
            "stockStatus": "in_stock"
        }

        return {
            "product": res_product,
            "aiExplanation": response.text,
            "source": "gemini"
        }
    except Exception as e:
        print(f"Gemini Query Product Error: {e}")
        res_product = matched_product or {"name": product_name, "price": 0, "specs": {}}
        return {
            "product": res_product,
            "aiExplanation": "이 제품은 뛰어난 컴퓨터 속도와 퍼포먼스를 내는 고품질 하드웨어 부품 중 하나예요! 상세한 문의는 코미 고객센터를 이용해주시면 친절히 가이드 해드릴게요. 🤖",
            "source": "error"
        }

# ==========================================
# 5. CATEGORY QUESTIONS ENDPOINT
# ==========================================
@app.post('/api/chat/query_category')
async def query_category(request: CategoryQueryRequest):
    category_name = request.categoryName
    ai = get_gemini_client()
    
    if not ai:
        explanation = "컴퓨터를 조립하기 위해 꼭 필요한 핵심 부품 부류 중 하나예요!"
        cat_lower = category_name.lower()
        if "cpu" in cat_lower:
            explanation = "CPU는 컴퓨터의 '두뇌' 역할을 해요! 모든 명령어 계산을 처리하고 전반적인 연산 속도를 결정하는 핵심 부품이랍니다. 🧠"
        elif "gpu" in cat_lower or "그래픽" in cat_lower:
            explanation = "그래픽카드(GPU)는 게임 화면이나 고화질 영상을 모니터에 예쁘고 부드럽게 '그려주는' 역할을 담당해요! 🎮"
        elif "메인보드" in cat_lower or "mb" in cat_lower:
            explanation = "메인보드는 모든 부품(CPU, 램, 그래픽카드 등)들이 서로 연결되어 대화할 수 있게 도와주는 '도시의 도로망' 같은 부품이에요! 🗺️"
        elif "램" in cat_lower or "메모리" in cat_lower or "ram" in cat_lower:
            explanation = "메모리(RAM)는 컴퓨터가 현재 실행하고 있는 프로그램들이 작업 공간으로 쓰는 '책상 넓이'예요! 책상이 넓을수록 여러 일(멀티태스킹)을 동시에 잘한답니다. 📚"
        return {"explanation": explanation, "source": "fallback"}

    try:
        system_prompt = f"""
        You are "코미", the friendly PC hardware teacher for beginners.
        Explain the category: "{category_name}" (e.g., CPU, Graphics Card/GPU, Motherboard, RAM, SSD, Power Supply).
        Explain what it does using a very simple, beginner-friendly analogy (like "CPU is the brain", "RAM is the desk size", "Motherboard is the roads").
        - Use polite Korean and bright cute robot tones (🤖, 🧠, 🎮 etc).
        - Make it super easy to understand for absolute computer beginners!
        - Keep it under 3-4 sentences.
        """

        response = ai.models.generate_content(
            model='gemini-3.5-flash',
            contents=category_name,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt
            )
        )
        return {"explanation": response.text, "source": "gemini"}
    except Exception as e:
        print(f"Gemini Category Explanation Error: {e}")
        return {
            "explanation": "이 품목은 시스템 작동 시 데이터 신호를 유기적으로 가공하는 매우 핵심적인 파츠예요! 🤖",
            "source": "error"
        }

# ==========================================
# 6. DYNAMIC RECOMMENDATION PIPELINE (POST /api/recommend)
# ==========================================
class GeminiRecOutline(BaseModel):
    headline: str = Field(description="Catchy performance headline in Korean (polite style, no jargon) like '발로란트 FHD 약 220프레임 완벽 방어!'")
    reason: str = Field(description="Beginner-friendly explanation in Korean (polite style) detailing why this configuration and these components were chosen.")

@app.post('/api/recommend')
async def recommend(request: RecommendRequest):
    purpose = request.purpose
    games = request.games
    programs = request.programs
    budget = request.budget
    priority = request.priority  # 가성비, 균형, 성능

    items = games if purpose == "game" else programs

    # If the budget is below or equal to the minimum required for a build
    if budget <= 800000:
        # Return fallback popular TOP 3 build configurations as per Section 13
        cheap_setup = build_configuration(purpose, items, 800000, "cheap")
        balance_setup = build_configuration(purpose, items, 800000, "balance")
        perf_setup = build_configuration(purpose, items, 800000, "perf")
        
        for setup in [cheap_setup, balance_setup, perf_setup]:
            setup["warning"] = "예산이 최소 구성 금액(80만원) 이하이어서, 현재 예산 대에서 가장 대중적인 인기 견적을 매칭해 드렸습니다."
    else:
        # Run normal calculations for cheap, balance, and perf configurations
        cheap_setup = build_configuration(purpose, items, budget, "cheap")
        balance_setup = build_configuration(purpose, items, budget, "balance")
        perf_setup = build_configuration(purpose, items, budget, "perf")

    # Generate custom headlines and explanation reports using Gemini
    ai = get_gemini_client()
    
    recommendations_list = []
    types_mapping = [("cheap", cheap_setup, "알뜰 가성비 세팅"), ("balance", balance_setup, "황금 밸런스 균형 세팅"), ("perf", perf_setup, "익스트림 울트라 성능 세팅")]

    for b_type, setup, title_prefix in types_mapping:
        # Determine fallback/base headline and reason using Gunho's data lookup
        norm_gpu = normalize_gpu_for_fps(setup["gpu_name"])
        norm_game = normalize_game_for_fps(items[0]) if (purpose == "game" and items) else ""
        fps_info_str = ""
        
        if purpose == "game" and items:
            try:
                from fps_lookup import make_headline as fps_make_headline, lookup_fps
                headline = fps_make_headline(norm_gpu, norm_game)
                fps_info = lookup_fps(norm_gpu, norm_game)
                if fps_info and fps_info.get("avg_fps") is not None:
                    fps_info_str = f"Estimated FPS for {items[0]} with {setup['gpu_name']}: Avg {fps_info['avg_fps']} FPS (Min {fps_info['min_fps']} FPS)."
            except Exception as e:
                print(f"Error calling fps_make_headline: {e}")
                headline = f"{', '.join(items)} 환경 최적 구동형 세팅입니다."
        else:
            headline = f"{', '.join(items) if items else '기본 용도'} 환경 최적 구동형 세팅입니다."

        reason = f"{title_prefix}에 초점을 맞추어 CPU({setup['cpu_name']}) 및 그래픽카드({setup['gpu_name']})를 균형적으로 배치한 컴퓨존 추천 패키지입니다."
        
        if ai:
            try:
                system_instruction = f"""
                You are "코미", the friendly AI custom PC building expert at Computzone (컴퓨존).
                Create an analysis and performance overview for this matched PC configuration.
                Use beginner-friendly terms ONLY. Strictly avoid developer jargon (e.g. use "그래픽카드 계산 속도를 CPU가 못 따라가요" instead of "GPU-CPU 병목").
                
                Build information:
                - Purpose: {purpose}
                - Selected Software/Games: {', '.join(items)}
                - Selected Build Strategy: {title_prefix}
                - Selected CPU: {setup['cpu_name']}
                - Selected GPU: {setup['gpu_name']}
                - Benchmark FPS Info (refer to this exact data if possible): {fps_info_str}
                
                Generate a JSON object matching this structure:
                {{
                  "headline": "A short engaging performance headline (in Korean, polite style) like '발로란트 FHD 약 200프레임 부드러운 플레이 가능해요' or matching the benchmark info",
                  "reason": "A friendly Korean explanation (~해요 style) explaining why these parts fit this budget strategy and user needs."
                }}
                """
                
                prompt = f"CPU: {setup['cpu_name']}, GPU: {setup['gpu_name']}, Strategy: {title_prefix}"
                response = ai.models.generate_content(
                    model='gemini-3.5-flash',
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        response_mime_type="application/json",
                        response_schema=GeminiRecOutline
                    )
                )
                if response.parsed:
                    headline = response.parsed.headline
                    reason = response.parsed.reason
            except Exception as e:
                print(f"Gemini Recommend Report Gen Error for {b_type}: {e}")

        # Construct specs object in standard string structure for the frontend
        specs_out = {
            "cpu": setup["parts"][0]["name"],
            "gpu": setup["parts"][1]["name"],
            "mb": setup["parts"][2]["name"],
            "ram": setup["parts"][3]["name"],
            "ssd": setup["parts"][4]["name"],
            "power": setup["parts"][5]["name"],
            "cooler": setup["parts"][6]["name"]
        }

        # Build recommendation card
        recommendations_list.append({
            "id": f"est-{b_type}-{request.session_id[:8]}",
            "type": b_type,
            "title": f"⚡ {title_prefix} ({' + '.join(items) if items else '기본 용도'})",
            "price": setup["total_price"],
            "specs": specs_out,
            "parts_detail": setup["parts"],  # include raw parts detail for shopping cart integration
            "performance": {
                "headline": headline,
                "detail": f"{setup['gpu_name']}와 {setup['cpu_name']} 조합으로 구동됩니다."
            },
            "report": {
                "reason": reason,
                "warning": setup["warning"]
            }
        })

    return {
        "recommendations": recommendations_list,
        "fallback_used": budget <= 800000
    }

# ==========================================
# 7. HEALTH CHECK ENDPOINT
# ==========================================
@app.get('/api/health')
async def health_check():
    return {"status": "ok"}

# ==========================================
# STATIC FILES SERVING & SPA ROUTING MIDDLEWARE
# ==========================================
# Serve static build folder path: dist/
if os.path.exists('dist'):
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")

@app.get('/')
async def root_route():
    if os.path.exists("dist/index.html"):
        return FileResponse("dist/index.html")
    return {"error": "Vite frontend build folder 'dist' not found. Run 'npm run build' first."}

@app.get('/{path_name:path}')
async def catch_all(path_name: str):
    if path_name and os.path.exists(os.path.join("dist", path_name)) and os.path.isfile(os.path.join("dist", path_name)):
        return FileResponse(os.path.join("dist", path_name))
    if os.path.exists("dist/index.html"):
        return FileResponse("dist/index.html")
    return {"error": "Vite frontend build folder 'dist' not found. Run 'npm run build' first."}

if __name__ == '__main__':
    import uvicorn
    is_prod = os.environ.get("RAILWAY_ENVIRONMENT") is not None or os.environ.get("PORT") is not None
    target_port = int(os.environ.get("PORT", 8000))   # ← Railway PORT 우선
    
    print(f"Starting Compuzone FastAPI Backend on port {target_port}...")
    uvicorn.run("server:app", host='0.0.0.0', port=target_port, reload=False)   # ← reload 끔