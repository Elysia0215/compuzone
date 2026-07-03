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

# ----------------------------------------------------
# Aspects and Intent Caching Mechanism (ROI & Latency Optimization)
# ----------------------------------------------------
ASPECTS_CACHE_FILE = os.path.join(os.path.dirname(__file__), "product_aspects_cache.json")
_aspects_cache = {}
_intent_cache = {}

if os.path.exists(ASPECTS_CACHE_FILE):
    try:
        with open(ASPECTS_CACHE_FILE, "r", encoding="utf-8") as f:
            _aspects_cache = json.load(f)
        print(f"Successfully loaded {len(_aspects_cache)} cached product aspects from product_aspects_cache.json.")
    except Exception as e:
        print(f"Failed to load product aspects cache: {e}")

def save_aspects_cache():
    try:
        with open(ASPECTS_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(_aspects_cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Failed to save product aspects cache: {e}")


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

class FindMenuRequest(BaseModel):
    utterance: str

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
        
        # Post-process parts list to inject missing socket and ram_gen fields if they are missing
        for p in parts_list:
            name = p.get("name", "")
            cat = p.get("category", "")
            
            # Infer socket for CPUs
            if cat == "CPU" and "socket" not in p:
                if any(x in name for x in ["9600X", "9700X", "7800X3D", "9900X", "9950X", "7500F", "AM5"]):
                    p["socket"] = "AM5"
                elif any(x in name for x in ["5600", "AM4"]):
                    p["socket"] = "AM4"
                else:
                    p["socket"] = "LGA1700"  # default
                    
            # Infer socket for Motherboards
            if cat in ["MB", "Motherboard"] and "socket" not in p:
                if any(x in name for x in ["B650", "X670", "B850", "X870", "A620", "AM5"]):
                    p["socket"] = "AM5"
                elif any(x in name for x in ["A520", "B550", "AM4"]):
                    p["socket"] = "AM4"
                else:
                    p["socket"] = "LGA1700"
                    
            # Infer ram_gen for Motherboards
            if cat in ["MB", "Motherboard"] and "ram_gen" not in p:
                if any(x in name for x in ["B650", "X670", "B850", "X870", "A620"]):
                    p["ram_gen"] = "DDR5"
                elif "DDR4" in name:
                    p["ram_gen"] = "DDR4"
                else:
                    p["ram_gen"] = "DDR5"

            if cat in ["MB", "Motherboard"] and "ram_support" not in p:
                p["ram_support"] = p.get("ram_gen", "DDR5")
                    
            # Infer ddr_gen for RAM
            if cat == "RAM":
                if "ddr_gen" not in p:
                    if "DDR4" in name:
                        p["ddr_gen"] = "DDR4"
                    else:
                        p["ddr_gen"] = "DDR5"
                if "generation" not in p:
                    p["generation"] = p["ddr_gen"]
                    
            # Infer capacity for RAM
            if cat == "RAM" and "capacity" not in p:
                if "32GB" in name:
                    p["capacity"] = 16
                elif "16GB" in name:
                    p["capacity"] = 8
                else:
                    p["capacity"] = 8
                    
            # Infer capacity for SSD
            if cat == "SSD" and "capacity" not in p:
                if "2TB" in name:
                    p["capacity"] = 2000
                elif "1TB" in name:
                    p["capacity"] = 1000
                else:
                    p["capacity"] = 500
                    
            # Infer wattage for PSU
            if cat in ["PSU", "Power"] and "wattage" not in p:
                if "850W" in name or "850" in name:
                    p["wattage"] = 850
                elif "750W" in name or "750" in name:
                    p["wattage"] = 750
                elif "600W" in name or "600" in name:
                    p["wattage"] = 600
                elif "500W" in name or "500" in name:
                    p["wattage"] = 500
                else:
                    p["wattage"] = p.get("watt", 600)
    else:
        print("Warning: parts_db.json file not found.")
except Exception as e:
    print(f"Error loading parts_db.json: {e}")

# Load menu_map.json data
menu_map = {"menus": [], "fallback": {}}
try:
    menu_map_path = os.path.join(os.path.dirname(__file__), "menu_map.json")
    if os.path.exists(menu_map_path):
        with open(menu_map_path, "r", encoding="utf-8") as f:
            menu_map = json.load(f)
        print(f"Successfully loaded {len(menu_map.get('menus', []))} menus from menu_map.json.")
    else:
        print("Warning: menu_map.json file not found.")
except Exception as e:
    print(f"Error loading menu_map.json: {e}")

# ----------------------------------------------------
# ChromaDB Semantic Search Client & Helper
# ----------------------------------------------------
chroma_client = None
chroma_collection = None
try:
    import chromadb
    chroma_db_path = os.path.join(os.path.dirname(__file__), "scraper", "output", "chroma_db")
    if os.path.exists(chroma_db_path):
        chroma_client = chromadb.PersistentClient(path=chroma_db_path)
        chroma_collection = chroma_client.get_collection("compuzone_parts")
        print(f"Successfully connected to ChromaDB collection 'compuzone_parts' at {chroma_db_path}.")
    else:
        print(f"ChromaDB persistent path not found at {chroma_db_path}. Running without ChromaDB vector search.")
except Exception as e:
    print(f"Error initializing ChromaDB client: {e}")


def generate_product_aspects(name: str, category: str, price: int, desc: str, condition: str) -> dict:
    """
    Generates product-specific pros, cons, and recommended users.
    Factors in condition ("used_or_bulk") to show package, warranty, and pricing context.
    Caches the results to minimize Gemini API calls and reduce latency to 0ms on repeated hits.
    """
    cache_key = name.strip()
    if cache_key in _aspects_cache:
        return _aspects_cache[cache_key]

    res_aspects = None
    client = get_gemini_client()
    if client:
        try:
            cond_str = "신품/정품" if condition == "new" else "벌크/중고/리퍼브"
            prompt = f"""다음 컴퓨터 부품 제품명과 상세 설명을 바탕으로, 이 제품의 실제 하드웨어 사양/특징 관점에서의
구체적이고 명확한 장점 2개, 단점 1개, 추천 고객 1개를 한국어로 간결하게 도출해줘.
일반적인 설명 대신 해당 모델에 맞는 구체적 특징(클럭, 쿨링팬, VRAM 용량, 성능 등)을 서술해야 해.

제품명: {name}
제품 상태: {cond_str}
상세설명: {desc or '없음'}"""
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "pros": types.Schema(
                                type=types.Type.ARRAY,
                                items=types.Schema(type=types.Type.STRING)
                            ),
                            "cons": types.Schema(
                                type=types.Type.ARRAY,
                                items=types.Schema(type=types.Type.STRING)
                            ),
                            "recommendedUsers": types.Schema(
                                type=types.Type.ARRAY,
                                items=types.Schema(type=types.Type.STRING)
                            ),
                        },
                        required=["pros", "cons", "recommendedUsers"]
                    )
                )
            )
            data = json.loads(response.text)
            if (
                isinstance(data.get("pros"), list) and len(data["pros"]) >= 2
                and isinstance(data.get("cons"), list) and len(data["cons"]) >= 1
                and isinstance(data.get("recommendedUsers"), list) and len(data["recommendedUsers"]) >= 1
            ):
                res_aspects = {
                    "pros": data["pros"][:2],
                    "cons": data["cons"][:1],
                    "recommendedUsers": data["recommendedUsers"][:1]
                }
        except Exception as e:
            print(f"Gemini aspects generation failed, using fallback templates: {e}")

    if not res_aspects:
        # Fallback heuristic templates
        brand = "주요 제조사"
        if "]" in name:
            brand = name.split("]")[0].replace("[", "").strip()

        if condition == "used_or_bulk":
            res_aspects = {
                "pros": ["정품 정가 대비 가격이 대폭 낮아 매우 합리적인 부품 구성 가능", "벌크/리퍼브 특유의 뛰어난 실속형 가격 대비 성능"],
                "cons": ["포장 박스가 벌크(무지박스)이거나 제조사 A/S 보증 기간이 다소 짧을 수 있음"],
                "recommendedUsers": ["제품 패키지 포장보다는 실질적인 부품 단가 절감을 추구하는 실속파 고객"]
            }
        elif category == "CPU":
            res_aspects = {
                "pros": [f"{brand} 고효율 아키텍처로 멀티태스킹 및 게이밍 연산 지원", "뛰어난 전력 대비 성능 및 검증된 클럭 스피드"],
                "cons": ["기본 번들 쿨러 외에 정숙한 고성능 공랭/수랭 쿨러 추가 권장"],
                "recommendedUsers": ["끊김 없는 게이밍과 다중 연산 작업을 동시에 처리하려는 사용자"]
            }
        elif category == "GPU":
            res_aspects = {
                "pros": ["강력한 3D 렌더링 성능과 원활한 고주사율 게이밍 지원", "안정적인 온도 유지를 돕는 최적화된 쿨링 팬 솔루션"],
                "cons": ["케이스 가로 길이 및 시스템 정격 파워 서플라이 용량 확인 필요"],
                "recommendedUsers": ["최신 고사양 3D 게임이나 고해상도 디자인 편집을 즐겨 하는 게이머"]
            }
        elif category == "Motherboard" or category == "MB":
            res_aspects = {
                "pros": ["전원부 페이즈의 전력 분배 설계로 우수한 부품 안정성 보장", "초고속 M.2 NVMe 슬롯 및 넉넉한 RAM 확장 포트 탑재"],
                "cons": ["케이스 크기 규격(M-ATX 등)과 CPU 소켓 핀 호환성 대조 필수"],
                "recommendedUsers": ["단단한 안정성과 메인보드 전원부 신뢰성을 선호하는 PC 조립가"]
            }
        elif category == "RAM":
            res_aspects = {
                "pros": ["넓은 대역폭 클럭 속도로 병목 현상을 억제하고 데이터 처리 가속", "멀티태스킹 환경에서 부드럽고 쾌적한 앱 전환 속도 제공"],
                "cons": ["DDR4 및 DDR5 세대별 규격이 메인보드와 일치하는지 확인 요망"],
                "recommendedUsers": ["여러 프로그램을 동시에 켜두거나 빠른 게임 로딩을 원하는 유저"]
            }
        elif category == "SSD":
            res_aspects = {
                "pros": ["NVMe 전송 방식으로 일반 SATA 대비 압도적인 읽기/쓰기 대역폭", "안정적인 쓰기 내구성 설계 및 부팅 반응 속도 극대화"],
                "cons": ["고속 전송 시 발열 해소를 위해 방열판(Heatsink) 부착 권장"],
                "recommendedUsers": ["신속한 윈도우 부팅과 고용량 파일 전송을 중요시하는 분"]
            }
        elif category == "Power" or category == "PSU":
            import re
            w_val = "정격"
            m = re.search(r"(\d{3,4})W", name)
            if m:
                w_val = f"정격 {m.group(1)}W"
            res_aspects = {
                "pros": [f"{w_val} 정격 출력으로 하이엔드 그래픽카드와 CPU에 전력 공급 보장", "인증 획득으로 입증된 전력 변환 효율성"],
                "cons": ["케이스 파워 서플라이 장착 공간 규격(ATX 등) 사전 확인 필수"],
                "recommendedUsers": ["안정적인 시스템 구동과 고부하 환경에서의 전력 보증을 원하는 유저"]
            }
        elif category == "Cooler":
            cooling_type = "수랭" if "수랭" in name or "liquid" in name.lower() or "워터" in name or "3열" in name else "공랭"
            res_aspects = {
                "pros": [f"CPU 발열을 신속히 억제하는 강력한 팬 가속 및 풍량 제공", "소음을 최소화한 저소음 베어링으로 쾌적한 시스템 환경 제공"],
                "cons": ["케이스 내부 높이 간섭이나 라디에이터 두께에 따른 장착 제약 체크 요망"],
                "recommendedUsers": ["장시간 구동 시 스로틀링을 방지하고 정숙한 소음 제어를 원하는 분"]
            }
        else:
            res_aspects = {
                "pros": [f"{brand} 고품질 부품으로 우수한 조립 만족도", "컴퓨존의 공식 조립 호환성 검증 통과"],
                "cons": ["실시간 수급 상황에 따라 배송일 변동 가능성이 있음"],
                "recommendedUsers": ["안정성과 부품 신뢰도를 중시하는 조립 PC 구매자"]
            }

    _aspects_cache[cache_key] = res_aspects
    save_aspects_cache()
    return res_aspects


def find_scraped_product(product_name: str) -> Optional[dict]:
    """
    Looks up a product using:
    1. ChromaDB semantic search (using Gemini embeddings)
    2. Substring matching in parts_list (scraped database)
    3. Substring matching in PRODUCT_CATALOG (hardcoded fallback)
    """
    name_lower = product_name.lower().strip()
    
    # 1. Try ChromaDB semantic search if available
    if chroma_collection:
        try:
            api_key = os.environ.get("GEMINI_API_KEY")
            client = get_gemini_client()
            if api_key and client:
                res = client.models.embed_content(model="gemini-embedding-2", contents=[product_name])
                query_embeddings = [res.embeddings[0].values]
                results = chroma_collection.query(
                    query_embeddings=query_embeddings,
                    n_results=3
                )
                
                if results and results.get("ids") and len(results["ids"][0]) > 0:
                    distances = results.get("distances", [[0.0]])
                    top_distance = distances[0][0]
                    
                    # For L2, smaller is closer. A distance < 1.2 is typically a good match.
                    if top_distance < 1.2:
                        top_id = results["ids"][0][0]
                        matched_item = next((p for p in parts_list if p.get("product_id") == top_id), None)
                        if matched_item:
                            name_val = matched_item.get("name", "")
                            cat_val = matched_item.get("category", "")
                            price_val = matched_item.get("price", 0)
                            desc_val = matched_item.get("description", "")
                            cond_val = matched_item.get("condition", "new")
                            aspects = generate_product_aspects(name_val, cat_val, price_val, desc_val, cond_val)
                            return {
                                "id": matched_item.get("product_id"),
                                "name": name_val,
                                "category": cat_val,
                                "price": price_val,
                                "specs": {
                                    "socket": matched_item.get("socket"),
                                    "ram_gen": matched_item.get("ram_gen"),
                                    "capacity": matched_item.get("capacity"),
                                    "generation": matched_item.get("generation"),
                                    "wattage": matched_item.get("wattage"),
                                    "tdp": matched_item.get("tdp"),
                                    "condition": cond_val,
                                },
                                "description": desc_val or "실시간 검색된 컴퓨존 실제 상품 정보입니다.",
                                "pros": aspects["pros"],
                                "cons": aspects["cons"],
                                "recommendedUsers": aspects["recommendedUsers"],
                                "stockStatus": "in_stock" if matched_item.get("stock", True) else "out_of_stock"
                            }
        except Exception as e:
            print(f"ChromaDB lookup failed: {e}")
 
    # 2. Try substring match in parts_list (real scraped parts)
    for p in parts_list:
        p_name = p.get("name", "").lower()
        if name_lower in p_name:
            name_val = p.get("name", "")
            cat_val = p.get("category", "")
            price_val = p.get("price", 0)
            desc_val = p.get("description", "")
            cond_val = p.get("condition", "new")
            aspects = generate_product_aspects(name_val, cat_val, price_val, desc_val, cond_val)
            return {
                "id": p.get("product_id"),
                "name": name_val,
                "category": cat_val,
                "price": price_val,
                "specs": {
                    "socket": p.get("socket"),
                    "ram_gen": p.get("ram_gen"),
                    "capacity": p.get("capacity"),
                    "generation": p.get("generation"),
                    "wattage": p.get("wattage"),
                    "tdp": p.get("tdp"),
                    "condition": cond_val,
                },
                "description": desc_val or "컴퓨존의 실제 상품 정보입니다.",
                "pros": aspects["pros"],
                "cons": aspects["cons"],
                "recommendedUsers": aspects["recommendedUsers"],
                "stockStatus": "in_stock" if p.get("stock", True) else "out_of_stock"
            }
    # 3. Try original substring match in hardcoded PRODUCT_CATALOG
    for p in PRODUCT_CATALOG:
        prod_name_lower = p["name"].lower()
        prod_id_part = p["id"].split("-")[-1].lower()
        if name_lower in prod_name_lower or prod_id_part in name_lower or name_lower in prod_id_part:
            return p

    return None

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
        target_budget = max(900000, int(budget_val * 1.00))

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
        # Map category names to support both old and new formats
        cat_aliases = {
            "Motherboard": ["Motherboard", "MB"],
            "Power": ["Power", "PSU"],
            "Cooler": ["Cooler", "COOLER"],
            "Case": ["Case", "CASE"]
        }
        target_categories = cat_aliases.get(category, [category])
        candidates = [p for p in parts_list if p["category"] in target_categories]
        
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
            # Try to fetch using aliases without filters
            for target_cat in target_categories:
                candidates = [p for p in parts_list if p["category"] == target_cat]
                if candidates:
                    break
            
            # Still empty? Try base category
            if not candidates:
                candidates = [p for p in parts_list if p["category"] == category]
            
            if socket_req and category in ["Motherboard", "Cooler"]:
                candidates = [p for p in candidates if p.get("socket") == socket_req]

        # If candidates is still empty (e.g. category not found in DB at all)
        if not candidates:
            return {
                "product_id": f"dummy_{category.lower()}",
                "category": category,
                "name": f"기본형 {category} 패키지",
                "price": 0,
                "stock": True,
                "tier": 1,
                "tdp": 0,
                "description": f"기본으로 제공되는 {category} 호환 부품입니다."
            }

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
        {"category": "CPU", "name": selected_cpu["name"], "price": selected_cpu["price"], "product_id": selected_cpu["product_id"], "description": selected_cpu.get("description", "최고의 연산 속도를 보증하는 고성능 프로세서입니다."), "stock": selected_cpu.get("stock", True), "tdp": selected_cpu.get("tdp", 65)},
        {"category": "GPU", "name": selected_gpu["name"], "price": selected_gpu["price"], "product_id": selected_gpu["product_id"], "description": selected_gpu.get("description", "화려한 3D 그래픽 연산을 담당하는 독립형 그래픽 장치입니다."), "stock": selected_gpu.get("stock", True), "tdp": selected_gpu.get("tdp", 150)},
        {"category": "MB", "name": selected_mb["name"], "price": selected_mb["price"], "product_id": selected_mb["product_id"], "description": selected_mb.get("description", "모든 부품을 안정적으로 제어 및 확장해주는 컴퓨터의 뼈대 메인보드입니다."), "stock": selected_mb.get("stock", True), "tdp": selected_mb.get("tdp", 0)},
        {"category": "RAM", "name": f"{selected_ram['name']} x{ram_count}", "price": selected_ram["price"] * ram_count, "product_id": selected_ram["product_id"], "description": selected_ram.get("description", "포토샵, 게임 멀티태스킹 등을 부드럽게 유지하는 시스템 임시 메모리입니다."), "stock": selected_ram.get("stock", True), "tdp": selected_ram.get("tdp", 10)},
        {"category": "SSD", "name": selected_ssd["name"], "price": selected_ssd["price"], "product_id": selected_ssd["product_id"], "description": selected_ssd.get("description", "고용량 게임 및 작업 결과물을 안심하고 보관하는 초고속 저장 공간입니다."), "stock": selected_ssd.get("stock", True), "tdp": selected_ssd.get("tdp", 5)},
        {"category": "Power", "name": selected_power["name"], "price": selected_power["price"], "product_id": selected_power["product_id"], "description": selected_power.get("description", "부품 전체에 안정적이고 깨깝한 정격 전력을 공급하는 에너지 심장입니다."), "stock": selected_power.get("stock", True), "tdp": selected_power.get("tdp", 0)},
        {"category": "Cooler", "name": selected_cooler["name"], "price": selected_cooler["price"], "product_id": selected_cooler["product_id"], "description": selected_cooler.get("description", "부하가 걸린 부품의 열을 신속히 억제하여 스로틀링을 방지하는 정숙한 쿨러입니다."), "stock": selected_cooler.get("stock", True), "tdp": selected_cooler.get("tdp", 0)}
    ]

    total_price = sum(item["price"] for item in parts_picked)

    # Post-adjustment to strictly guarantee final price is under user budget_val
    if total_price > budget_val:
        # Downgrade priority list: GPU, CPU, Motherboard, SSD, RAM, Cooler, Power
        for cat_to_downgrade in ["GPU", "CPU", "Motherboard", "SSD", "RAM", "Cooler", "Power"]:
            if total_price <= budget_val:
                break
                
            # Find current picked item for this category
            current_part = None
            for item in parts_picked:
                if item["category"] == ("MB" if cat_to_downgrade == "Motherboard" else cat_to_downgrade):
                    current_part = item
                    break
            
            if not current_part:
                continue
                
            # Find all candidates for this category that are cheaper than current_part["price"]
            target_categories = ["Motherboard", "MB"] if cat_to_downgrade == "Motherboard" else (["Power", "PSU"] if cat_to_downgrade == "Power" else (["Cooler", "COOLER"] if cat_to_downgrade == "Cooler" else [cat_to_downgrade]))
            candidates = [p for p in parts_list if p["category"] in target_categories]
            
            # Apply identical constraints to maintain compatibility
            if cat_to_downgrade == "Motherboard":
                candidates = [p for p in candidates if p.get("socket") == socket and p.get("ram_gen") == ram_gen]
            elif cat_to_downgrade == "CPU":
                candidates = [p for p in candidates if p.get("socket") == socket]
            elif cat_to_downgrade == "RAM":
                candidates = [p for p in candidates if p.get("generation") == ram_gen]
            elif cat_to_downgrade == "Cooler" and selected_cpu.get("tdp", 65) > 100:
                candidates = [p for p in candidates if p.get("tier", 0) >= cooler_tier]
            
            # Filter and sort
            candidates = [c for c in candidates if c["price"] < current_part["price"]]
            candidates.sort(key=lambda x: x["price"])
            
            if candidates:
                cheapest_candidate = candidates[0]
                price_diff = current_part["price"] - cheapest_candidate["price"]
                
                if cat_to_downgrade == "RAM":
                    price_diff = current_part["price"] - (cheapest_candidate["price"] * ram_count)
                    current_part["name"] = f"{cheapest_candidate['name']} x{ram_count}"
                    current_part["price"] = cheapest_candidate["price"] * ram_count
                    selected_ram = cheapest_candidate
                else:
                    current_part["name"] = cheapest_candidate["name"]
                    current_part["price"] = cheapest_candidate["price"]
                    if cat_to_downgrade == "CPU":
                        selected_cpu = cheapest_candidate
                    elif cat_to_downgrade == "GPU":
                        selected_gpu = cheapest_candidate
                    elif cat_to_downgrade == "Motherboard":
                        selected_mb = cheapest_candidate
                    elif cat_to_downgrade == "SSD":
                        selected_ssd = cheapest_candidate
                    elif cat_to_downgrade == "Power":
                        selected_power = cheapest_candidate
                    elif cat_to_downgrade == "Cooler":
                        selected_cooler = cheapest_candidate
                    
                current_part["product_id"] = cheapest_candidate["product_id"]
                if "tdp" in cheapest_candidate:
                    current_part["tdp"] = cheapest_candidate["tdp"]
                    
                total_price -= price_diff

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
    message = request.message.strip().lower()
    
    # 1. Check in-memory intent cache for identical simple inquiries
    if message in _intent_cache:
        return {"intent": _intent_cache[message], "source": "intent_cache"}

    ai = get_gemini_client()
    
    if not ai:
        msg = message
        intent = "general"
        if any(x in msg for x in ["추천", "견적", "조립", "맞춤", "사양", "용도", "게임용", "작업용", "사무용", "가성비", "균형", "성능", "맞춰"]):
            intent = "recommend"
        elif any(x in msg for x in ["5060", "4070", "4060", "rtx", "ryzen", "라이젠", "i5", "i7", "인텔", "삼성 램", "990pro", "인기제품", "모델", "상세", "가격"]):
            intent = "product"
        elif any(x in msg for x in ["cpu", "gpu", "메인보드", "메모리", "파워", "ssd", "품목", "부품", "그래픽카드", "저장장치", "쿨러", "케이스", "보드", "램", "파워서플라이", "하드"]):
            intent = "category"
        elif any(x in msg for x in ["상담", "사람", "직원", "상담사", "고객센터", "전화", "연결", "문의"]):
            intent = "counselor"
        elif any(x in msg for x in ["as", "a/s", "보증", "고장", "수리", "망가", "안 켜", "안켜", "오작동", "이상해", "배송", "택배", "운송장", "배달", "출고", "주문", "결제"]):
            intent = "as"
        elif any(x in msg for x in ["어디", "위치", "메뉴", "바로가기", "사이트", "링크", "홈페이지", "화면", "처음"]):
            intent = "menu"
        # Cache rules classification
        _intent_cache[message] = intent
        return {"intent": intent, "source": "fallback_rules"}

    try:
        system_prompt = """
        You are an expert intent classifier for Compuzone (컴퓨존), a leading Korean PC & electronics shop chatbot named "Komi".
        Classify the user's message into EXACTLY one of these intents:
        - "menu": The user is searching for a menu, links, or asking "어디서 견적 짜나요?", "빠른 견적 어디에 있어요?".
        - "recommend": The user wants a product recommendation, computer custom build estimation, or mentions buying a complete set ("컴퓨터 하나 맞춰줘", "게임용 컴퓨터 추천", "견적 추천").
        - "product": The user asks details, price, stocks, or specs for a SPECIFIC hardware model name ("RTX 4060 가격이 어떻게 돼?", "5600X 상세스펙 보여줘").
        - "category": The user asks about a general computer part category ("메모리 상품들 보여줘", "파워 코너로 갈래").
        - "counselor": The user explicitly wants to talk to a human customer center assistant, counselor, representative ("상담원 연결해줘", "사람이랑 대화할래", "고객센터 전화번호").
        - "as": The user asks about repairs, warranties, hardware errors, order tracking, shipping dates or payments ("AS 기간 조회", "모니터가 안켜져요", "배송 언제 와요?", "결제 취소").
        - "general": Small talks, greetings, thank yous, or anything else ("안녕", "고마워", "바보", "오늘 날씨 어때?").

        Return ONLY a JSON object:
        {
          "intent": "<intent_name>"
        }
        Do not add any explanation or markdown formatting outside JSON.
        """
        response = ai.models.generate_content(
            model="gemini-2.5-flash",
            contents=message,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_schema=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "intent": types.Schema(type=types.Type.STRING),
                    },
                    required=["intent"]
                )
            )
        )
        res_json = json.loads(response.text)
        intent = res_json.get("intent", "general")
        
        # Save to cache
        _intent_cache[message] = intent
        return {"intent": intent, "source": "gemini"}
    except Exception as e:
        print(f"Intent classification failed: {e}")
        # Fallback to general
        return {"intent": "general", "source": "error"}

def find_product_in_history(history: list) -> Optional[dict]:
    if not history:
        return None
    for msg in reversed(history[:-1]):
        text = msg.text or ""
        text_lower = text.lower()
        # 1. Search for matches in PRODUCT_CATALOG
        for p in PRODUCT_CATALOG:
            if p["name"].lower() in text_lower:
                return p
        # 2. Search for matches in parts_list (scraped database)
        for p in parts_list:
            name = p.get("name", "")
            if name and name.lower() in text_lower:
                return p
    return None

def local_chat_fallback(message: str, history: list = None) -> str:
    msg_clean = message.strip().lower()
    
    # 1. Noise Filter (무관 질문 필터)
    noise_keywords = ["날씨", "라면", "요리", "레시피", "스포츠", "축구", "야구", "연예", "가수", "정치", "대통령", "오늘 기분", "심심해", "놀아줘"]
    if any(k in msg_clean for k in noise_keywords):
        return (
            "🤖 반가워요! 코미예요! 💖\n"
            "저는 컴퓨존 코미라서 오늘 날씨나 일상 질문은 잘 모르지만... 🥺 "
            "컴퓨터나 부품에 대해서는 무엇이든 답변해 드릴 수 있답니다! 💻✨\n\n"
            "혹시 어떤 PC가 필요하신가요? 궁금한 점이 있다면 코미에게 물어봐 주세요! 💖"
        )
        
    # 2. A/S Guide routing (A/S 연계 질문)
    as_keywords = ["as", "a/s", "보증", "수리", "고장", "무상", "이상해", "안켜", "안 켜"]
    if any(k in msg_clean for k in as_keywords):
        return (
            "홍길동 고객님의 실시간 결제 데이터와 연동된 정품 보증(Warranty) 내역 목록입니다. "
            "A/S 안심 점검 조회를 원하시는 주문 번호를 선택해 주세요! 🛡️\n\n"
            "(※ 상단 메뉴의 [A/S 보증조회] 버튼을 클릭하시면 실시간 상세 D-Day 내역을 더 자세히 보실 수 있답니다! 💻✨)"
        )

    # 3. Product Analysis Fallback (제품 상세/장단점/설명 질문)
    product_keywords = ["이 제품", "제품", "설명해", "장단점", "스펙", "사양", "정보", "어때", "리포트", "더 알려", "가격", "얼마"]
    if any(k in msg_clean for k in product_keywords):
        matched = find_product_in_history(history) if history else None
        if matched:
            name_val = matched.get("name", "")
            # check if aspects are already generated/predefined:
            if "description" in matched and "pros" in matched:
                desc_val = matched["description"]
                pros_str = " / ".join(matched["pros"])
            else:
                cat_val = matched.get("category", "")
                desc_val = matched.get("description", "")
                cond_val = matched.get("condition", "new")
                price_val = matched.get("price", 0)
                aspects = generate_product_aspects(name_val, cat_val, price_val, desc_val, cond_val)
                desc_val = desc_val or "고성능 컴퓨터 부품"
                pros_str = " / ".join(aspects["pros"])
            
            return (
                f"문의하신 **{name_val}** 제품에 대해 코미가 찾아온 정보예요! 🤖✨\n\n"
                f"이 제품은 **{desc_val}** 특징을 가진 멋진 부품이랍니다! 💻\n"
                f"대표적인 장점으로는 **{pros_str}** 등이 있어요! 🌟\n\n"
                f"상세 가격과 공식 페이지 설명은 아래의 [상세스펙 전체보기] 버튼을 꾹 눌러 확인해 주세요! 💖"
            )
            
        return (
            "선택하신 상품에 대한 코미의 AI 상세 분석(장단점/추천대상)은 실시간 AI 연동(Gemini)이 필요한 영역이에요! 🥺\n\n"
            "현재 AI 서버 호출량이 일시적으로 급증하여 상세 답변이 조금 지연되고 있답니다. 💻 "
            "대신 상세 스펙과 실시간 가격은 해당 상품 카드 하단의 [상세스펙 전체보기] 버튼을 클릭하셔서 컴퓨존 공식몰 페이지에서 직접 편리하게 확인하실 수 있어요! 💖"
        )

    # 4. Recommendation / Custom Estimate Fallback (추천/견적 질문)
    recommend_keywords = ["추천", "견적", "조립", "맞춰", "컴퓨터 사양", "pc", "컴퓨터"]
    if any(k in msg_clean for k in recommend_keywords):
        return (
            "나만의 맞춤형 조립 PC 견적을 원하신다면, 챗봇 상단의 [간편 조립 견적] 또는 메인 화면의 [스마트 맞춤 PC 견적추천]을 이용해 보세요! 🚀\n\n"
            "용도, 실행 프로그램, 예산 슬라이더만 조절하면 실시간 호환성 검증을 마친 최적의 3종 견적(가성비/균형/성능) 리포트를 즉시 코미가 뽑아드린답니다! 🖥️✨"
        )
        
    # 5. Analogy FAQ (용어 FAQ 비유 가이드)
    if "cpu" in msg_clean or "씨피유" in msg_clean:
        return (
            "안녕! 코미예요 🤖✨ CPU가 뭔지 궁금하군요! 코미가 아주 쉽게 알려줄게요!\n\n"
            "CPU는 컴퓨터의 '두뇌 🧠'라고 생각하면 이해하기 쉬울 거예요! "
            "마치 사람의 뇌처럼 컴퓨터 안에서 모든 연산과 계산 명령을 직접 제어하고 지시하는 핵심 장치랍니다. "
            "CPU가 빠를수록 컴퓨터의 전반적인 작업 처리 속도가 훌륭해져요! ⚡\n\n"
            "부품에 대해 조금 이해가 가셨나요? 그럼 이 지식을 토대로 바로 사용자님께 최적화된 맞춤 PC 추천(Flow ②)을 받아보실까요?"
        )
    elif "gpu" in msg_clean or "그래픽" in msg_clean or "글카" in msg_clean:
        return (
            "안녕! 코미예요 🤖✨ 그래픽카드가 뭔지 궁금하군요! 코미가 아주 쉽게 알려줄게요!\n\n"
            "그래픽카드는 컴퓨터의 '화가 🎨'라고 생각하면 이해하기 쉬울 거예요! "
            "컴퓨터가 만드는 복잡한 그림이나 멋진 영상을 모니터 화면에 예쁘게 그려서 보여주는 일을 한답니다. 🖼️🎬 "
            "그래서 게임을 하거나 영화를 볼 때 더 생생하고 멋진 화면을 만들어주는 아주 중요한 친구죠! 🎮✨\n\n"
            "부품에 대해 조금 이해가 가셨나요? 그럼 이 지식을 토대로 바로 사용자님께 최적화된 맞춤 PC 추천(Flow ②)을 받아보실까요?"
        )
    elif "메인보드" in msg_clean or "mb" in msg_clean or "보드" in msg_clean:
        return (
            "안녕! 코미예요 🤖✨ 메인보드가 뭔지 궁금하군요! 코미가 아주 쉽게 알려줄게요!\n\n"
            "메인보드는 모든 하드웨어 부품들을 하나로 연결해 주는 '도시의 도로망 🗺️'이나 '척추' 같은 부품이에요! "
            "CPU, 램, 그래픽카드 등이 서로 꽂혀서 대화할 수 있게 큰 다리 역할을 해준답니다. "
            "안정적인 컴퓨터 구동을 위한 든든한 밑바탕이죠! 🌟\n\n"
            "부품에 대해 조금 이해가 가셨나요? 그럼 이 지식을 토대로 바로 사용자님께 최적화된 맞춤 PC 추천(Flow ②)을 받아보실까요?"
        )
    elif "램" in msg_clean or "ram" in msg_clean or "메모리" in msg_clean:
        return (
            "안녕! 코미예요 🤖✨ 메모리(RAM)가 뭔지 궁금하군요! 코미가 아주 쉽게 알려줄게요!\n\n"
            "메모리(RAM)는 현재 작업 중인 프로그램을 올려두는 '책상 넓이 📚'라고 생각하면 이해하기 쉬울 거예요! "
            "책상이 넓을수록 여러 가지 책과 노트를 펼쳐두고 일(멀티태스킹)을 버벅임 없이 쾌적하게 수행할 수 있답니다. "
            "책상이 좁으면 컴퓨터가 힘들어해요! 🥺\n\n"
            "부품에 대해 조금 이해가 가셨나요? 그럼 이 지식을 토대로 바로 사용자님께 최적화된 맞춤 PC 추천(Flow ②)을 받아보실까요?"
        )
    elif "ssd" in msg_clean or "저장" in msg_clean or "하드" in msg_clean:
        return (
            "안녕! 코미예요 🤖✨ SSD가 뭔지 궁금하군요! 코미가 아주 쉽게 알려줄게요!\n\n"
            "SSD는 컴퓨터의 모든 데이터와 파일을 보관하는 '서랍 서랍장 💾'이라고 생각하면 이해하기 쉬울 거예요! "
            "부팅 속도와 게임 로딩 속도를 매우 빠르게 단축해 주는 든든한 금고 보관소랍니다. "
            "예전 느린 HDD 하드디스크보다 훨씬 똑똑한 친구예요! 🚀\n\n"
            "부품에 대해 조금 이해가 가셨나요? 그럼 이 지식을 토대로 바로 사용자님께 최적화된 맞춤 PC 추천(Flow ②)을 받아보실까요?"
        )
    elif "파워" in msg_clean or "power" in msg_clean or "psu" in msg_clean:
        return (
            "안녕! 코미예요 🤖✨ 파워 서플라이가 뭔지 궁금하군요! 코미가 아주 쉽게 알려줄게요!\n\n"
            "파워는 모든 부품들에게 안정적인 밥(전기 에너지)을 공급해 주는 '심장 ⚡'이자 '발전소' 역할을 담당해요! "
            "안정적인 에너지를 공급해 줘야 컴퓨터가 멈추지 않고 건강하게 돌아갈 수 있답니다. 심장이 튼튼해야 안심되겠죠? 💖\n\n"
            "부품에 대해 조금 이해가 가셨나요? 그럼 이 지식을 토대로 바로 사용자님께 최적화된 맞춤 PC 추천(Flow ②)을 받아보실까요?"
        )
        
    # 6. Basic Greetings / Default
    if any(k in msg_clean for k in ["안녕", "hi", "hello"]):
        return "반가워요! 저는 컴퓨존의 마스코트 챗봇 코미입니다! 오늘도 행복한 하루 되세요. 💻 어떤 컴퓨터 부품이나 견적이 필요하신가요? 🤖💖"
    elif any(k in msg_clean for k in ["고마워", "감사", "땡큐"]):
        return "천만에요! 코미가 힘이 되었다니 기뻐요. 다른 컴퓨터 상담도 필요하시면 언제든 불러주세요! 🌟🤖💖"
        
    return "컴퓨터 부품 견적, 정품 무상 A/S 조회, 혹은 빠른 메뉴 안내에 대해 궁금한 점이 있으시다면 언제든 코미에게 물어보세요! 🤖"

@app.post('/api/chat/general')
async def general_chat(request: GeneralChatRequest):
    messages = request.messages
    ai = get_gemini_client()
    
    if not ai:
        last_msg = messages[-1].text if messages else ""
        reply = local_chat_fallback(last_msg, messages)
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

        [중요 지침 1: 컴퓨터와 무관한 질문 필터링]
        - 날씨, 요리 레시피, 스포츠, 연예, 정치 등 컴퓨터/전자기기/부품/IT 견적/컴퓨존의 서비스와 "전혀 무관한 질문"이 입력되면 절대 답변을 작성하지 마십시오.
        - 대신 반드시 다음과 같이 답변을 종결하십시오: "저는 컴퓨존의 컴퓨터 전문 비서 코미입니다! 컴퓨터, 부품, 견적, 혹은 컴퓨존 서비스와 관련 없는 질문에는 답변드릴 수 없어요. 🥺 컴퓨터 관련 궁금증을 질문해 주시거나 상담사 연결을 진행해 주세요!"

        [중요 지침 2: 하드웨어 개념 설명 및 A/S 연계 가이드]
        - 사용자가 "그래픽카드가 뭐야?", "SSD가 뭐야?" 등 컴퓨터 부품의 개념을 묻는 경우, 구글이나 타 사이트로 이탈하는 것을 막기 위해 초보자용 비유(예: CPU=두뇌, RAM=책상 면적)를 사용하여 챗봇 안에서 3줄 이내로 쉽고 명쾌하게 즉시 개념을 설명해 주십시오.
        - 사용자가 자가 수리나 보증 기간을 묻는 경우, 부품 무상 보증 정책을 간략히 설명한 후 "회원님의 상세 주문 내역과 실시간 연동하여 D-Day 보증 기한을 확인해 드리기 위해 챗봇의 [A/S 조회] 메뉴나 주문번호 조회를 선택해 주세요!" 라고 안내하십시오.

        [컴퓨존 공식 정책 및 안내 가이드]
        1. 배송 정책:
           - 오후 2시 이전 결제 완료 시 당일 출고되어 다음 날 도착합니다 (수도권 기준).
           - 도서산간 지역은 추가 1~2일이 소요됩니다.
        2. A/S 및 보증 정책:
           - 초기 불량은 수령 후 7일 이내 교환 및 환불이 가능합니다.
           - 단순 변심은 수령 후 7일 이내 미개봉 상태인 상품만 처리 가능합니다.
           - 부품별 무상 보증 기한: CPU/메인보드/RAM 3년, SSD 3~5년, 그래픽카드(GPU) 2~3년입니다.
           - 병행수입 제품은 국내 공식 A/S가 불가능하며, 수입사를 통해 처리해야 합니다.
        3. 결제 혜택:
           - 카드사별로 최대 12개월 무이자 할부가 지원됩니다.
           - 결제 시 구매 금액의 1~3%가 포인트로 적립됩니다.
           - 7일 이내에 동일 제품의 타사 판매가가 더 저렴할 경우 차액을 보상하는 최저가 보장제를 운영합니다.
        4. 조립 대행 서비스:
           - 부품 구매 시 유료로 조립 대행 서비스를 신청할 수 있으며, 조립 완료 후 기본적인 구동 테스트를 거쳐 안전하게 발송됩니다.
        """

        response = ai.models.generate_content(
            model='gemini-2.5-flash',
            contents=chat_history,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction
            )
        )
        return {"text": response.text, "source": "gemini"}
    except Exception as e:
        print(f"Gemini General Chat Error: {e}")
        last_msg = messages[-1].text if messages else ""
        reply = local_chat_fallback(last_msg, messages)
        return {
            "text": reply,
            "source": "fallback_error"
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
        "reason": f"사용자님의 피드백 \"{user_feedback}\"을 꼼꼼하게 반영하여 더 마음에 드실 수 있게 조율한 견적이에요! 🤖✨\n\n전력 효율이 매우 우수한 **RTX 5060 그래픽카드**로 교체하고, 메인보드를 실속형 제품으로 다듬어서 성능 손실 없이 더 정교하게 균형을 맞춘 실속 맞춤 패키지랍니다! 💖"
    }

    ai = get_gemini_client()
    if not ai:
        return {"revised": fallback_revision, "source": "fallback"}

    try:
        # Retrieve relevant real parts from ChromaDB if available based on user feedback
        retrieved_parts_str = ""
        if chroma_collection:
            try:
                api_key = os.environ.get("GEMINI_API_KEY")
                if api_key:
                    res = ai.models.embed_content(model="gemini-embedding-2", contents=[user_feedback])
                    query_embeddings = [res.embeddings[0].values]
                    results = chroma_collection.query(
                        query_embeddings=query_embeddings,
                        n_results=5
                    )
                else:
                    results = chroma_collection.query(
                        query_texts=[user_feedback],
                        n_results=5
                    )
                
                if results and results.get("ids") and len(results["ids"][0]) > 0:
                    matched_items = []
                    for pid in results["ids"][0]:
                        matched_item = next((p for p in parts_list if p.get("product_id") == pid), None)
                        if matched_item:
                            matched_items.append({
                                "id": matched_item.get("product_id"),
                                "name": matched_item.get("name"),
                                "category": matched_item.get("category"),
                                "price": matched_item.get("price"),
                                "description": matched_item.get("description", ""),
                                "socket": matched_item.get("socket"),
                                "ram_gen": matched_item.get("ram_gen"),
                                "capacity": matched_item.get("capacity"),
                                "generation": matched_item.get("generation"),
                                "wattage": matched_item.get("wattage"),
                                "tdp": matched_item.get("tdp"),
                            })
                    if matched_items:
                        retrieved_parts_str = f"\n\nHere are some relevant real products from Compuzone matching the user feedback:\n{json.dumps(matched_items, ensure_ascii=False, indent=2)}\nYou should prioritize choosing from these real products if they fit the user's requirements and budget."
            except Exception as e:
                print(f"Error querying ChromaDB in recommend_feedback: {e}")

        system_instruction = f"""
        You are "코미", the expert PC custom builder. The user wants to adjust their current PC build.
        Here is the Compuzone product catalog with real specs and prices:
        {json.dumps(PRODUCT_CATALOG, ensure_ascii=False, indent=2)}
        {retrieved_parts_str}

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
            model='gemini-2.5-flash',
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
    matched_product = find_scraped_product(product_name)

    ai = get_gemini_client()
    if not ai:
        if matched_product:
            pros_str = " / ".join(matched_product['pros'])
            ai_explanation = (
                f"문의하신 제품에 대해 코미가 찾아온 정보예요! 🤖✨\n\n"
                f"이 제품은 **{matched_product['description']}** 특징을 가진 멋진 부품이랍니다! 💻\n"
                f"대표적인 장점으로는 **{pros_str}** 등이 있어요! 🌟\n\n"
                f"상세 가격과 공식 페이지 설명은 아래의 [상세스펙 전체보기] 버튼을 꾹 눌러 확인해 주세요! 💖"
            )
            return {
                "product": matched_product,
                "aiExplanation": ai_explanation,
                "source": "catalog_fallback"
            }
        return JSONResponse({"error": "죄송해요, 문의하신 상품에 대한 정보를 카탈로그에서 찾지 못했어요. 🥺", "source": "fallback"}, status_code=404)

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
            model='gemini-2.5-flash',
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
        if matched_product:
            pros_str = " / ".join(matched_product['pros'])
            ai_explanation = (
                f"문의하신 제품에 대해 코미가 찾아온 정보예요! 🤖✨\n\n"
                f"이 제품은 **{matched_product['description']}** 특징을 가진 멋진 부품이랍니다! 💻\n"
                f"대표적인 장점으로는 **{pros_str}** 등이 있어요! 🌟\n\n"
                f"상세 가격과 공식 페이지 설명은 아래의 [상세스펙 전체보기] 버튼을 꾹 눌러 확인해 주세요! 💖"
            )
        else:
            ai_explanation = (
                f"문의하신 **{product_name}** 부품은 뛰어난 속도와 우수한 성능을 보장하는 고품질 컴퓨터 부품이랍니다! 🤖✨\n\n"
                f"현재 상세 설명 RAG 서버의 응답이 조금 지연되고 있어요. 🥺 "
                f"실시간 상세 스펙과 재고/가격 정보는 아래의 [상세스펙 전체보기] 버튼을 통해 컴퓨존 공식몰에서 더욱 상세히 보실 수 있답니다! 💖"
            )
        return {
            "product": res_product,
            "aiExplanation": ai_explanation,
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
        explanation = local_chat_fallback(category_name)
        return {"explanation": explanation, "source": "fallback"}

    try:
        system_prompt = f"""
        You are "코미", the friendly PC hardware teacher for beginners.
        Explain the category: "{category_name}" (e.g., CPU, Graphics Card/GPU, Motherboard, RAM, SSD, Power Supply).
        Explain what it does using a very simple, beginner-friendly analogy:
        - CPU: 컴퓨터의 '두뇌'로 모든 연산과 계산 명령을 직접 제어해요. 🧠
        - GPU (그래픽카드): 화면을 화려하고 부드럽게 '그려주는 화가'예요. 🎮
        - Motherboard (메인보드): 부품들을 이어주는 '도로망/척추' 같은 역할을 해요. 🗺️
        - RAM (메모리): 작업을 올려두는 '책상 넓이'예요. 넓을수록 다중작업이 쉬워요. 📚
        - SSD (저장장치): 자료를 보관하는 '서랍장/서류캐비닛'이에요. 💾
        - Power Supply (파워): 부품들에게 밥(전기)을 주는 '심장/에너지 발전소'예요. ⚡
        - Use polite Korean and bright cute robot tones (🤖, ~해요, ~입니다).
        - Make it super easy to understand for absolute computer beginners!
        - Keep it under 3-4 sentences.
        """

        response = ai.models.generate_content(
            model='gemini-2.5-flash',
            contents=category_name,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt
            )
        )
        return {"explanation": response.text, "source": "gemini"}
    except Exception as e:
        print(f"Gemini Category Explanation Error: {e}")
        explanation = local_chat_fallback(category_name)
        return {
            "explanation": explanation,
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
                    model='gemini-2.5-flash',
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

@app.post('/api/find-menu')
async def find_menu(request: FindMenuRequest):
    utterance = request.utterance.strip().lower()
    
    # 1. Rule-based keyword matching (partial match or substring)
    matched_menus = []
    for menu in menu_map.get("menus", []):
        for keyword in menu.get("when", []):
            if keyword.lower() in utterance:
                matched_menus.append(menu)
                break  # match found for this menu, check next menu
                
    # Limit to 2 matched menus
    if matched_menus:
        return {
            "matched": True,
            "menus": [
                {
                    "name": m["name"],
                    "guide": m["guide"],
                    "deeplink": m["deeplink"]
                }
                for m in matched_menus[:2]
            ]
        }
        
    # 2. Fallback to LLM classifier if rule-based fails
    ai = get_gemini_client()
    if ai:
        try:
            menu_ids = [m["id"] for m in menu_map.get("menus", [])]
            prompt = f"""사용자의 질문을 분석하여 다음 컴퓨존 메뉴 ID 목록 중 가장 알맞은 메뉴 ID(최대 2개)를 찾아줘.
어떤 메뉴와도 일치하지 않거나 무의미한 입력이면 빈 리스트 []를 반환해.

사용자 질문: "{request.utterance}"

가능한 메뉴 ID 목록: {menu_ids}

각 메뉴의 설명:
{json.dumps([{ 'id': m['id'], 'name': m['name'], 'description': m['one_line'], 'keywords': m['when'] } for m in menu_map.get('menus', [])], ensure_ascii=False)}

응답은 반드시 아래 형식의 JSON 데이터 구조 하나만 반환해줘. 설명이나 주석은 절대 붙이지 마:
{{
  "menu_ids": ["matched_id1", "matched_id2"]
}}
"""
            response = ai.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "menu_ids": types.Schema(
                                type=types.Type.ARRAY,
                                items=types.Schema(type=types.Type.STRING)
                            )
                        },
                        required=["menu_ids"]
                    )
                )
            )
            data = json.loads(response.text)
            matched_ids = data.get("menu_ids", [])
            matched_menus = [m for m in menu_map.get("menus", []) if m["id"] in matched_ids]
            if matched_menus:
                return {
                    "matched": True,
                    "menus": [
                        {
                            "name": m["name"],
                            "guide": m["guide"],
                            "deeplink": m["deeplink"]
                        }
                        for m in matched_menus[:2]
                    ]
                }
        except Exception as e:
            print(f"Gemini menu lookup failed: {e}")
            
    # Return fallback
    fb = menu_map.get("fallback", {
        "message": "정확한 메뉴를 못 찾았어요. 원하시는 걸 조금만 더 알려주시거나, 상담사 연결을 도와드릴까요?",
        "action": "route_to_consult"
    })
    return {
        "matched": False,
        "message": fb.get("message"),
        "action": fb.get("action")
    }

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
    # Determine execution mode from environment
    is_prod = os.environ.get("FLASK_ENV") == "production" or os.environ.get("NODE_ENV") == "production" or os.environ.get("FASTAPI_ENV") == "production"
    # Railway가 주는 PORT 환경변수를 우선 사용, 없으면 로컬 기본값
    target_port = int(os.environ.get("PORT", 8000))
    
    print(f"Starting Compuzone FastAPI Backend (is_prod={is_prod}) on port {target_port}...")
    uvicorn.run("server:app", host='0.0.0.0', port=target_port, reload=not is_prod)

