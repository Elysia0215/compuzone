# server.py
# A lightweight Flask-based backend server replacing server.ts

import os
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from catalog import PRODUCT_CATALOG

# Load environment variables from .env.local first, then .env
load_dotenv('.env.local')
load_dotenv('.env')

app = Flask(__name__, static_folder='dist', static_url_path='')
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
# Pydantic Schemas for Gemini Structured JSON Outputs
# ----------------------------------------------------
class ClassifyResponse(BaseModel):
    intent: str = Field(description="The classified user intent name: 'menu', 'recommend', 'product', 'category', 'counselor', 'as', or 'general'")

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

# ==========================================
# 1. INTENT ROUTER ENDPOINT
# ==========================================
@app.route('/api/chat/classify', methods=['POST'])
def classify():
    data = request.get_json() or {}
    message = data.get("message")
    if not message:
        return jsonify({"error": "Message is required"}), 400

    ai = get_gemini_client()
    if not ai:
        # Graceful offline fallback based on basic keyword matching
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

        return jsonify({"intent": intent, "source": "fallback_rules"})

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
        return jsonify({"intent": intent, "source": "gemini"})
    except Exception as e:
        print(f"Gemini Intent Router Error: {e}")
        return jsonify({"intent": "general", "source": "error_fallback"})

# ==========================================
# 2. GENERAL CHAT (KOMI PERSONA) ENDPOINT
# ==========================================
@app.route('/api/chat/general', methods=['POST'])
def general():
    data = request.get_json() or {}
    messages = data.get("messages")
    if not messages or not isinstance(messages, list):
        return jsonify({"error": "Messages array is required"}), 400

    ai = get_gemini_client()
    if not ai:
        # Dynamic fallback offline greeting
        last_msg = messages[-1].get("text", "") if messages else ""
        reply = "안녕하세요! 컴퓨존의 귀여운 챗봇 코미예요! 🤖 현재 기본 모드로 동작 중입니다. 궁금한 점이 있으시다면 언제든 말씀해주세요!"
        if "안녕" in last_msg:
            reply = "반가워요! 저는 컴퓨존의 마스코트 챗봇 코미입니다! 오늘도 행복한 하루 되세요. 💻 어떤 컴퓨터 부품이나 견적이 필요하신가요?"
        elif "고마워" in last_msg or "감사" in last_msg:
            reply = "천만에요! 코미가 힘이 되었다니 기뻐요. 다른 컴퓨터 상담도 필요하시면 언제든 불러주세요! 🌟"
        return jsonify({"text": reply, "source": "fallback"})

    try:
        # Convert conversation history to Gemini content structure
        chat_history = []
        for msg in messages:
            role = "user" if msg.get("role") == "user" else "model"
            chat_history.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg.get("text", ""))]
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
        return jsonify({"text": response.text, "source": "gemini"})
    except Exception as e:
        print(f"Gemini General Chat Error: {e}")
        return jsonify({
            "text": "죄송해요, 코미 회로에 잠깐 문제가 생긴 것 같아요! 잠시 후 다시 말씀해주실 수 있을까요? 🥺",
            "source": "error"
        })

# ==========================================
# 3. PC RECOMMENDATION RE-RECOMMEND LOOP
# ==========================================
@app.route('/api/chat/recommend_feedback', methods=['POST'])
def recommend_feedback():
    data = request.get_json() or {}
    user_feedback = data.get("userFeedback", "")
    current_specs = data.get("currentSpecs", {})
    budget = data.get("budget", 1500000)
    usage = data.get("usage", "")

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
        return jsonify({"revised": fallback_revision, "source": "fallback"})

    try:
        import json
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
        return jsonify({"revised": revised, "source": "gemini"})
    except Exception as e:
        print(f"Gemini Re-recommend Feedback Error: {e}")
        return jsonify({"revised": fallback_revision, "source": "error"})

# ==========================================
# 4. SPECIFIC PRODUCT QUESTION ENDPOINT
# ==========================================
@app.route('/api/chat/query_product', methods=['POST'])
def query_product():
    data = request.get_json() or {}
    product_name = data.get("productName")
    if not product_name:
        return jsonify({"error": "Product name is required"}), 400

    # Search in our catalog
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
            return jsonify({
                "product": matched_product,
                "aiExplanation": ai_explanation,
                "source": "catalog_fallback"
            })
        return jsonify({
            "error": "상품을 찾을 수 없습니다.",
            "source": "fallback"
        })

    try:
        import json
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

        return jsonify({
            "product": res_product,
            "aiExplanation": response.text,
            "source": "gemini"
        })
    except Exception as e:
        print(f"Gemini Query Product Error: {e}")
        res_product = matched_product or {"name": product_name, "price": 0, "specs": {}}
        return jsonify({
            "product": res_product,
            "aiExplanation": "이 제품은 뛰어난 컴퓨터 속도와 퍼포먼스를 내는 고품질 하드웨어 부품 중 하나예요! 상세한 문의는 코미 고객센터를 이용해주시면 친절히 가이드 해드릴게요. 🤖",
            "source": "error"
        })

# ==========================================
# 5. CATEGORY QUESTIONS ENDPOINT
# ==========================================
@app.route('/api/chat/query_category', methods=['POST'])
def query_category():
    data = request.get_json() or {}
    category_name = data.get("categoryName")
    if not category_name:
        return jsonify({"error": "Category is required"}), 400

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

        return jsonify({"explanation": explanation, "source": "fallback"})

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
        return jsonify({"explanation": response.text, "source": "gemini"})
    except Exception as e:
        print(f"Gemini Category Explanation Error: {e}")
        return jsonify({
            "explanation": "이 품목은 시스템 작동 시 데이터 신호를 유기적으로 가공하는 매우 핵심적인 파츠예요! 🤖",
            "source": "error"
        })

# ==========================================
# STATIC FILES SERVING & SPA ROUTING MIDDLEWARE
# ==========================================
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    # Static build folder path: dist/
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    # Determine execution mode from environment
    is_prod = os.environ.get("FLASK_ENV") == "production" or os.environ.get("NODE_ENV") == "production"
    # Port selection: Default to 8000 for local API backend in dev
    # If in production, bind to port 3000 to match the original layout
    target_port = 3000 if is_prod else 8000
    
    print(f"Starting Compuzone Python Backend (is_prod={is_prod}) on port {target_port}...")
    app.run(host='0.0.0.0', port=target_port, debug=not is_prod)
