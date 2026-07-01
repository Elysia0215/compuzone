/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { PRODUCT_CATALOG } from "./src/catalog.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-loaded Gemini client helper
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      console.log("Gemini API Client successfully initialized.");
    } catch (err) {
      console.error("Failed to initialize Gemini API Client:", err);
    }
  }
  return aiClient;
}

// ==========================================
// 1. INTENT ROUTER ENDPOINT
// ==========================================
app.post("/api/chat/classify", async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const ai = getGeminiClient();
  if (!ai) {
    // Graceful offline fallback based on basic keyword matching
    const msg = message.toLowerCase();
    let intent = "general";

    if (msg.includes("어디") || msg.includes("위치") || msg.includes("메뉴") || msg.includes("바로가기") || msg.includes("견적 어디서")) {
      intent = "menu";
    } else if (msg.includes("추천") || msg.includes("견적") || msg.includes("조립") || msg.includes("맞춤 pc") || msg.includes("컴퓨터 맞추")) {
      intent = "recommend";
    } else if (msg.includes("5060") || msg.includes("4070") || msg.includes("4060") || msg.includes("rtx") || msg.includes("ryzen") || msg.includes("라이젠") || msg.includes("i5") || msg.includes("i7") || msg.includes("인텔") || msg.includes("삼성 램") || msg.includes("990pro")) {
      intent = "product";
    } else if (msg.includes("cpu") || msg.includes("gpu") || msg.includes("메인보드") || msg.includes("메모리") || msg.includes("파워") || msg.includes("ssd") || msg.includes("품목") || msg.includes("부품이 뭐")) {
      intent = "category";
    } else if (msg.includes("상담") || msg.includes("사람") || msg.includes("직원") || msg.includes("상담사") || msg.includes("고객센터") || msg.includes("전화")) {
      intent = "counselor";
    } else if (msg.includes("as") || msg.includes("a/s") || msg.includes("보증") || msg.includes("고장") || msg.includes("수리") || msg.includes("as 언제까지")) {
      intent = "as";
    }

    return res.json({ intent, source: "fallback_rules" });
  }

  try {
    const systemPrompt = `
      You are an expert intent classifier for Compuzone (컴퓨존), a leading Korean PC & electronics shop chatbot named "Komi".
      Classify the user's message into EXACTLY one of these intents:
      - "menu": The user is searching for a menu, links, or asking "어디서 견적 짜나요?", "빠른 견적 어디에 있어요?".
      - "recommend": The user wants a product recommendation, computer custom build estimation, or mentions buying a complete set ("컴퓨터 하나 맞춰줘", "게임용 컴퓨터 추천", "견적 추천").
      - "product": The user is asking about a specific hardware product model (e.g., "RTX 5060 어때요?", "Ryzen 7500F 성능 괜찮나요?", "삼성 DDR5 램 질문이요").
      - "category": The user is asking general questions about a PC hardware category/item type (e.g., "CPU가 뭐예요?", "메인보드가 왜 필요한가요?").
      - "counselor": The user wants to talk to a human counselor or customer service (e.g., "사람이랑 얘기할래요", "상담원 연결해줘").
      - "as": The user is asking about warranty, repair, or A/S status (e.g., "내 PC A/S 언제까지예요?", "주문한 컴퓨터 고장난 것 같아요").
      - "general": Basic greetings, small talk, or general queries that don't fit above.

      Return a JSON object matching this structure:
      {
        "intent": "menu" | "recommend" | "product" | "category" | "counselor" | "as" | "general"
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: message,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: {
              type: Type.STRING,
              description: "The classified user intent name",
            },
          },
          required: ["intent"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    return res.json({ intent: parsed.intent || "general", source: "gemini" });
  } catch (error) {
    console.error("Gemini Intent Router Error:", error);
    return res.json({ intent: "general", source: "error_fallback" });
  }
});

// ==========================================
// 2. GENERAL CHAT (KOMI PERSONA) ENDPOINT
// ==========================================
app.post("/api/chat/general", async (req, res) => {
  const { messages } = req.body; // Array of { role: 'user'|'model', text: string }
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  const ai = getGeminiClient();
  if (!ai) {
    // Dynamic fallback offline greeting
    const lastMsg = messages[messages.length - 1]?.text || "";
    let reply = "안녕하세요! 컴퓨존의 귀여운 챗봇 코미예요! 🤖 현재 기본 모드로 동작 중입니다. 궁금한 점이 있으시다면 언제든 말씀해주세요!";
    if (lastMsg.includes("안녕")) {
      reply = "반가워요! 저는 컴퓨존의 마스코트 챗봇 코미입니다! 오늘도 행복한 하루 되세요. 💻 어떤 컴퓨터 부품이나 견적이 필요하신가요?";
    } else if (lastMsg.includes("고마워") || lastMsg.includes("감사")) {
      reply = "천만에요! 코미가 힘이 되었다니 기뻐요. 다른 컴퓨터 상담도 필요하시면 언제든 불러주세요! 🌟";
    }
    return res.json({ text: reply, source: "fallback" });
  }

  try {
    const chatHistory = messages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    }));

    const systemInstruction = `
      You are "코미" (Komi), the friendly and cute robotic mascot chatbot of Compuzone (컴퓨존), South Korea's number 1 computer store.
      - Keep your tone bright, cheerful, polite, and helpful (using polite Korean terms: "~해요", "~입니다!", "~지요").
      - You love computer hardware and understand everything about gaming, video editing, programming, AI, and office PCs.
      - Answer concisely (usually under 3-4 sentences) unless the user asks for a detailed explanation.
      - Do not break character. Use cute robotic gestures if appropriate like "🤖" or "반가워요!".
      - If users ask about complex configurations, direct them naturally to the dynamic PC recommendation flow (상품추천) or counselor connection (상담원 연결).
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: chatHistory,
      config: {
        systemInstruction,
      },
    });

    return res.json({ text: response.text, source: "gemini" });
  } catch (error) {
    console.error("Gemini General Chat Error:", error);
    return res.json({
      text: "죄송해요, 코미 회로에 잠깐 문제가 생긴 것 같아요! 잠시 후 다시 말씀해주실 수 있을까요? 🥺",
      source: "error",
    });
  }
});

// ==========================================
// 3. PC RECOMMENDATION RE-RECOMMEND LOOP
// ==========================================
app.post("/api/chat/recommend_feedback", async (req, res) => {
  const { userFeedback, currentSpecs, budget, usage } = req.body;

  const ai = getGeminiClient();

  // We provide a solid default list of changes even if offline
  const fallbackRevision = {
    title: "피드백 반영 실속 견적",
    price: Math.max(1000000, Math.min(2500000, (budget || 1500000) - 150000)),
    specs: {
      cpu: "AMD Ryzen 5 7500F",
      gpu: "MSI GeForce RTX 5060 (8GB)",
      ram: "Samsung DDR5 16GB",
      ssd: "Micron Crucial 500GB",
      power: "FSP HYPER K PRO 500W",
      mb: "MSI PRO H610M-E DDR4",
    },
    reason: `사용자님의 피드백 "${userFeedback}"을 반영하여 전력 효율이 우수한 RTX 5060 그래픽카드로 교체하고 메인보드를 효율적인 등급으로 조정하여 더 정교하게 다듬은 견적입니다!`,
  };

  if (!ai) {
    return res.json({ revised: fallbackRevision, source: "fallback" });
  }

  try {
    const systemInstruction = `
      You are "코미", the expert PC custom builder. The user wants to adjust their current PC build.
      Here is the Compuzone product catalog with real specs and prices:
      ${JSON.stringify(PRODUCT_CATALOG, null, 2)}

      Analyze the user's feedback: "${userFeedback}"
      Current specs: ${JSON.stringify(currentSpecs)}
      User purpose/usage: ${usage}
      User budget limit: ${budget} KRW (won)

      Adjust the parts appropriately.
      - If they ask for "더 저렴하게" (cheaper), downgrade GPU, CPU or SSD safely while preserving their primary usage.
      - If they ask for "더 높은 성능" (higher performance), upgrade CPU or GPU up to the limit of their budget.
      - If they ask for specific features (e.g. quiet, gaming performance, more RAM), make appropriate choices.
      
      You must return a revised JSON object matching this structure EXACTLY:
      {
        "title": "A short, engaging title for this revised build (e.g., '가성비 소음 억제 세트')",
        "price": number (Total calculated price of the parts in Korean Won, MUST be a number),
        "specs": {
          "cpu": "CPU model name",
          "gpu": "GPU model name",
          "ram": "RAM model name & capacity",
          "ssd": "SSD model name & capacity",
          "power": "Power supply model & wattage",
          "mb": "Motherboard model"
        },
        "reason": "Friendly explanation (in Korean, polite ~해요 style) of what changes were made and why this perfectly fits their feedback."
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `사용자 피드백: ${userFeedback}\n기존 견적: ${JSON.stringify(currentSpecs)}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            price: { type: Type.INTEGER },
            specs: {
              type: Type.OBJECT,
              properties: {
                cpu: { type: Type.STRING },
                gpu: { type: Type.STRING },
                ram: { type: Type.STRING },
                ssd: { type: Type.STRING },
                power: { type: Type.STRING },
                mb: { type: Type.STRING },
              },
              required: ["cpu", "gpu", "ram", "ssd", "power", "mb"],
            },
            reason: { type: Type.STRING },
          },
          required: ["title", "price", "specs", "reason"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    return res.json({ revised: parsed, source: "gemini" });
  } catch (error) {
    console.error("Gemini Re-recommend Feedback Error:", error);
    return res.json({ revised: fallbackRevision, source: "error" });
  }
});

// ==========================================
// 4. SPECIFIC PRODUCT QUESTION ENDPOINT
// ==========================================
app.post("/api/chat/query_product", async (req, res) => {
  const { productName } = req.body;
  if (!productName) {
    return res.status(400).json({ error: "Product name is required" });
  }

  // Find in our catalog
  const matchedProduct = PRODUCT_CATALOG.find(
    (p) =>
      p.name.toLowerCase().includes(productName.toLowerCase()) ||
      productName.toLowerCase().includes(p.id.split("-").pop() || "")
  );

  const ai = getGeminiClient();
  if (!ai) {
    if (matchedProduct) {
      return res.json({
        product: matchedProduct,
        aiExplanation: `해당 상품은 ${matchedProduct.description} 장단점으로는 ${matchedProduct.pros.join(", ")} 등이 있습니다.`,
        source: "catalog_fallback",
      });
    }
    return res.json({
      error: "상품을 찾을 수 없습니다.",
      source: "fallback",
    });
  }

  try {
    const systemPrompt = `
      You are "코미", the hardware advisor at Compuzone.
      The user is asking about: "${productName}"
      Here is our official product catalog data for matching if possible:
      ${JSON.stringify(PRODUCT_CATALOG, null, 2)}

      Explain the role of this hardware component inside a PC, what gaming performance can be expected (e.g. "롤, 발로란트에는 충분하지만 4K 영상 편집에는 아쉽습니다"), and provide a concise summary.
      - Answer in polite, friendly Korean. Keep it cute and cute robotic 🤖.
      - Keep it structured under 4 sentences.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: productName,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    return res.json({
      product: matchedProduct || {
        id: "custom",
        name: productName,
        category: "기타 부품",
        price: 0,
        specs: {},
        description: "사용자가 입력한 커스텀 제품 사양 질문입니다.",
        pros: ["기능성 우수"],
        cons: ["가격대 변동 가능"],
        recommendedUsers: ["해당 스펙이 꼭 필요한 실속 지향 유저"],
        stockStatus: "in_stock",
      },
      aiExplanation: response.text,
      source: "gemini",
    });
  } catch (error) {
    console.error("Gemini Query Product Error:", error);
    return res.json({
      product: matchedProduct || { name: productName, price: 0, specs: {} },
      aiExplanation: "이 제품은 뛰어난 컴퓨터 속도와 퍼포먼스를 내는 고품질 하드웨어 부품 중 하나예요! 상세한 문의는 코미 고객센터를 이용해주시면 친절히 가이드 해드릴게요. 🤖",
      source: "error",
    });
  }
});

// ==========================================
// 5. CATEGORY QUESTIONS ENDPOINT
// ==========================================
app.post("/api/chat/query_category", async (req, res) => {
  const { categoryName } = req.body;
  if (!categoryName) {
    return res.status(400).json({ error: "Category is required" });
  }

  const ai = getGeminiClient();
  if (!ai) {
    let explanation = "컴퓨터를 조립하기 위해 꼭 필요한 핵심 부품 부류 중 하나예요!";
    if (categoryName.toLowerCase().includes("cpu")) {
      explanation = "CPU는 컴퓨터의 '두뇌' 역할을 해요! 모든 명령어 계산을 처리하고 전반적인 연산 속도를 결정하는 핵심 부품이랍니다. 🧠";
    } else if (categoryName.toLowerCase().includes("gpu") || categoryName.toLowerCase().includes("그래픽")) {
      explanation = "그래픽카드(GPU)는 게임 화면이나 고화질 영상을 모니터에 예쁘고 부드럽게 '그려주는' 역할을 담당해요! 🎮";
    } else if (categoryName.toLowerCase().includes("메인보드") || categoryName.toLowerCase().includes("mb")) {
      explanation = "메인보드는 모든 부품(CPU, 램, 그래픽카드 등)들이 서로 연결되어 대화할 수 있게 도와주는 '도시의 도로망' 같은 부품이에요! 🗺️";
    } else if (categoryName.toLowerCase().includes("램") || categoryName.toLowerCase().includes("메모리") || categoryName.toLowerCase().includes("ram")) {
      explanation = "메모리(RAM)는 컴퓨터가 현재 실행하고 있는 프로그램들이 작업 공간으로 쓰는 '책상 넓이'예요! 책상이 넓을수록 여러 일(멀티태스킹)을 동시에 잘한답니다. 📚";
    }

    return res.json({ explanation, source: "fallback" });
  }

  try {
    const systemPrompt = `
      You are "코미", the friendly PC hardware teacher for beginners.
      Explain the category: "${categoryName}" (e.g., CPU, Graphics Card/GPU, Motherboard, RAM, SSD, Power Supply).
      Explain what it does using a very simple, beginner-friendly analogy (like "CPU is the brain", "RAM is the desk size", "Motherboard is the roads").
      - Use polite Korean and bright cute robot tones (🤖, 🧠, 🎮 etc).
      - Make it super easy to understand for absolute computer beginners!
      - Keep it under 3-4 sentences.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: categoryName,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    return res.json({ explanation: response.text, source: "gemini" });
  } catch (error) {
    console.error("Gemini Category Explanation Error:", error);
    return res.json({
      explanation: "이 품목은 시스템 작동 시 데이터 신호를 유기적으로 가공하는 매우 핵심적인 파츠예요! 🤖",
      source: "error",
    });
  }
});

// ==========================================
// VITE DEV SERVER OR STATIC SERVING MIDDLEWARE
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev middleware successfully integrated.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
