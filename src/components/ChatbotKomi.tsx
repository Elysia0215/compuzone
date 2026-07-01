/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Message, Product, CustomEstimate, ASOrder, AppNotification } from "../types";
import { PRODUCT_CATALOG } from "../catalog";
import { Send, Menu, X, ArrowLeft, RefreshCw, ShoppingCart, UserCheck, MessageSquare, ChevronRight, Clock, ShieldCheck, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ChatbotKomiProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (item: Product | CustomEstimate) => void;
  onOpenCart: () => void;
  onViewProductDetail: (productName: string) => void;
  activeNotification: AppNotification | null;
  onClearNotification: () => void;
  onTriggerIncompleteEstimate: () => void;
  onOpenCartFromNotif: () => void;
}

// ----------------------------------------------------
// Dummy Orders for Flow 6 (A/S Warranty Status Check)
// ----------------------------------------------------
const DUMMY_ORDERS: ASOrder[] = [
  {
    orderId: "CPZ-20250715-9981",
    orderDate: "2025-07-15",
    productName: "조립PC 게이밍 마스터패키지 (Ryzen 7500F + RTX 5060)",
    purchasePrice: 1250000,
    warrantyExpiry: "2026-07-14", // Current local date is June 30, 2026. This leaves 14 days!
    warrantyStatus: "active",
    monthsLeft: 0, // D-14!
  },
  {
    orderId: "CPZ-20241020-4123",
    orderDate: "2024-10-20",
    productName: "ASUS ROG Strix 게이밍 모니터 27인치",
    purchasePrice: 420000,
    warrantyExpiry: "2025-10-19",
    warrantyStatus: "expired",
    monthsLeft: -8,
  }
];

export default function ChatbotKomi({
  isOpen,
  onClose,
  onAddToCart,
  onOpenCart,
  onViewProductDetail,
  activeNotification,
  onClearNotification,
  onTriggerIncompleteEstimate,
  onOpenCartFromNotif,
}: ChatbotKomiProps) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputText, setInputText] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // ----------------------------------------------------
  // Flow State Tracking
  // ----------------------------------------------------
  const [flowState, setFlowState] = React.useState<{
    currentFlow: "none" | "menu" | "recommend" | "product" | "category" | "counselor" | "as";
    step: number;
    usage?: string;
    detail?: string;
    budget?: number;
    priority?: string;
    reRecCount: number;
    lastGeneratedSpecs?: any;
    selectedOrder?: ASOrder;
  }>({
    currentFlow: "none",
    step: 0,
    reRecCount: 0,
  });

  // Counselors Queue State
  const [counselorQueue, setCounselorQueue] = React.useState<{
    active: boolean;
    queueNum: number;
    waitTime: number;
  }>({
    active: false,
    queueNum: 2,
    waitTime: 1,
  });

  // A/S Ticket Submit Form State
  const [asTicket, setAsTicket] = React.useState({
    issueType: "하드웨어 불량",
    details: "",
    address: "서울특별시 마포구 백범로 31",
    submitted: false,
  });

  // Scroll to bottom helper
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Handle active notifications targeting flows
  React.useEffect(() => {
    if (activeNotification && isOpen) {
      handleNotificationAction(activeNotification);
      onClearNotification();
    }
  }, [activeNotification, isOpen]);

  // ----------------------------------------------------
  // Initialize Welcome Message
  // ----------------------------------------------------
  const initChat = () => {
    setMessages([
      {
        id: "welcome-1",
        sender: "bot",
        text: "안녕하세요!\n컴퓨존 맞춤 상담 비서 코미(Komi)예요! 🤖",
        timestamp: new Date(),
        type: "text",
      },
    ]);
    setFlowState({
      currentFlow: "none",
      step: 0,
      reRecCount: 0,
    });
  };

  React.useEffect(() => {
    if (isOpen && messages.length === 0) {
      initChat();
    }
  }, [isOpen]);

  const addBotMessage = (msg: Omit<Message, "id" | "sender" | "timestamp">) => {
    setMessages((prev) => [
      ...prev,
      {
        ...msg,
        id: `bot-msg-${Date.now()}-${Math.random()}`,
        sender: "bot",
        timestamp: new Date(),
      },
    ]);
  };

  const addUserMessage = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `user-msg-${Date.now()}`,
        sender: "user",
        text,
        timestamp: new Date(),
        type: "text",
      },
    ]);
  };

  // ----------------------------------------------------
  // Notification Router Actions
  // ----------------------------------------------------
  const handleNotificationAction = (notif: AppNotification) => {
    if (notif.type === "as_expiry") {
      addUserMessage("내 PC A/S 기간 조회해줘 (알림 확인)");
      startAsFlow();
    } else if (notif.type === "incomplete_estimate") {
      addUserMessage("만들던 조립 PC 견적 이어서 볼래요");
      // Resume recommendation flow
      setFlowState({
        currentFlow: "recommend",
        step: 3, // Go straight to budget slider step
        usage: "게임",
        detail: "배그",
        reRecCount: 0,
      });
      addBotMessage({
        text: "이어서 게임용 PC 조립 견적을 생성해 드릴게요! 🎮\n아래 슬라이더를 통해 원하시는 예산 범위를 조절해 주세요.",
        type: "options", // Render slider dynamically below
      });
    } else if (notif.type === "cart_abandoned") {
      addUserMessage("내 장바구니 목록 확인해볼래");
      onOpenCartFromNotif();
    } else if (notif.type === "restock") {
      addUserMessage("RTX 5060 스펙 설명 부탁해");
      querySpecificProduct("RTX 5060");
    } else if (notif.type === "first_visit") {
      addUserMessage("맞춤 조립 PC 추천받기");
      startRecommendationFlow();
    }
  };

  // ----------------------------------------------------
  // FLOW ①: Menu Finder (Deep Links)
  // ----------------------------------------------------
  const handleMenuFinder = (keyword: string) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);

      let targetMenu = "간편 조립 견적";
      let menuId = "quick-estimate";
      let text = `&quot;${keyword}&quot; 메뉴를 찾으시는군요!\n컴퓨존의 해당 서비스 위치를 바로 찾아드릴게요! 🚀`;

      if (keyword.includes("AS") || keyword.includes("고장") || keyword.includes("수리")) {
        targetMenu = "A/S 안심케어 서비스";
        menuId = "as-center";
      } else if (keyword.includes(" FAQ") || keyword.includes("자주 묻는")) {
        targetMenu = "상담 FAQ 백과";
        menuId = "category-guide";
      } else if (keyword.includes("입고") || keyword.includes("재입고")) {
        targetMenu = "전체 부품 카탈로그";
        menuId = "catalog-all";
      }

      addBotMessage({
        text,
        type: "deep_link",
        deepLink: {
          label: `${targetMenu} 바로가기 🔗`,
          url: `#${menuId}`,
          menuId,
        },
      });
    }, 600);
  };

  // ----------------------------------------------------
  // FLOW ②: PC Recommendation Core Flow
  // ----------------------------------------------------
  const startRecommendationFlow = () => {
    setFlowState({
      currentFlow: "recommend",
      step: 1,
      reRecCount: 0,
    });
    addBotMessage({
      text: "스마트 맞춤 PC 견적 추천을 진행할게요! 🤖✨\n먼저 컴퓨터를 주로 어떤 용도로 사용하시나요?",
      type: "options",
      options: [
        { label: "🎮 게임용 (Gaming)", action: "rec_usage_game" },
        { label: "🎬 영상 편집/그래픽", action: "rec_usage_edit" },
        { label: "💻 프로그래밍/코딩", action: "rec_usage_code" },
        { label: "🧠 AI 연구/러닝", action: "rec_usage_ai" },
        { label: "📁 사무용/기본 문서", action: "rec_usage_office" },
      ],
    });
  };

  const handleRecUsage = (usageLabel: string, action: string) => {
    addUserMessage(usageLabel);

    let usageKey = "게임";
    let botFeedback = "";
    let options: { label: string; action: string }[] = [];

    if (action === "rec_usage_game") {
      usageKey = "게임";
      botFeedback = "게임이면 역시 화면을 매끄럽게 그리는 그래픽카드(GPU) 영향도가 제일 커요! 🎮 주로 즐기시는 게임 부류를 선택해 주세요.";
      options = [
        { label: "롤/발로란트 (캐주얼)", action: "rec_game_lol" },
        { label: "배틀그라운드 (FPS급)", action: "rec_game_pubg" },
        { label: "스팀 AAA급 최고사양", action: "rec_game_steam" },
        { label: "직접 입력할래요", action: "rec_game_custom" },
      ];
    } else if (action === "rec_usage_edit") {
      usageKey = "영상편집";
      botFeedback = "영상 편집 및 그래픽 작업은 대용량 파일 가공이 많아 RAM 용량과 고성능 CPU의 멀티코어가 무척 중요해요! 🎬";
      options = [
        { label: "FHD 유튜브 편집", action: "rec_edit_fhd" },
        { label: "4K 전문 시네마틱 편집", action: "rec_edit_4k" },
        { label: "3D 그래픽/블렌더", action: "rec_edit_3d" },
      ];
    } else if (action === "rec_usage_code") {
      usageKey = "프로그래밍";
      botFeedback = "개발 환경에서는 다량의 라이브러리 빌드와 멀티 인프라 가상화 구동을 위해 고속 SSD 속도와 넉넉한 RAM이 뒷받침되어야 해요! 💻";
      options = [
        { label: "웹 퍼블리싱/프론트엔드", action: "rec_code_web" },
        { label: "모바일 앱/백엔드 서버", action: "rec_code_app" },
        { label: "대규모 컨테이너/인프라", action: "rec_code_infra" },
      ];
    } else if (action === "rec_usage_ai") {
      usageKey = "AI";
      botFeedback = "AI 학습 및 드로잉 모델(Stable Diffusion) 구동에는 무엇보다 쿠다 코어(CUDA)가 탑재된 고용량 VRAM 그래픽카드가 핵심 파츠입니다! 🧠";
      options = [
        { label: "Stable Diffusion 생성 모델", action: "rec_ai_image" },
        { label: "딥러닝 알고리즘 학습", action: "rec_ai_learn" },
      ];
    } else {
      usageKey = "사무용";
      botFeedback = "사무용 및 기본 문서 작업은 고주사율 램과 소형 SSD 장착만으로도 충분히 시원시원하고 부드러운 속도를 만끽하실 수 있답니다! 📁";
      options = [
        { label: "기본 오피스/인터넷 웹 서핑", action: "rec_office_basic" },
        { label: "대용량 엑셀/다중 모니터 사무", action: "rec_office_pro" },
      ];
    }

    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setFlowState((prev) => ({
        ...prev,
        step: 2,
        usage: usageKey,
      }));

      addBotMessage({
        text: botFeedback,
        type: "options",
        options,
      });
    }, 600);
  };

  const handleRecDetail = (detailLabel: string, action: string) => {
    addUserMessage(detailLabel);

    let feedback = "";
    if (action.includes("pubg")) {
      feedback = "배그는 플레이 특성상 프레임 방어가 중요해 CPU의 3D L3 캐시(예: 라이젠 3D V-Cache) 스펙이 아주 절실한 타이틀이에요! 🔫";
    } else if (action.includes("steam")) {
      feedback = "AAA급 고사양 패키지 게임은 광원 추적(Ray Tracing) 기법 때문에 최신 RTX 그래픽카드의 힘이 대단히 많이 필요합니다! 🚀";
    } else if (action.includes("4k")) {
      feedback = "4K 해상도는 FHD 대비 데이터 부하가 4배에 달해 무조건 최하 32GB 이상 메모리 구성을 가야 버벅임이 없답니다. 📽️";
    } else {
      feedback = "훌륭한 선택이십니다! 최상의 호환성과 실속 위주 파츠로 가닥을 잡아드릴게요. ✨";
    }

    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setFlowState((prev) => ({
        ...prev,
        step: 3,
        detail: detailLabel,
      }));

      addBotMessage({
        text: `${feedback}\n\n자, 다음은 조립 PC에 희망하시는 최대 예산을 설정해 볼까요? (100만원 ~ 250만원)`,
        type: "options", // Slider component will render
      });
    }, 600);
  };

  const handleRecBudget = (budgetWon: number) => {
    addUserMessage(`예산: ${(budgetWon / 10000).toLocaleString()}만원`);

    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setFlowState((prev) => ({
        ...prev,
        step: 4,
        budget: budgetWon,
      }));

      addBotMessage({
        text: "거의 완료되었습니다!\n마지막으로 이번 견적에서 가장 중점적으로 생각하시는 구매 우선순위를 정해주세요!",
        type: "options",
        options: [
          { label: "💰 가성비 (최소 단가 위주 실속)", action: "rec_prior_budget" },
          { label: "⭐ 균형 (성능과 예산 합리적 조화)", action: "rec_prior_balanced" },
          { label: "🚀 성능 (예산 한도 내 최대 하이엔드)", action: "rec_prior_perf" },
        ],
      });
    }, 600);
  };

  const handleRecPriority = (priorLabel: string, action: string) => {
    addUserMessage(priorLabel);

    let priorityKey = "균형";
    if (action.includes("budget")) priorityKey = "가성비";
    if (action.includes("perf")) priorityKey = "성능";

    setFlowState((prev) => ({
      ...prev,
      priority: priorityKey,
    }));

    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setFlowState((prev) => ({
        ...prev,
        step: 5, // Triggers custom loader
      }));

      // In 2.5 seconds, display the 3 proposal cards!
      setTimeout(() => {
        generatePCProposals(flowState.budget || 1500000, priorityKey, flowState.usage || "게임", flowState.detail || "배그");
      }, 2500);
    }, 400);
  };

  // ----------------------------------------------------
  // PC Estimate Cards Generator (P0 Core)
  // ----------------------------------------------------
  const generatePCProposals = (budgetVal: number, prior: string, usage: string, detail: string) => {
    setFlowState((prev) => ({
      ...prev,
      step: 6,
    }));

    // Find parts from PRODUCT_CATALOG
    const parts = {
      cpuCheap: PRODUCT_CATALOG.find((p) => p.id === "cpu-ryzen-7500f")!,
      cpuIntel: PRODUCT_CATALOG.find((p) => p.id === "cpu-intel-14400f")!,
      cpuHigh: PRODUCT_CATALOG.find((p) => p.id === "cpu-ryzen-7800x3d")!,
      gpuCheap: PRODUCT_CATALOG.find((p) => p.id === "gpu-rtx-5060")!,
      gpuMid: PRODUCT_CATALOG.find((p) => p.id === "gpu-rtx-4060ti")!,
      gpuHigh: PRODUCT_CATALOG.find((p) => p.id === "gpu-rtx-4070s")!,
      ram: PRODUCT_CATALOG.find((p) => p.id === "ram-samsung-16g")!,
      ssd: PRODUCT_CATALOG.find((p) => p.id === "ssd-samsung-990pro")!,
      power: PRODUCT_CATALOG.find((p) => p.id === "power-classic-700w")!,
      mb: PRODUCT_CATALOG.find((p) => p.id === "mb-asrock-b650m")!,
    };

    // Construct 3 distinct configurations (가성비, 균형, 성능)
    const options = [
      {
        id: "est-cheap",
        title: `⚡ 알뜰 가성비 세팅 (${usage} - ${detail})`,
        price: 1050000,
        specs: {
          cpu: parts.cpuCheap.name,
          gpu: parts.gpuCheap.name,
          ram: `${parts.ram.name} (16GB)`,
          ssd: "Micron Crucial 고속 SSD 500GB",
          power: "Micronix 500W 정격 파워",
          mb: "MSI PRO H610M 메인보드",
        },
        reason: "예산을 대폭 세이브하면서 성능과 부품 효율성을 극대화한 실속 가득 입문용 구성입니다."
      },
      {
        id: "est-balanced",
        title: `⭐ 황금 밸런스 균형 세팅 (${usage} - ${detail})`,
        price: 1540000,
        specs: {
          cpu: parts.cpuIntel.name,
          gpu: parts.gpuMid.name,
          ram: `${parts.ram.name} (16GB x 2)`,
          ssd: parts.ssd.name,
          power: parts.power.name,
          mb: "ASUS B760M 게이밍 메인보드",
        },
        reason: "예산선에 정확히 대응하며 장기 사용 시 스로틀링이나 호온성 트러블이 전혀 없는 표준 탑-클래스 구성입니다."
      },
      {
        id: "est-perf",
        title: `🚀 익스트림 울트라 성능 세팅 (${usage} - ${detail})`,
        price: 2190000,
        specs: {
          cpu: parts.cpuHigh.name,
          gpu: parts.gpuHigh.name,
          ram: `${parts.ram.name} (32GB 듀얼채널)`,
          ssd: parts.ssd.name,
          power: parts.power.name,
          mb: parts.mb.name,
        },
        reason: "선택된 목적 하에서 타협 없는 하이엔드 게이밍 및 고부하 작업을 초고프레임으로 압살할 수 있는 종결급 조합입니다."
      }
    ];

    addBotMessage({
      text: `짠! 사용자님의 용도(${usage}) 및 예산(${ (budgetVal / 10000).toLocaleString()}만원) 맞춤 분석을 마쳤어요! 🤖\n아래 3가지 컴퓨존 엄선 제안서 중 원하시는 패키지를 탭하여 세부 내역을 확인하고 장바구니에 바로 담으실 수 있답니다.`,
      type: "recommend_results",
      data: options,
    });
  };

  // ----------------------------------------------------
  // FLOW ② RE-RECOMMENDATION LOOP WITH GEMINI (P0 Core)
  // ----------------------------------------------------
  const handleAskReRecommendation = (originalSpec: any) => {
    // Open re-recommendation feedback input screen in flow
    setFlowState((prev) => ({
      ...prev,
      step: 7, // Re-rec feedback wait state
      lastGeneratedSpecs: originalSpec,
    }));

    addBotMessage({
      text: "견적 보완 의견을 적어주시면 AI 코미가 실시간으로 부품을 전면 재조정해 드릴게요! 🔄\n원하시는 개선 요구 사항을 아래 입력창에 타이핑하시거나 퀵 버튼을 선택해 주세요.",
      type: "options",
      options: [
        { label: "📉 단가를 더 저렴하게 낮춰줘", action: "rerec_cheaper" },
        { label: "🚀 프레임 성능을 더 끌어올려줘", action: "rerec_powerful" },
        { label: "🤍 화이트 LED 감성 파츠로 꾸며줘", action: "rerec_white" },
        { label: "🤫 소음이 가장 적은 조용한 PC로!", action: "rerec_silent" },
      ],
    });
  };

  const submitReRecommendationFeedback = (feedbackText: string) => {
    if (flowState.reRecCount >= 3) {
      addBotMessage({
        text: "코미가 3회 연속으로 의견을 가다듬어 드렸어요! 🤖💦\n현재 선택하신 목적과 예산 내에서 최적의 호환을 뽐내는 최종 설계는 바로 직전 견적서입니다. 마음에 드신 구성 패키지를 장바구니에 바로 담아보세요!",
        type: "text",
      });
      return;
    }

    addUserMessage(feedbackText);
    setIsTyping(true);

    // Call express backend to trigger server-side Gemini
    fetch("/api/chat/recommend_feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userFeedback: feedbackText,
        currentSpecs: flowState.lastGeneratedSpecs,
        budget: flowState.budget,
        usage: flowState.usage,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        setIsTyping(false);
        const revised: CustomEstimate = data.revised;

        setFlowState((prev) => ({
          ...prev,
          reRecCount: prev.reRecCount + 1,
          step: 8, // Showing dynamic Gemini revision
        }));

        addBotMessage({
          text: `사용자님의 보완 의견 [${feedbackText}]을 적극 수용하여, AI 코미가 실시간으로 세밀하게 가다듬은 특별 리비전 견적서입니다! 🔄 (조정 횟수: ${flowState.reRecCount + 1}/3)`,
          type: "parts_info",
          data: {
            id: `revised-${Date.now()}`,
            name: revised.title,
            price: revised.price,
            specs: revised.specs,
            description: revised.reason,
            pros: ["사용자 피드백 전면 반영 맞춤 조율"],
            cons: ["특정 브랜드 교체로 가격 변동"],
            recommendedUsers: ["보완 요구사항을 즉각 적용받길 희망한 오너"],
          },
        });
      })
      .catch((err) => {
        console.error(err);
        setIsTyping(false);
        // Fallback card
        addBotMessage({
          text: "리비전 로직 중 네트워크 전송 지연이 발생했으나 가용 가능한 파츠로 조율된 대안 견적입니다.",
          type: "text",
        });
      });
  };

  // ----------------------------------------------------
  // FLOW ③: Specific Product Question (RTX 5060, etc.)
  // ----------------------------------------------------
  const querySpecificProduct = (productName: string) => {
    setIsTyping(true);
    setFlowState((prev) => ({
      ...prev,
      currentFlow: "product",
    }));

    fetch("/api/chat/query_product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productName }),
    })
      .then((res) => res.json())
      .then((data) => {
        setIsTyping(false);
        if (data.error) {
          addBotMessage({
            text: "죄송해요, 해당 모델은 컴퓨존 카탈로그에 상세 스펙이 등록되지 않았어요. 다른 모델명을 알려주실 수 있나요? 🥺",
            type: "text",
          });
        } else {
          addBotMessage({
            text: data.aiExplanation,
            type: "product_info",
            data: data.product,
          });
        }
      })
      .catch((err) => {
        console.error(err);
        setIsTyping(false);
      });
  };

  // ----------------------------------------------------
  // FLOW ④: Category / Part Question (CPU, etc.)
  // ----------------------------------------------------
  const queryCategoryInfo = (categoryName: string) => {
    setIsTyping(true);
    setFlowState((prev) => ({
      ...prev,
      currentFlow: "category",
    }));

    fetch("/api/chat/query_category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryName }),
    })
      .then((res) => res.json())
      .then((data) => {
        setIsTyping(false);
        addBotMessage({
          text: `${data.explanation}\n\n부품에 대해 조금 이해가 가셨나요? 그럼 이 지식을 토대로 바로 사용자님께 최적화된 맞춤 PC 추천(Flow ②)을 받아보실까요?`,
          type: "options",
          options: [
            { label: "🚀 컴퓨존 스마트 PC 맞춤 견적 시작하기", action: "rec_start_direct" },
            { label: "🏠 처음 메뉴로 돌아가기", action: "go_home_back" },
          ],
        });
      })
      .catch((err) => {
        console.error(err);
        setIsTyping(false);
      });
  };

  // ----------------------------------------------------
  // FLOW ⑤: Counselor Connection Setup (Fallback/Request)
  // ----------------------------------------------------
  const startCounselorFlow = () => {
    setFlowState((prev) => ({
      ...prev,
      currentFlow: "counselor",
      step: 1,
    }));
    addBotMessage({
      text: "전문 상담사 연결 허브입니다! 🤖👔\n신속하고 완벽한 답변을 위해 어떤 업무 카테고리의 전문 기술지원이 필요하신가요?",
      type: "options",
      options: [
        { label: "💳 구매 및 결제 문의", action: "counsel_purch" },
        { label: "🔧 A/S 기술 접수 및 수리 문의", action: "counsel_as" },
        { label: "⚙️ 대량 견적 및 기업용 납품", action: "counsel_corp" },
      ],
    });
  };

  const handleCounselorType = (label: string) => {
    addUserMessage(label);

    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setFlowState((prev) => ({
        ...prev,
        step: 2,
      }));

      addBotMessage({
        text: `[${label}] 전담 상담 라인업이 준비되어 있습니다.\n가장 원하시는 연결 방식을 하단 탭에서 택해 주세요!`,
        type: "counselor_choices",
      });
    }, 600);
  };

  const handleJoinLiveChatQueue = () => {
    addUserMessage("실시간 채팅 상담 대기열 신청");
    setCounselorQueue({
      active: true,
      queueNum: 2,
      waitTime: 1,
    });

    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      addBotMessage({
        text: "실시간 상담 대기열이 등록되었습니다. 잠시만 대기해 주세요! 🧑‍💻",
        type: "text",
      });

      // Simple simulator ticking waitlist down in 10 seconds
      setTimeout(() => {
        setCounselorQueue((prev) => ({
          ...prev,
          queueNum: 1,
        }));
        setTimeout(() => {
          setCounselorQueue((prev) => ({
            ...prev,
            queueNum: 0,
            waitTime: 0,
          }));
          addBotMessage({
            text: "대기 완료! 전문 상담사가 매칭되었습니다. 지금 바로 하단 대화창에서 원활한 기술 지원을 받으실 수 있습니다!",
            type: "text",
          });
        }, 8000);
      }, 8000);
    }, 600);
  };

  // ----------------------------------------------------
  // FLOW ⑥: A/S Warranty Status Check (Logged In DB Integration)
  // ----------------------------------------------------
  const startAsFlow = () => {
    setFlowState((prev) => ({
      ...prev,
      currentFlow: "as",
      step: 1,
    }));

    addBotMessage({
      text: "홍길동 고객님의 실시간 결제 데이터와 연동된 정품 보증(Warranty) 내역 목록입니다.\nA/S 안심 점검 조회를 원하시는 주문 번호를 선택해 주세요! 🛡️",
      type: "options",
      options: DUMMY_ORDERS.map((order) => ({
        label: `${order.productName} (주문일: ${order.orderDate})`,
        action: `as_order_${order.orderId}`,
      })),
    });
  };

  const handleSelectAsOrder = (orderId: string) => {
    const order = DUMMY_ORDERS.find((o) => o.orderId === orderId)!;
    addUserMessage(`${order.productName} 보증 조회`);

    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setFlowState((prev) => ({
        ...prev,
        step: 2,
        selectedOrder: order,
      }));

      addBotMessage({
        text: `선택하신 조립PC 상품의 정밀 보증 상세 정보입니다! 🛡️`,
        type: "as_info",
        data: order,
      });
    }, 600);
  };

  const handleRequestAsVisit = () => {
    // Open out-of-office A/S request form in flow
    setFlowState((prev) => ({
      ...prev,
      step: 3,
    }));
    setAsTicket((prev) => ({ ...prev, submitted: false }));
    addBotMessage({
      text: "출장 보증 A/S 현장 점검 신청서 접수를 도와드릴게요!\n현장 수리 기사님의 방문 배정을 위해 아래 상세 사유 양식을 작성해 주세요.",
      type: "text",
    });
  };

  const submitAsTicketForm = () => {
    setAsTicket((prev) => ({ ...prev, submitted: true }));
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setFlowState((prev) => ({
        ...prev,
        step: 4,
      }));

      addBotMessage({
        text: `성공적으로 접수되었습니다! 🎉\n\n[출장 점검 신청 내역]\n● 고장 유형: ${asTicket.issueType}\n● 세부 내용: ${asTicket.details || "사전 안심 자가 점검 완료"}\n● 방문 주소: ${asTicket.address}\n\n등록하신 연락처로 배정 완료 알림톡이 전송됩니다. 영업일 기준 24시간 이내 기사님이 직접 방문 드릴 예정입니다!`,
        type: "options",
        options: [{ label: "🏠 메인 화면으로", action: "go_home_back" }],
      });
    }, 1200);
  };

  // ----------------------------------------------------
  // General Input Submission & Gemini Intent Routing
  // ----------------------------------------------------
  const handleSendText = () => {
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText("");
    addUserMessage(text);

    // If waiting for custom re-recommendation feedback
    if (flowState.currentFlow === "recommend" && flowState.step === 7) {
      submitReRecommendationFeedback(text);
      return;
    }

    // Default processing through Gemini Intent Router
    setIsTyping(true);
    fetch("/api/chat/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    })
      .then((res) => res.json())
      .then((data) => {
        const intent = data.intent;

        if (intent === "menu") {
          handleMenuFinder(text);
        } else if (intent === "recommend") {
          setIsTyping(false);
          startRecommendationFlow();
        } else if (intent === "product") {
          querySpecificProduct(text);
        } else if (intent === "category") {
          queryCategoryInfo(text);
        } else if (intent === "counselor") {
          setIsTyping(false);
          startCounselorFlow();
        } else if (intent === "as") {
          setIsTyping(false);
          startAsFlow();
        } else {
          // General chat fallback
          // Map local messages to backend-friendly layout
          const history = messages
            .filter((m) => m.type === "text")
            .map((m) => ({
              role: m.sender === "user" ? "user" : "model",
              text: m.text,
            }));
          history.push({ role: "user", text });

          fetch("/api/chat/general", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: history }),
          })
            .then((r) => r.json())
            .then((genRes) => {
              setIsTyping(false);
              addBotMessage({
                text: genRes.text,
                type: "text",
              });
            })
            .catch(() => {
              setIsTyping(false);
              addBotMessage({
                text: "반가워요! 컴퓨존 챗봇 코미입니다! 혹시 컴퓨터 조립 견적이나 부품 수리 A/S 보증에 대해 궁금하신가요? 🤖",
                type: "text",
              });
            });
        }
      })
      .catch((err) => {
        console.error(err);
        setIsTyping(false);
        addBotMessage({
          text: "코미가 말을 잘 이해하지 못했어요. '상품 추천', 'A/S 조회', '상담사 연결' 등을 말해 보실래요? 🤖",
          type: "text",
        });
      });
  };

  // Options bubble handler inside chat
  const handleOptionClick = (label: string, action: string) => {
    if (action.startsWith("rec_usage_")) {
      handleRecUsage(label, action);
    } else if (action.startsWith("rec_game_") || action.startsWith("rec_edit_") || action.startsWith("rec_code_") || action.startsWith("rec_ai_") || action.startsWith("rec_office_")) {
      handleRecDetail(label, action);
    } else if (action.startsWith("rec_prior_")) {
      handleRecPriority(label, action);
    } else if (action === "rec_start_direct") {
      addUserMessage("PC 맞춤 추천 시작");
      startRecommendationFlow();
    } else if (action.startsWith("as_order_")) {
      const orderId = action.replace("as_order_", "");
      handleSelectAsOrder(orderId);
    } else if (action.startsWith("rerec_")) {
      let text = "단가를 더 저렴하게";
      if (action === "rerec_powerful") text = "프레임을 더 강력하게 올려줘";
      if (action === "rerec_white") text = "화이트 LED 감성 조립 파츠로 적용해줘";
      if (action === "rerec_silent") text = "소음 억제 명품 저소음 세팅으로 바꿀래";
      submitReRecommendationFeedback(text);
    } else if (action === "counsel_purch" || action === "counsel_as" || action === "counsel_corp") {
      handleCounselorType(label);
    } else if (action === "go_home_back") {
      addUserMessage("홈 메뉴로 돌아갈래");
      initChat();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.95 }}
          className="fixed bottom-6 right-6 z-50 w-full max-w-[420px] h-[640px] bg-slate-50 rounded-3xl overflow-hidden shadow-2xl border border-slate-200/60 flex flex-col"
          id="chatbot-komi-panel"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white px-5 py-4 flex items-center justify-between shadow-md" id="chat-header">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center border border-white/20 shadow">
                  <span className="text-xl">🤖</span>
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-blue-700 animate-pulse"></span>
              </div>
              <div>
                <h3 className="font-extrabold text-sm tracking-tight flex items-center gap-1.5">
                  컴퓨존 챗봇 코미
                  <span className="bg-blue-600/60 text-[9px] font-bold px-1.5 py-0.5 rounded border border-white/10 uppercase">AI Bot</span>
                </h3>
                <p className="text-[10px] text-blue-100 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-emerald-300" /> 실시간 보증·견적 연동 중
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={initChat}
                className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer"
                title="대화 초기화"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer"
                id="chatbot-close-x-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Waitlist Queue Banner (Flow 5) */}
          {counselorQueue.active && counselorQueue.queueNum > 0 && (
            <div className="bg-amber-50 border-b border-amber-100 text-amber-800 px-4 py-2 text-xs font-semibold flex items-center justify-between animate-pulse">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                상담사 연결 대기 중 (현재 대기 번호: {counselorQueue.queueNum}번, 예상 대기: {counselorQueue.waitTime}분)
              </span>
              <button
                onClick={() => setCounselorQueue({ active: false, queueNum: 2, waitTime: 1 })}
                className="text-amber-500 hover:text-rose-600 font-bold text-[10px]"
              >
                취소
              </button>
            </div>
          )}

          {/* Messages Feed Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef} id="chat-feed">
            {/* Robot Welcome Mascot (Renders at start of chat list) */}
            {messages.length <= 2 && (
              <div className="flex flex-col items-center justify-center text-center py-6 bg-white rounded-2xl border border-slate-100/80 shadow-sm p-4 mx-2">
                {/* Visual Character Illustration */}
                <div className="relative w-28 h-28 bg-gradient-to-b from-blue-50 to-indigo-50 rounded-full border border-blue-100 flex items-center justify-center shadow-inner mb-3">
                  <div className="w-20 h-20 bg-slate-100 rounded-3xl border-2 border-slate-200/60 shadow flex flex-col items-center justify-center p-2 relative">
                    {/* Head casing */}
                    <div className="w-14 h-10 bg-white rounded-2xl border-2 border-slate-200 shadow-inner flex items-center justify-center gap-1.5 relative">
                      {/* Ears */}
                      <span className="absolute -left-2 top-2 w-2 h-4 bg-blue-500 rounded"></span>
                      <span className="absolute -right-2 top-2 w-2 h-4 bg-blue-500 rounded"></span>
                      {/* LED Eyes */}
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border border-emerald-500 shadow animate-pulse"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border border-emerald-500 shadow animate-pulse"></span>
                    </div>
                    {/* Body casing */}
                    <div className="w-12 h-8 bg-slate-50 border border-slate-200 rounded-xl mt-1.5 flex items-center justify-center relative">
                      <span className="text-[10px] font-black text-blue-600">C</span>
                    </div>
                  </div>
                </div>

                <h4 className="font-extrabold text-slate-800 text-sm">안녕하세요! 저는 컴퓨존의 코미예요</h4>
                <p className="text-[11px] text-slate-500 mt-1 max-w-[280px]">
                  맞춤형 조립 PC 견적 짜기, 특정 하드웨어 스펙 비교, 정품 A/S 보증기한 조회까지 모두 가능하답니다!
                </p>
              </div>
            )}

            {/* Render message stack */}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                {/* Robot Icon for Bot */}
                {msg.sender === "bot" && (
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex-shrink-0 flex items-center justify-center text-sm shadow">
                    🤖
                  </div>
                )}

                <div className="max-w-[78%] flex flex-col gap-2">
                  {/* Chat speech bubble */}
                  {msg.text && (
                    <div
                      className={`p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-line shadow-sm border ${
                        msg.sender === "user"
                          ? "bg-blue-600 text-white border-blue-700 rounded-tr-none"
                          : "bg-white text-slate-800 border-slate-100 rounded-tl-none"
                      }`}
                    >
                      {msg.text}
                    </div>
                  )}

                  {/* FLOW ①: Deep Link Card */}
                  {msg.type === "deep_link" && msg.deepLink && (
                    <div className="bg-white border border-slate-100 rounded-2xl p-3.5 shadow-md text-center max-w-sm mt-1">
                      <p className="text-[11px] text-slate-500 mb-2.5">찾으시는 메뉴로 바로 딥링크 이동하세요!</p>
                      <a
                        href={msg.deepLink.url}
                        className="inline-block w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow transition-colors cursor-pointer"
                        id={`deep-link-${msg.deepLink.menuId}`}
                      >
                        {msg.deepLink.label}
                      </a>
                    </div>
                  )}

                  {/* Options List (Q1, Q2, etc.) */}
                  {msg.type === "options" && msg.options && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {msg.options.map((opt, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleOptionClick(opt.label, opt.action)}
                          className="bg-white hover:bg-blue-50 border border-slate-100 hover:border-blue-200 text-slate-700 hover:text-blue-700 font-bold py-2.5 px-4 rounded-xl text-xs text-left transition-all shadow-sm cursor-pointer"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Slider option container (Q3 Budget Setup) */}
                  {flowState.currentFlow === "recommend" && flowState.step === 3 && msg.id === messages[messages.length - 1]?.id && (
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-md max-w-sm mt-1">
                      <div className="flex items-center justify-between text-xs font-extrabold text-slate-400 uppercase mb-2">
                        <span>견적 세팅 진행도</span>
                        <span className="text-blue-600">75% (3/4 단계)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full mb-4 overflow-hidden">
                        <div className="bg-blue-600 h-full w-[75%] rounded-full"></div>
                      </div>

                      <div className="flex items-center justify-between font-bold text-xs text-slate-700 mb-2">
                        <span>희망 예산 설정</span>
                        <span className="text-sm font-black text-blue-600">
                          {((flowState.budget || 1500000) / 10000).toLocaleString()}만원
                        </span>
                      </div>

                      <input
                        type="range"
                        min="1000000"
                        max="2500000"
                        step="50000"
                        value={flowState.budget || 1500000}
                        onChange={(e) => setFlowState((p) => ({ ...p, budget: Number(e.target.value) }))}
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
                        id="budget-range-slider"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 font-bold mt-1">
                        <span>100만원</span>
                        <span>175만원</span>
                        <span>250만원</span>
                      </div>

                      <button
                        onClick={() => handleRecBudget(flowState.budget || 1500000)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs mt-4 shadow-md cursor-pointer transition-colors"
                        id="budget-confirm-btn"
                      >
                        예산 확정하기 💳
                      </button>
                    </div>
                  )}

                  {/* Flow 2: Proposals Cards Grid */}
                  {msg.type === "recommend_results" && msg.data && (
                    <div className="flex flex-col gap-4 mt-2 max-w-sm">
                      {msg.data.map((spec: any, idx: number) => (
                        <div key={idx} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-md flex flex-col">
                          <div className={`p-3 text-white font-extrabold text-xs flex justify-between items-center ${
                            idx === 0 ? "bg-emerald-600" : idx === 1 ? "bg-blue-600" : "bg-purple-700"
                          }`}>
                            <span>{spec.title}</span>
                            <span className="bg-white/20 px-2 py-0.5 rounded uppercase text-[9px]">
                              {idx === 0 ? "가성비" : idx === 1 ? "균형" : "최고성능"}
                            </span>
                          </div>

                          <div className="p-4 space-y-2.5">
                            <div className="text-slate-800 text-xs font-semibold leading-relaxed border-b border-slate-50 pb-2.5">
                              {spec.reason}
                            </div>

                            {/* Specifications breakdown */}
                            <div className="space-y-1 text-[11px] text-slate-600 border-b border-slate-50 pb-2.5">
                              <div className="flex justify-between">
                                <span className="font-bold text-slate-400">CPU</span>
                                <span className="font-semibold text-slate-800 text-right line-clamp-1 max-w-[180px]" title={spec.specs.cpu}>{spec.specs.cpu}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-bold text-slate-400">GPU</span>
                                <span className="font-semibold text-slate-800 text-right line-clamp-1 max-w-[180px]" title={spec.specs.gpu}>{spec.specs.gpu}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-bold text-slate-400">메모리</span>
                                <span className="font-semibold text-slate-800 text-right line-clamp-1 max-w-[180px]">{spec.specs.ram}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-bold text-slate-400">저장장치</span>
                                <span className="font-semibold text-slate-800 text-right line-clamp-1 max-w-[180px]">{spec.specs.ssd}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-bold text-slate-400">메인보드</span>
                                <span className="font-semibold text-slate-800 text-right line-clamp-1 max-w-[180px]">{spec.specs.mb}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-bold text-slate-400">전원파워</span>
                                <span className="font-semibold text-slate-800 text-right line-clamp-1 max-w-[180px]">{spec.specs.power}</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between font-black text-slate-900 text-sm border-b border-slate-50 pb-3">
                              <span>총 조립 단가액</span>
                              <span className="text-base text-blue-600">₩{spec.price.toLocaleString()}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-2">
                              <button
                                onClick={() => handleAskReRecommendation(spec)}
                                className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold py-2 rounded-lg text-[10px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                id={`rerec-btn-${spec.id}`}
                              >
                                <RefreshCw className="w-3.5 h-3.5" /> AI 피드백 수정
                              </button>
                              <button
                                onClick={() => {
                                  onAddToCart(spec);
                                  onClose();
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-[10px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                                id={`add-cart-spec-btn-${spec.id}`}
                              >
                                <ShoppingCart className="w-3.5 h-3.5" /> 장바구니 담기
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Flow 3: Product Info Detail Summary Card */}
                  {msg.type === "product_info" && msg.data && (
                    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-lg max-w-sm mt-1">
                      <div className="aspect-video bg-slate-100 relative">
                        <img
                          src={msg.data.imageUrl || "https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=600&q=80"}
                          alt={msg.data.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute left-3 top-3 bg-slate-900/80 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                          {msg.data.category}
                        </span>
                      </div>

                      <div className="p-4 space-y-3">
                        <h4 className="font-bold text-slate-800 text-xs leading-snug">
                          {msg.data.name}
                        </h4>
                        <p className="text-sm font-black text-slate-900">
                          ₩{msg.data.price.toLocaleString()}
                        </p>

                        {/* Pros / Cons lines */}
                        <div className="space-y-2 text-[10px] border-t border-slate-50 pt-2.5">
                          <div className="text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1.5 rounded-lg">
                            <span className="font-bold">장점:</span> {msg.data.pros[0]}
                          </div>
                          <div className="text-rose-700 font-semibold bg-rose-50 px-2.5 py-1.5 rounded-lg">
                            <span className="font-bold">단점:</span> {msg.data.cons[0]}
                          </div>
                          <div className="text-slate-600 font-medium border border-slate-100 p-2 rounded-lg">
                            <span className="font-bold text-blue-600">추천 고객:</span> {msg.data.recommendedUsers[0]}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 border-t border-slate-50 pt-3 mt-2">
                          <button
                            onClick={() => onViewProductDetail(msg.data.name)}
                            className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold py-2 rounded-lg text-[10px] transition-colors cursor-pointer"
                          >
                            상세스펙 전체보기
                          </button>
                          <button
                            onClick={() => {
                              onAddToCart(msg.data);
                              onClose();
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer shadow"
                            id={`add-product-chat-btn-${msg.data.id}`}
                          >
                            장바구니 담기
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Flow 6: A/S Info Card */}
                  {msg.type === "as_info" && msg.data && (
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-lg max-w-sm mt-1 space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-50 pb-2.5">
                        <span className="text-[10px] font-bold text-slate-400">주문코드: {msg.data.orderId}</span>
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> 보증 가능
                        </span>
                      </div>

                      <div className="space-y-1 text-xs">
                        <h4 className="font-extrabold text-slate-800 text-sm leading-snug">{msg.data.productName}</h4>
                        <div className="flex justify-between text-slate-500 mt-2">
                          <span>구매 일자:</span>
                          <span className="font-medium text-slate-800">{msg.data.orderDate}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>보증 기한:</span>
                          <span className="font-medium text-slate-800">{msg.data.warrantyExpiry}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>보증 잔여 기간:</span>
                          <span className="font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">D-14! (14일 남음)</span>
                        </div>
                      </div>

                      <div className="bg-slate-50 rounded-xl p-3 text-[10px] text-slate-500 leading-relaxed border border-slate-100">
                        <span className="font-bold text-slate-700 block mb-1">🛡️ 안심 하드웨어 출장 혜택 안내</span>
                        기어, 팬 불량, 소음 트러블 및 CPU 발열 무상 정밀 점검이 가능합니다. 지금 바로 출장 방문 신청을 제출하세요!
                      </div>

                      <button
                        onClick={handleRequestAsVisit}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs shadow cursor-pointer transition-colors"
                        id="as-visit-request-btn"
                      >
                        출장 보증 A/S 현장 점검 신청 🔧
                      </button>
                    </div>
                  )}

                  {/* Flow 6: Out-of-office A/S request Form */}
                  {flowState.currentFlow === "as" && flowState.step === 3 && msg.id === messages[messages.length - 1]?.id && (
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-lg max-w-sm mt-1 space-y-3 text-xs">
                      <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-1">
                        <span>📝</span> 출장 점검 접수 대장
                      </h4>

                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">고장 증상 분류</label>
                        <select
                          value={asTicket.issueType}
                          onChange={(e) => setAsTicket((p) => ({ ...p, issueType: e.target.value }))}
                          className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-2 text-xs text-slate-700 outline-none"
                          id="as-issue-type-select"
                        >
                          <option value="하드웨어 불량">하드웨어 불량 (화면 꺼짐, 무반응)</option>
                          <option value="소음 및 발열">소음 및 극심한 열화 현상</option>
                          <option value="블루스크린 오류">지속적인 블루스크린 코드 다운</option>
                          <option value="기타 단순 문의">부품 교체 및 기타 공임 대행</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">상세 고장 사유</label>
                        <textarea
                          placeholder="배틀그라운드를 켜면 5분 만에 꺼지고 블루스크린이 발생해요..."
                          value={asTicket.details}
                          onChange={(e) => setAsTicket((p) => ({ ...p, details: e.target.value }))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-700 outline-none h-16 resize-none"
                          id="as-details-textarea"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">기사 방문 주소</label>
                        <input
                          type="text"
                          value={asTicket.address}
                          onChange={(e) => setAsTicket((p) => ({ ...p, address: e.target.value }))}
                          className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-2 text-xs text-slate-700 outline-none"
                          id="as-address-input"
                        />
                      </div>

                      <button
                        onClick={submitAsTicketForm}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs shadow cursor-pointer transition-colors"
                        id="as-form-submit-btn"
                      >
                        출장 접수 기사 배정 신청하기 ✅
                      </button>
                    </div>
                  )}

                  {/* Flow 5: Counselor Channels Card */}
                  {msg.type === "counselor_choices" && (
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-lg max-w-sm mt-1 space-y-2.5">
                      <button
                        onClick={handleJoinLiveChatQueue}
                        className="w-full bg-yellow-400 hover:bg-yellow-300 text-slate-900 font-extrabold py-3 rounded-xl text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                        id="live-chat-queue-btn"
                      >
                        💬 카카오 상담 / 대기열 신청하기
                      </button>
                      <a
                        href="tel:1588-XXXX"
                        onClick={() => addUserMessage("고객센터 전화 연결 확인")}
                        className="w-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                        id="counsel-call-link"
                      >
                        📞 고객센터 직통 전화 (1588-XXXX)
                      </a>
                      <button
                        onClick={() => handleOptionClick("홈 메뉴로 돌아갈래", "go_home_back")}
                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2 rounded-xl text-xs transition-colors cursor-pointer"
                      >
                        🏠 처음으로 돌아가기
                      </button>
                    </div>
                  )}

                  {/* Flow 2: Gemini Revised Custom Specs Card */}
                  {msg.type === "parts_info" && msg.data && (
                    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-lg max-w-sm mt-1">
                      <div className="p-3 bg-gradient-to-r from-blue-700 to-indigo-800 text-white font-extrabold text-xs flex items-center justify-between">
                        <span>🔄 AI 리비전 맞춤형 조립 PC</span>
                        <span className="bg-white/20 px-1.5 py-0.5 rounded text-[9px] uppercase">Revised</span>
                      </div>

                      <div className="p-4 space-y-3">
                        <div className="text-slate-700 text-xs font-semibold leading-relaxed border-b border-slate-50 pb-2.5">
                          {msg.data.description}
                        </div>

                        {/* Specs */}
                        <div className="space-y-1 text-[11px] text-slate-600 border-b border-slate-50 pb-2.5">
                          {Object.entries(msg.data.specs).map(([key, val]: any) => (
                            <div key={key} className="flex justify-between">
                              <span className="font-bold text-slate-400 uppercase">{key}</span>
                              <span className="font-semibold text-slate-800 text-right line-clamp-1 max-w-[180px]">{val}</span>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between font-black text-slate-900 text-sm border-b border-slate-50 pb-2.5">
                          <span>최종 실속 총액</span>
                          <span className="text-base text-blue-600">₩{msg.data.price.toLocaleString()}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <button
                            onClick={() => handleAskReRecommendation(msg.data)}
                            className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold py-2 rounded-lg text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                            id="rerec-rerec-btn"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> 추가 피드백 보완
                          </button>
                          <button
                            onClick={() => {
                              onAddToCart(msg.data);
                              onClose();
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                            id="rerec-add-cart-btn"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" /> 장바구니 담기
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing Loader dots */}
            {isTyping && (
              <div className="flex gap-2.5 justify-start items-center">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex-shrink-0 flex items-center justify-center text-sm shadow animate-bounce">
                  🤖
                </div>
                <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none p-3 shadow-sm max-w-[70%] text-xs flex items-center gap-2 text-slate-500">
                  <span className="font-medium text-[11px]">코미 생각 회로 가동 중</span>
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                </div>
              </div>
            )}

            {/* Analysis custom loading screens (Flow 2 step 5) */}
            {flowState.currentFlow === "recommend" && flowState.step === 5 && (
              <div className="flex flex-col items-center justify-center text-center p-6 bg-white rounded-2xl border border-slate-100 shadow-md">
                <div className="w-12 h-12 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin mb-3"></div>
                <h5 className="font-extrabold text-slate-800 text-xs">사용 패턴 및 예산 정밀 분석 중...</h5>
                <p className="text-[10px] text-slate-400 mt-1">
                  AI 코미 회로가 카탈로그를 탐색하여 호환 등급 1등급 조합을 추출하고 있습니다.
                </p>
                <div className="mt-4 text-xs font-black text-blue-600 animate-pulse bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                  컴퓨존 최상위 부품 실시간 검색 중
                </div>
              </div>
            )}
          </div>

          {/* SUGGESTION QUICK LAUNCH BUBBLES IN FOOTER */}
          {messages.length > 0 && flowState.currentFlow === "none" && (
            <div className="px-3 py-2 bg-slate-100/60 border-t border-slate-200 overflow-x-auto whitespace-nowrap flex gap-1.5" id="suggest-quick-rail">
              <button
                onClick={() => {
                  addUserMessage("맞춤 PC 추천해줘");
                  startRecommendationFlow();
                }}
                className="inline-block bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 font-bold px-3 py-1.5 rounded-full text-[10px] cursor-pointer"
              >
                🎮 PC 견적 추천
              </button>
              <button
                onClick={() => {
                  addUserMessage("내 PC A/S 보증기한 알려줘");
                  startAsFlow();
                }}
                className="inline-block bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 font-bold px-3 py-1.5 rounded-full text-[10px] cursor-pointer"
              >
                🛡️ 무상 A/S 조회
              </button>
              <button
                onClick={() => {
                  addUserMessage("상담사 연결 원해요");
                  startCounselorFlow();
                }}
                className="inline-block bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 font-bold px-3 py-1.5 rounded-full text-[10px] cursor-pointer"
              >
                👔 상담사 연결
              </button>
              <button
                onClick={() => handleMenuFinder("빠른 견적 어디서 해요?")}
                className="inline-block bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 font-bold px-3 py-1.5 rounded-full text-[10px] cursor-pointer"
              >
                📍 견적 메뉴 찾기
              </button>
            </div>
          )}

          {/* Bottom Chat Input Field Bar */}
          <div className="bg-white border-t border-slate-200 p-3 flex items-center gap-2" id="chat-input-row">
            <button
              onClick={() => {
                addUserMessage("처음 홈 메뉴로 돌아가줘");
                initChat();
              }}
              className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-colors cursor-pointer"
              title="메인 홈 가기"
            >
              <Menu className="w-5 h-5" />
            </button>
            <input
              type="text"
              placeholder={
                flowState.currentFlow === "recommend" && flowState.step === 7
                  ? "추가할 보완 사항을 자유롭게 적어주세요..."
                  : "궁금한 내용을 여기에 입력해 주세요..."
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendText()}
              className="flex-1 h-10 px-4 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white text-slate-800 transition-all"
              id="chatbot-text-input"
            />
            <button
              onClick={handleSendText}
              className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md cursor-pointer transition-transform duration-100 hover:scale-105"
              id="chatbot-send-btn"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
