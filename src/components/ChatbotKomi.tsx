/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Message, Product, CustomEstimate, ASOrder, AppNotification } from "../types";
import { PRODUCT_CATALOG } from "../catalog";
import { Send, Menu, X, ArrowLeft, RefreshCw, ShoppingCart, UserCheck, MessageSquare, ChevronRight, Clock, ShieldCheck, CheckCircle2, Maximize2, Minimize2, Save } from "lucide-react";
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
  const [selectedDetails, setSelectedDetails] = React.useState<string[]>([]);
  const [customDetailInput, setCustomDetailInput] = React.useState("");
  const [showCustomInput, setShowCustomInput] = React.useState(false);
  const [activeRecommendTab, setActiveRecommendTab] = React.useState<number>(1);
  const [counselorStage, setCounselorStage] = React.useState<number>(0);
  const [isMaximized, setIsMaximized] = React.useState(false);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = React.useState(false);
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
        text: "안녕하세요! 컴퓨존 맞춤 상담 비서 코미(Komi)예요! 🤖\n\n아래 서비스 중 원하시는 메뉴를 선택하시거나, 궁금한 점을 채팅창에 자유롭게 입력해 주세요.",
        timestamp: new Date(),
        type: "options",
        options: [
          { label: "🎮 스마트 맞춤 PC 견적 추천", action: "rec_start_direct" },
          { label: "🛡️ 정품/무상 A/S 보증기한 조회", action: "as_start_direct" },
          { label: "👔 전문 기술 상담사 실시간 연결", action: "counsel_start_direct" },
          { label: "📍 컴퓨존 빠른 견적 메뉴 찾기", action: "menu_start_direct" },
        ],
      },
    ]);
    setFlowState({
      currentFlow: "none",
      step: 0,
      reRecCount: 0,
    });
    setCounselorQueue({
      active: false,
      queueNum: 2,
      waitTime: 1,
    });
    setCounselorStage(0);
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
    
    // Quick handle for static greeting menu options without backend calls to speed up
    if (keyword === "빠른 견적 어디서 해요?" || keyword.includes("빠른 견적") || keyword.includes("메뉴 찾기") || keyword.includes("견적 메뉴")) {
      setTimeout(() => {
        setIsTyping(false);
        addBotMessage({
          text: "컴퓨존에는 고객님의 용도와 구매 방식에 맞춘 다양한 **맞춤형 빠른 견적 서비스**가 준비되어 있어요! 🤖\n아래 상황 중 **원하는 행동을 선택해 주세요.**\n\n만약 목록에 없는 다른 원하시는 행동이 있다면 채팅창에 직접 말씀해 주셔도 제가 친절히 찾아드릴게요! 💬",
          type: "options",
          options: [
            { label: "💵 타사 견적을 올리고 더 할인받고 싶어요", action: "menu_opt_discount" },
            { label: "🏢 단체/기업으로 대량 견적이 필요해요", action: "menu_opt_bulk" },
            { label: "📦 인기 가격대/용도별 추천 완제 PC를 원해요", action: "menu_opt_easy" },
            { label: "🔧 부품들을 직접 골라 조합하고 싶어요", action: "menu_opt_diy" },
            { label: "🧠 생성형 AI/CAD 개발용 전문 PC를 찾아요", action: "menu_opt_ai" },
            { label: "🖥️ 기업용/서버(Server) 시스템 견적이 필요해요", action: "menu_opt_server" },
          ],
        });
      }, 600);
      return;
    }

    // Call /api/find-menu backend routing mapping
    fetch("/api/find-menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utterance: keyword }),
    })
      .then((res) => res.json())
      .then((data) => {
        setIsTyping(false);
        if (data.matched) {
          addBotMessage({
            text: `"${keyword}" 상황에 꼭 맞는 컴퓨존의 추천 서비스 페이지를 찾아왔어요! 🚀`,
            type: "deep_link",
            data: data.menus,
          });
        } else {
          addBotMessage({
            text: data.message || "정확한 메뉴를 찾지 못했습니다.",
            type: "options",
            options: [
              { label: "👤 전문 상담사 연결하기", action: "counselor_redirect" },
              { label: "🔄 다시 검색하기", action: "menu_opt_retry" },
            ],
          });
        }
      })
      .catch((err) => {
        console.error("Failed to find menu:", err);
        setIsTyping(false);
        addBotMessage({
          text: "서버 연결에 실패하여 메뉴 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
          type: "options",
          options: [
            { label: "👤 전문 상담사 연결하기", action: "counselor_redirect" },
            { label: "🔄 다시 검색하기", action: "menu_opt_retry" },
          ],
        });
      });
  };
  

  const handleMenuSelection = (label: string, action: string) => {
    addUserMessage(label);
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      
      let targetMenu = "";
      let menuId = "";
      let descText = "";
      let targetUrl = "";
      
      if (action === "menu_opt_discount") {
        targetMenu = "맞춰줘 가격";
        menuId = "discount-pc";
        targetUrl = "https://www.compuzone.co.kr/get_price/get_price.htm?bannerid=GNBBannerGetPrice#apply_sec";
        descText = "타 사이트에서 받으신 조립PC 견적서를 첨부하면 컴퓨존의 전문가가 검토하여 추가로 할인된 가격을 제안해 드리는 **'맞춰줘 가격'** 메뉴를 추천해 드려요! 오늘주문 오늘발송 및 컴퓨존의 확실한 교환·반품 A/S를 보증합니다. 🛠️";
      } else if (action === "menu_opt_bulk") {
        targetMenu = "대량구매 견적";
        menuId = "bulk-order";
        targetUrl = "https://www.compuzone.co.kr/cscenter/bulk_purchase.htm?bannerid=GNBBannerBulkPurchase";
        descText = "회사, 학교 등 단체 구매 고객을 위한 전용 견적 채널인 **'대량구매 견적'** 서비스입니다. 신청 사양을 미리 장바구니에 담아 신청하면 담당자 배정 및 실시간 검토 상태가 업데이트되며 카카오톡 알림을 드립니다. 📦";
      } else if (action === "menu_opt_easy") {
        targetMenu = "간편 조립PC 견적";
        menuId = "easy-pc";
        targetUrl = "https://www.compuzone.co.kr/estimate/choose.htm?bannerid=GNBBannerEstimate";
        descText = "사무용, 게이밍, 영상편집 등 원하는 가격대와 용도별로 가장 밸런스 높게 미리 짜여진 인기 완제 PC들을 한눈에 확인하고 일부 부품을 간편하게 커스텀하여 구매할 수 있는 **'간편 조립PC 견적'** 메뉴를 추천합니다! ⚡";
      } else if (action === "menu_opt_diy") {
        targetMenu = "직접 견적담기";
        menuId = "diy-pc";
        targetUrl = "https://www.compuzone.co.kr/online/online_main.htm?bannerid=GNBBannerOnlineMain";
        descText = "CPU, 메인보드, 그래픽카드 등을 직접 필터링하여 호환성을 검사해가며 직접 PC를 빌드하시는 분들을 위한 **'직접 견적담기'** 메뉴를 추천해 드려요! (초보자분들은 챗봇의 '스마트 맞춤 PC 견적 추천'으로 가이드라인을 얻으신 뒤 교체해 보시는 것을 추천합니다. 💡)";
      } else if (action === "menu_opt_ai") {
        targetMenu = "AI 데스크탑 라인업";
        menuId = "ai-desktop";
        targetUrl = "https://www.compuzone.co.kr/event_zone/eventzone_view.htm?bannerid=GNBBannerAIPC&EventNo=60921";
        descText = "생성형 AI/LLM 개발, 3D 렌더링/CAD 설계, 데이터 연구 및 딥러닝 학습 등 고성능 전문 머신러닝 작업에 최적화된 입문형/실무형/전문가형 워크스테이션을 바로 추천받는 **'AI 데스크탑 추천 (AI 탭)'** 메뉴를 추천해 드려요! 🧠";
      } else if (action === "menu_opt_server") {
        targetMenu = "빠른 서버 견적내기";
        menuId = "server-pc";
        targetUrl = "https://www.compuzone.co.kr/estimate/estimate_server.htm?bannerid=GNBBannerEstimateServer";
        descText = "일반용 PC가 아닌, 기업용 서버 시스템 구축을 위해 CPU 코어 수, 메모리, 저장장치, OS 라이선스 등을 단계별 가이드에 맞춰 손쉽게 커스텀하고 예상 수량 견적을 계산할 수 있는 **'빠른 서버 견적내기'** 전용 메뉴를 추천합니다. 🖥️";
      }
      
      addBotMessage({
        text: descText,
        type: "deep_link",
        deepLink: {
          label: `${targetMenu} 바로가기 🔗`,
          url: targetUrl,
          menuId,
        },
      });
    }, 600);
  };

    const getLivePerformancePreview = (val: number, isGame: boolean) => {
    if (val < 1000000) {
      return {
        rating: "가성비 알뜰 구성",
        score: "★☆☆☆☆"
      };
    } else if (val < 1400000) {
      return {
        rating: "밸런스 실속 구성",
        score: "★★★☆☆"
      };
    } else if (val < 1800000) {
      return {
        rating: "인기 강추 국민 균형",
        score: "★★★★☆"
      };
    } else if (val < 2200000) {
      return {
        rating: "고사양 든든 정복",
        score: "★★★★★"
      };
    } else {
      return {
        rating: "끝판왕 하이엔드 정점",
        score: "👑 최상급"
      };
    }
  };

  const getLivePerformanceLabel = (budget: number, usage: string | undefined, detail: string | undefined) => {
    const b = budget || 1500000;
    const isGame = usage === "게임";
    const name = detail || "";

    if (isGame) {
      const items = name.split(",").map(x => x.trim());
      let results: string[] = [];

      const hasCasual = items.some(x => x.includes("롤") || x.includes("발로란트") || x.includes("캐주얼"));
      const hasHeavy = items.some(x => x.includes("배틀그라운드") || x.includes("오버워치") || x.includes("로스트아크") || x.includes("FPS"));
      const hasAAA = items.some(x => x.includes("스팀") || x.includes("최고사양") || x.includes("패키지"));

      if (hasCasual || items.length === 0) {
        const valFps = Math.floor((b / 10000) * 1.8);
        results.push(`발로란트/롤: FHD 약 ${valFps}프레임`);
      }
      if (hasHeavy) {
        const pubgFps = Math.floor((b / 10000) * 1.1);
        results.push(`배그: FHD 약 ${pubgFps}프레임`);
      }
      if (hasAAA) {
        const aaaFps = Math.floor((b / 10000) * 0.75);
        results.push(`AAA 패키지: QHD 약 ${aaaFps}프레임`);
      }
      if (results.length === 0) {
        const customFps = Math.floor((b / 10000) * 1.2);
        results.push(`${name}: FHD 약 ${customFps}프레임`);
      }

      return `${results.join(" | ")} 예상 🎮`;
    } else {
      const items = name.split(",").map(x => x.trim());
      if (usage?.includes("편집") || usage?.includes("디자인") || usage?.includes("영상편집")) {
        const hasPhotoshop = items.some(x => x.includes("포토샵") || x.includes("일러스트") || x.includes("피그마"));
        const hasPremiere = items.some(x => x.includes("프리미어") || x.includes("애프터") || x.includes("블렌더") || x.includes("3D"));

        let results: string[] = [];
        if (hasPhotoshop) {
          results.push(b < 1200000 ? "포토샵: 대용량 드로잉 원활" : "포토샵: 인쇄물 이미지 작업 최적");
        }
        if (hasPremiere) {
          results.push(b < 1500000 ? "프리미어: FHD 영상 컷편집 원활" : "프리미어/블렌더: 4K 렌더링 최적");
        }
        if (results.length === 0) {
          results.push(b < 1200000 ? `${name} 작업 원활` : `${name} 멀티태스킹 쾌적`);
        }
        return `${results.join(" | ")} 🎨`;
      } else if (usage?.includes("프로그래밍")) {
        return b < 1200000 ? "웹/앱 개발 및 경량 DB 빌드 쾌적 💻" : "대규모 컨테이너(Docker) 빌드 거뜬 🚀";
      } else if (usage?.includes("AI")) {
        return b < 1600000 ? "Stable Diffusion 이미지 생성 가능 🧠" : "VRAM 16GB 탑재 고난도 딥러닝 쾌적 🚀";
      } else {
        return b < 1000000 ? "기본 문서/사무/웹서핑에 차고 넘치는 반응성 📁" : "다중 고해상도 모니터 및 엑셀 대용량 연산 원활 ⚡";
      }
    }
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
      text: "안녕하세요! 컴퓨존 공식 AI 조립 스마트 빌더입니다. 🤖✨\n\n복잡한 호환성(CPU 소켓, 메인보드 칩셋, 파워 정격 소비전력 등) 검증 알고리즘이 탑재되어, 컴알못 고객님도 100% 호환 안전한 명품 본체 견적을 3분 만에 조립하실 수 있습니다.\n\n먼저 고객님의 주된 사용 용도를 아래에서 선택해 주세요! 용도에 최적화된 하드웨어 가중치를 부여합니다.",
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
      botFeedback = "게임이면 역시 화면을 매끄럽게 그리는 그래픽카드(GPU) 영향도가 제일 커요! 🎮 주로 즐기시는 게임들을 모두 선택해 주세요.";
      options = [
        { label: "발로란트 (고FPS 최적화)", action: "rec_game_valorant" },
        { label: "배틀그라운드 (대용량 연산)", action: "rec_game_pubg" },
        { label: "리그 오브 레전드 (가성비 지향)", action: "rec_game_lol" },
        { label: "오버워치 2 (중상급 가속)", action: "rec_game_overwatch" },
        { label: "로스트아크 (안정적 멀티코어)", action: "rec_game_lostark" },
        { label: "스팀 AAA 패키지 (초고화질 옵션)", action: "rec_game_steam" },
      ];
    } else if (action === "rec_usage_edit") {
      usageKey = "영상편집/그래픽";
      botFeedback = "디자인 및 그래픽 작업은 대용량 파일 가공이 많아 RAM 용량과 고성능 CPU의 멀티코어가 무척 중요해요! 🎬";
      options = [
        { label: "포토샵 (이미지 편집)", action: "rec_program_photoshop" },
        { label: "일러스트레이터", action: "rec_program_illustrator" },
        { label: "피그마 (UI/기획)", action: "rec_program_figma" },
        { label: "프리미어 프로 (영상 편집)", action: "rec_program_premiere" },
        { label: "애프터 이펙트", action: "rec_program_ae" },
        { label: "블렌더 (3D 그래픽)", action: "rec_program_blender" },
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
        step: 5,
        budget: budgetWon,
        priority: "균형",
      }));
      setActiveRecommendTab(1);

      setTimeout(() => {
        generatePCProposals(budgetWon, "균형", flowState.usage || "게임", flowState.detail || "배그");
      }, 2500);
    }, 600);
  };

  const handleRecPriority = (priorLabel: string, action: string) => {
    addUserMessage(priorLabel);

    let priorityKey = "균형";
    let tabIdx = 1;
    if (action.includes("budget")) {
      priorityKey = "가성비";
      tabIdx = 0;
    }
    if (action.includes("perf")) {
      priorityKey = "성능";
      tabIdx = 2;
    }

    setFlowState((prev) => ({
      ...prev,
      priority: priorityKey,
    }));
    setActiveRecommendTab(tabIdx);

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
    // Show a temporary loading message or progress
    setFlowState((prev) => ({
      ...prev,
      step: 5, // Keep loading/progress active
    }));

    const reqBody = {
      session_id: Math.random().toString(36).substring(7),
      purpose: usage === "게임" ? "game" : "design",
      games: usage === "게임" ? [detail] : [],
      programs: usage !== "게임" ? [detail] : [],
      budget: budgetVal,
      priority: prior, // "가성비", "균형", "성능"
    };

    fetch("/api/recommend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reqBody),
    })
      .then((res) => {
        if (!res.ok) throw new Error("API failed");
        return res.json();
      })
      .then((data) => {
        setFlowState((prev) => ({
          ...prev,
          step: 6,
          lastGeneratedSpecs: data.recommendations[activeRecommendTab]?.specs || data.recommendations[1]?.specs,
        }));
        addBotMessage({
          text: `짠! 사용자님의 용도(${usage}) 및 예산(${(budgetVal / 10000).toLocaleString()}만원) 맞춤 분석을 마쳤어요! 🤖\n아래 3가지 컴퓨존 엄선 제안서 중 원하시는 패키지를 탭하여 세부 내역을 확인하고 장바구니에 바로 담으실 수 있답니다.`,
          type: "recommend_results",
          data: data.recommendations,
        });
      })
      .catch((err) => {
        console.error("Failed to load recommendations", err);
        setFlowState((prev) => ({
          ...prev,
          step: 6,
        }));
        
        // Static mock fallback in case backend is offline
        const fallbackOptions = [
          {
            id: "est-cheap",
            title: `⚡ 알뜰 가성비 세팅 (${usage} - ${detail})`,
            price: 1050000,
            specs: {
              cpu: "AMD Ryzen 5 7500F (라파엘)",
              gpu: "MSI GeForce RTX 5060 VENTUS 2X OC 8GB",
              ram: "Samsung DDR5-5600 16GB (16GB)",
              ssd: "Micron Crucial 고속 SSD 500GB",
              power: "Micronix 500W 정격 파워",
              mb: "MSI PRO H610M 메인보드",
              cooler: "3RSYS Socoool RC310"
            },
            reason: "예산을 대폭 세이브하면서 성능과 부품 효율성을 극대화한 실속 가득 입문용 구성입니다.",
            report: {
              reason: "예산을 대폭 세이브하면서 성능과 부품 효율성을 극대화한 실속 가득 입문용 구성입니다.",
              warning: null
            }
          },
          {
            id: "est-balanced",
            title: `⭐ 황금 밸런스 균형 세팅 (${usage} - ${detail})`,
            price: 1540000,
            specs: {
              cpu: "Intel Core i5-14400F (랩터레이크)",
              gpu: "Gigabyte GeForce RTX 4060 Ti WINDFORCE OC 8GB",
              ram: "Samsung DDR5-5600 16GB x2",
              ssd: "Samsung 990 PRO M.2 NVMe 1TB",
              power: "Micronix Classic II Full Change 700W 80PLUS BRONZE",
              mb: "ASUS B760M 게이밍 메인보드",
              cooler: "Thermalright Peerless Assassin 120 SE"
            },
            reason: "예산선에 정확히 대응하며 장기 사용 시 스로틀링이나 호환성 트러블이 전혀 없는 표준 탑-클래스 구성입니다.",
            report: {
              reason: "예산선에 정확히 대응하며 장기 사용 시 스로틀링이나 호환성 트러블이 전혀 없는 표준 탑-클래스 구성입니다.",
              warning: null
            }
          },
          {
            id: "est-perf",
            title: `🚀 익스트림 울트라 성능 세팅 (${usage} - ${detail})`,
            price: 2190000,
            specs: {
              cpu: "AMD Ryzen 7 7800X3D (라파엘 3D V-Cache)",
              gpu: "ASUS ROG Strix GeForce RTX 4070 SUPER O12G",
              ram: "Samsung DDR5-5600 16GB x2 (32GB 듀얼채널)",
              ssd: "Samsung 990 PRO M.2 NVMe 1TB",
              power: "Micronix Classic II Full Change 700W 80PLUS BRONZE",
              mb: "ASRock B650M PG Lightning",
              cooler: "Deepcool LS720 ARGB 3열 수랭"
            },
            reason: "선택된 목적 하에서 타협 없는 하이엔드 게이밍 및 고부하 작업을 초고프레임으로 압살할 수 있는 종결급 조합입니다.",
            report: {
              reason: "선택된 목적 하에서 타협 없는 하이엔드 게이밍 및 고부하 작업을 초고프레임으로 압살할 수 있는 종결급 조합입니다.",
              warning: null
            }
          }
        ];

        addBotMessage({
          text: `추천 서버 점검 중으로 기본 추천안을 불러왔어요! 🤖\n아래 3가지 컴퓨존 엄선 제안서 중 원하시는 패키지를 확인해 보세요.`,
          type: "recommend_results",
          data: fallbackOptions,
        });
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
        text: `**[${label}]**\n\n전담 상담 라인업이 준비되어 있습니다.\n가장 원하시는 연결 방식을 하단 탭에서 택해 주세요!`,
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

    // If counselor session is active (queue matched)
    if (counselorQueue.active && counselorQueue.queueNum === 0) {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const stage = counselorStage;
        setCounselorStage(prev => prev + 1);

        if (stage === 0) {
          addBotMessage({
            text: `**[상담원 배성진]**

안녕하세요! 컴퓨존 기술 지원 전담 상담원 배성진입니다. 문의해 주신 "${text}" 관련 증상 접수했습니다. 혹시 전원을 켰을 때 팬이 돌아가는 소리는 나는데 화면만 안 나오는 상태이신가요?`,
            type: "text",
          });
        } else if (stage === 1) {
          addBotMessage({
            text: `**[상담원 배성진]**

확인해 주셔서 감사합니다. 이 경우는 RAM(메모리) 또는 그래픽카드의 금색 접촉 단자에 미세한 먼지가 앉아 접촉 불량이 났을 확률이 높습니다. 본체 전원선을 완전히 분리하신 뒤, 램을 뽑아서 지우개로 금색 단자 부분을 털어내고 딸칵 소리가 나도록 다시 깊게 꽂아 주시겠어요?`,
            type: "text",
          });
        } else {
          addBotMessage({
            text: `**[상담원 배성진]**

만약 접촉 단자 청소 후에도 증상이 계속된다면, 부품 이상으로 인한 교체나 기사님의 대면 방문 점검이 권장됩니다. 하단의 접수 버튼을 눌러 출장 기사님 방문 신청을 하실 수 있습니다.`,
            type: "options",
            options: [
              { label: "🛠️ 출장 A/S 접수 신청하기", action: "as_start_direct" },
              { label: "🏠 처음 화면으로 돌아가기", action: "go_home_back" }
            ]
          });
          // Clear active queue to stop interception
          setCounselorQueue({ active: false, queueNum: 2, waitTime: 1 });
          setCounselorStage(0);
        }
      }, 1000);
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
      addUserMessage("스마트 맞춤 PC 견적 추천");
      startRecommendationFlow();
    } else if (action === "as_start_direct") {
      addUserMessage("정품/무상 A/S 보증기한 조회");
      startAsFlow();
    } else if (action === "counsel_start_direct") {
      addUserMessage("전문 기술 상담사 실시간 연결");
      startCounselorFlow();
    } else if (action === "menu_start_direct") {
      addUserMessage("컴퓨존 빠른 견적 메뉴 찾기");
      handleMenuFinder("빠른 견적 어디서 해요?");
    } else if (action.startsWith("menu_opt_")) {
      handleMenuSelection(label, action);
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
    } else if (action === "counselor_redirect") {
      addUserMessage("전문 기술 상담사 연결해줘");
      startCounselorFlow();
    } else if (action === "menu_opt_retry") {
      addUserMessage("다시 검색할래");
      handleMenuFinder("빠른 견적 어디서 해요?");
    } else if (action === "go_home_back") {
      addUserMessage("홈 메뉴로 돌아갈래");
      initChat();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop blur overlay - only show when maximized */}
          {isMaximized && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 transition-opacity" onClick={onClose}></div>
          )}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`fixed z-50 bg-slate-50 rounded-3xl overflow-hidden shadow-2xl border border-slate-200/60 flex flex-col transition-all duration-300 ${
              isMaximized
                ? "inset-4 md:inset-8 lg:inset-x-20 lg:inset-y-10 w-full max-w-5xl h-[85vh] mx-auto my-auto"
                : "bottom-6 right-6 w-full max-w-[420px] h-[640px]"
            }`}
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
                onClick={() => setIsMaximized(prev => !prev)}
                className={`p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer ${
                  !isMaximized ? "animate-pulse bg-white/20 border border-white/20 shadow-[0_0_8px_rgba(255,255,255,0.4)]" : ""
                }`}
                title={isMaximized ? "창 축소" : "창 확대"}
              >
                {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4 text-amber-300" />}
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

                <div className={`${msg.type === "recommend_results" ? "w-full max-w-[95%]" : "max-w-[78%]"} flex flex-col gap-2`}>
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
                  {msg.type === "deep_link" && (
                    <div className="flex flex-col gap-3 mt-1 max-w-sm w-full">
                      {msg.data && Array.isArray(msg.data) ? (
                        msg.data.map((menu: any, index: number) => (
                          <div key={index} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-md flex flex-col gap-2">
                            <div className="text-[11px] text-left font-bold text-slate-500 border-b border-slate-50 pb-1.5 flex items-center justify-between">
                              <span>🎯 {menu.name}</span>
                              <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">추천 메뉴</span>
                            </div>
                            <p className="text-xs text-left text-slate-600 leading-relaxed font-medium">
                              {menu.guide}
                            </p>
                            <button
                              onClick={() => {
                                if (menu.deeplink) {
                                  window.open(menu.deeplink, "_blank", "noopener,noreferrer");
                                }
                              }}
                              className="inline-block w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold py-2 px-4 rounded-xl shadow transition-colors cursor-pointer mt-1"
                            >
                              바로가기 🔗
                            </button>
                          </div>
                        ))
                      ) : msg.deepLink ? (
                        <div className="bg-white border border-slate-100 rounded-2xl p-3.5 shadow-md text-center">
                          <p className="text-[11px] text-slate-500 mb-2.5">찾으시는 메뉴로 바로 딥링크 이동하세요!</p>
                          <button
                            onClick={() => {
                              if (msg.deepLink.url.startsWith("#")) {
                                const mId = msg.deepLink.menuId;
                                if (mId === "easy-pc" || mId === "diy-pc" || mId === "quick-estimate") {
                                  addUserMessage("맞춤 조립 PC 추천받기");
                                  startRecommendationFlow();
                                } else if (mId === "as-center") {
                                  addUserMessage("정품/무상 A/S 보증기한 조회");
                                  startAsFlow();
                                } else if (mId === "category-guide") {
                                  addUserMessage("CPU 부품 정보 설명");
                                  queryCategoryInfo("CPU");
                                }
                              } else {
                                window.open(msg.deepLink.url, "_blank", "noopener,noreferrer");
                              }
                            }}
                            className="inline-block w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow transition-colors cursor-pointer text-center"
                            id={`deep-link-${msg.deepLink.menuId}`}
                          >
                            {msg.deepLink.label}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Options List (Q1, Q4, etc. - EXCEPT Q2) */}
                  {msg.type === "options" && msg.options && !(flowState.currentFlow === "recommend" && flowState.step === 2) && (
                    <div className="flex flex-col gap-2 mt-1">
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

                  {/* Q2 Multi-select Custom UI (Only on Step 2 options message) */}
                  {flowState.currentFlow === "recommend" && flowState.step === 2 && msg.type === "options" && msg.id === messages[messages.length - 1]?.id && (
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-md max-w-sm mt-1 space-y-3.5">
                      <div className="text-[11px] font-bold text-slate-400">
                        자주 하시는 게이밍 리스트
                      </div>
                      
                      <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                        {msg.options?.map((opt, idx) => {
                          const isSelected = selectedDetails.includes(opt.label);
                          // Split option into main title and subtitle
                          const match = opt.label.match(/^([^\(]+)(?:\s*(\(.+\)))?$/);
                          const mainTitle = match ? match[1].trim() : opt.label;
                          const subTitle = match && match[2] ? match[2] : "";

                          return (
                            <button
                              key={idx}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedDetails(prev => prev.filter(x => x !== opt.label));
                                } else {
                                  setSelectedDetails(prev => [...prev, opt.label]);
                                }
                              }}
                              className={`w-full py-2.5 px-4 rounded-xl border text-xs font-bold transition-all text-left cursor-pointer flex items-center justify-between ${
                                isSelected 
                                  ? "bg-blue-600 border-blue-600 text-white shadow-md" 
                                  : "bg-white border-slate-100 text-slate-700 hover:bg-slate-50 hover:border-slate-200"
                              }`}
                            >
                              <span>
                                {mainTitle} <span className={`text-[10px] font-medium ml-1 ${isSelected ? "text-blue-100" : "text-slate-400"}`}>{subTitle}</span>
                              </span>
                              {isSelected && (
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom text input style matches list */}
                      <div className="pt-1.5">
                        {customDetailInput === null || customDetailInput === undefined || !showCustomInput ? (
                          <button
                            onClick={() => setShowCustomInput(true)}
                            className="w-full py-2 px-4 rounded-xl border border-dashed border-slate-200 text-slate-500 hover:text-slate-700 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all bg-slate-50/50 hover:bg-slate-50 cursor-pointer"
                          >
                            <span className="text-sm font-light">+</span> 리스트 외 수동 직접 입력
                          </button>
                        ) : (
                          <div className="space-y-1.5 animate-fadeIn">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-extrabold text-slate-400 uppercase">직접 입력</label>
                              <button 
                                onClick={() => {
                                  setCustomDetailInput("");
                                  setShowCustomInput(false);
                                }}
                                className="text-[10px] text-slate-400 hover:text-red-500 font-bold"
                              >
                                취소
                              </button>
                            </div>
                            <input
                              type="text"
                              placeholder="프로그램이나 게임명을 직접 입력해 보세요"
                              value={customDetailInput}
                              onChange={(e) => setCustomDetailInput(e.target.value)}
                              className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white text-slate-800 transition-all font-bold"
                              autoFocus
                            />
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          let finalItems = [...selectedDetails];
                          if (customDetailInput && customDetailInput.trim()) {
                            finalItems.push(customDetailInput.trim());
                          }
                          if (finalItems.length === 0) {
                            alert("최소 1개 이상의 소프트웨어/게임을 선택하거나 입력해 주세요!");
                            return;
                          }
                          const label = finalItems.join(", ");
                          setSelectedDetails([]); // reset
                          setCustomDetailInput(""); // reset
                          setShowCustomInput(false); // reset
                          handleRecDetail(label, "rec_game_multiple");
                        }}
                        className={`w-full font-bold py-3 rounded-xl text-xs shadow-md cursor-pointer transition-all flex items-center justify-center gap-1 ${
                          selectedDetails.length > 0 || (customDetailInput && customDetailInput.trim())
                            ? "bg-blue-600 hover:bg-blue-700 text-white"
                            : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"
                        }`}
                        id="detail-confirm-btn"
                        disabled={selectedDetails.length === 0 && !(customDetailInput && customDetailInput.trim())}
                      >
                        선택 확정하기 <span className="ml-0.5">➡️</span>
                      </button>
                    </div>
                  )}

                  {/* Slider option container (Q3 Budget Setup) */}
                  {flowState.currentFlow === "recommend" && flowState.step === 3 && msg.id === messages[messages.length - 1]?.id && (
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-md max-w-sm mt-1 space-y-4">
                      <div className="flex items-center justify-between font-bold text-xs text-slate-400">
                        <span>희망 조립 예산</span>
                        <span className="text-xl font-black text-blue-600">
                          {(flowState.budget || 1500000).toLocaleString()}원
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <input
                          type="range"
                          min="800000"
                          max="2500000"
                          step="50000"
                          value={flowState.budget || 1500000}
                          onChange={(e) => setFlowState((p) => ({ ...p, budget: Number(e.target.value) }))}
                          className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
                          id="budget-range-slider"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 font-bold px-1">
                          <span>80만원</span>
                          <span>140만원</span>
                          <span>200만원</span>
                          <span>250만원+</span>
                        </div>
                      </div>

                      {/* Outlined Real-time performance preview box */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
                        <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                          <span>🔥 실시간 성능 등급</span>
                          <span className="text-blue-600 font-black">
                            🚀 {getLivePerformancePreview(flowState.budget || 1500000, flowState.usage === "게임").rating}
                          </span>
                        </div>
                        <p className="text-[11px] font-medium text-slate-500 leading-relaxed text-left">
                          {getLivePerformanceLabel(flowState.budget || 1500000, flowState.usage, flowState.detail)}
                        </p>
                      </div>

                      <button
                        onClick={() => handleRecBudget(flowState.budget || 1500000)}
                        className="w-full bg-[#0f172a] hover:bg-slate-800 text-white font-bold py-3.5 rounded-2xl text-xs shadow-md cursor-pointer transition-all flex items-center justify-center gap-1.5"
                        id="budget-confirm-btn"
                      >
                        이 예산으로 추천받기 <span className="text-xs">&gt;</span>
                      </button>
                    </div>
                  )}

                  {/* Flow 2: Proposals Cards Grid */}
                  {msg.type === "recommend_results" && msg.data && (
                    <>
                      {(() => {
                        const activeSpec = msg.data[activeRecommendTab] || msg.data[1] || msg.data[0];
                        
                        const formatPriceMan = (price: number) => {
                          const man = price / 10000;
                          if (man % 1 === 0) {
                            return `${man}만`;
                          }
                          return `${man.toFixed(1).replace(".0", "")}만`;
                        };

                        const getTabSub = (idx: number) => {
                          if (idx === 0) return "* 알뜰한 예산 범위 내에서 최고의 프레임을 뽑아내는 가성비 사양입니다.";
                          if (idx === 1) return "* 많은 초보 게이머분들이 가장 대중적으로 고르시는 국민 균형형 사양입니다.";
                          return "* 타협 없는 최고 옵션 플레이와 전문가급 고용량 작업이 가능한 하이엔드 사양입니다.";
                        };

                        const userChosenIdx = flowState.priority === "가성비" ? 0 : flowState.priority === "성능" ? 2 : 1;

                        const getPartsDetail = (spec: any) => {
                          if (spec.parts_detail) return spec.parts_detail;
                          if (spec.specs) {
                            return [
                              { category: "CPU", name: spec.specs.cpu, price: 0, description: "최고의 연산 속도를 보증하는 프로세서입니다." },
                              { category: "GPU", name: spec.specs.gpu, price: 0, description: "독립형 그래픽 가속 장치입니다." },
                              { category: "MB", name: spec.specs.mb, price: 0, description: "부품을 장착하는 컴퓨터의 뼈대입니다." },
                              { category: "RAM", name: spec.specs.ram, price: 0, description: "시스템의 주 기억 임시 메모리입니다." },
                              { category: "SSD", name: spec.specs.ssd, price: 0, description: "초고속 플래시 저장 장치입니다." },
                              { category: "Power", name: spec.specs.power, price: 0, description: "시스템 에너지의 원천 파워입니다." },
                              { category: "Cooler", name: spec.specs.cooler, price: 0, description: "열을 식혀주는 정숙한 쿨러입니다." }
                            ];
                          }
                          return [];
                        };

                        const activeParts = getPartsDetail(activeSpec);

                        if (isMaximized) {
                          // ==========================================
                          // 🔍 크게보기 상태 (isMaximized === true)
                          // ==========================================
                          return (
                            <div className="w-full max-w-5xl mt-1 space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
                                {msg.data.slice(0, 3).map((spec: any, idx: number) => {
                                  const isUserSelected = userChosenIdx === idx;
                                  const cardParts = getPartsDetail(spec);
                                  
                                  // Style variables based on index (0: 가성비 green, 1: 균형 blue, 2: 성능 purple)
                                  const headerBg = idx === 0 ? "bg-emerald-600 text-white" : idx === 1 ? "bg-blue-600 text-white" : "bg-purple-600 text-white";
                                  const badgeBg = idx === 0 ? "bg-emerald-750 text-emerald-100" : idx === 1 ? "bg-blue-750 text-blue-100" : "bg-purple-750 text-purple-100";
                                  const badgeText = idx === 0 ? "가성비" : idx === 1 ? "균형" : "최고성능";
                                  const progressColor = idx === 0 ? "bg-emerald-500" : idx === 1 ? "bg-blue-500" : "bg-purple-600";
                                  
                                  // Suitability mapping
                                  const suitLabel1 = idx === 0 ? (flowState.usage === "게임" ? "캐주얼 게임" : "기본 디자인") : idx === 1 ? (flowState.usage === "게임" ? "고사양 게임" : "프로 디자인") : (flowState.usage === "게임" ? "하이엔드 스팀" : "전문 3D 렌더링");
                                  const suitVal1 = idx === 0 ? 70 : idx === 1 ? 85 : 98;
                                  const suitLabel2 = idx === 0 ? (flowState.usage === "게임" ? "일반 사무용" : "웹 서핑") : idx === 1 ? (flowState.usage === "게임" ? "멀티미디어" : "대용량 작업") : (flowState.usage === "게임" ? "영상 송출" : "배치 가속");
                                  const suitVal2 = idx === 0 ? 30 : idx === 1 ? 15 : 2;

                                  return (
                                    <div
                                      key={idx}
                                      className={`bg-white rounded-3xl overflow-hidden shadow-md flex flex-col justify-between border-2 transition-all duration-300 relative text-left hover:-translate-y-1.5 hover:shadow-xl ${
                                        isUserSelected
                                          ? idx === 0
                                            ? "border-emerald-500 ring-4 ring-emerald-50/50 shadow-emerald-100"
                                            : idx === 1
                                              ? "border-blue-500 ring-4 ring-blue-50/50 shadow-blue-100"
                                              : "border-purple-500 ring-4 ring-purple-50/50 shadow-purple-100"
                                          : "border-slate-100/80 hover:border-slate-200"
                                      }`}
                                    >
                                      {/* Selection Banner */}
                                      {isUserSelected && (
                                        <div className={`w-full py-1 text-center text-[9px] font-black text-white uppercase tracking-wider flex items-center justify-center gap-1 ${
                                          idx === 0 ? "bg-emerald-700" : idx === 1 ? "bg-blue-700" : "bg-purple-700"
                                        }`}>
                                          <span>★</span> 내 선택 추천 사양 <span>★</span>
                                        </div>
                                      )}

                                      {/* Header */}
                                      <div className={`${headerBg} p-4.5 space-y-1 relative`}>
                                        <div className="flex justify-between items-center gap-2">
                                          <span className="text-[12px] font-black leading-snug flex-1">
                                            {spec.title || (idx === 0 ? "알뜰 가성비 세팅" : idx === 1 ? "황금 밸런스 균형 세팅" : "익스트림 울트라 성능 세팅")}
                                          </span>
                                          <span className={`text-[8.5px] font-extrabold px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap ${badgeBg}`}>
                                            {badgeText}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Body */}
                                      <div className="p-4.5 space-y-4 flex-1 flex flex-col justify-between">
                                        <div className="space-y-4">
                                          {/* AI 예상 성능 */}
                                          <div className={`border rounded-2xl p-3.5 text-center ${
                                            idx === 0 ? "bg-emerald-50/20 border-emerald-100/40 text-emerald-950" : idx === 1 ? "bg-blue-50/20 border-blue-100/40 text-blue-950" : "bg-purple-50/20 border-purple-100/40 text-purple-950"
                                          }`}>
                                            <p className="text-[11px] font-black leading-normal text-left">
                                              🚀 {spec.performance?.headline || `${flowState.detail || "오버워치 2"}를 매우 부드러운 화질로 구동 가능해요!`}
                                            </p>
                                          </div>

                                          {/* 용도 적합성 분석 */}
                                          <div className="bg-slate-50/70 border border-slate-100/60 rounded-2xl p-3.5 text-[10px] text-slate-500 space-y-2">
                                            <div className="flex justify-between items-center text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">
                                              <span>용도 적합성 분석</span>
                                              <span>정합도</span>
                                            </div>
                                            <div className="space-y-2 font-bold text-slate-700">
                                              <div>
                                                <div className="flex justify-between mb-0.5 text-[10.5px] font-extrabold text-slate-800">
                                                  <span>{suitLabel1}</span>
                                                  <span>{suitVal1}%</span>
                                                </div>
                                                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                                  <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${suitVal1}%` }}></div>
                                                </div>
                                              </div>
                                              <div>
                                                <div className="flex justify-between mb-0.5 text-slate-500 text-[10px]">
                                                  <span>{suitLabel2}</span>
                                                  <span>{suitVal2}%</span>
                                                </div>
                                                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                                  <div className="bg-slate-300 h-full rounded-full" style={{ width: `${suitVal2}%` }}></div>
                                                </div>
                                              </div>
                                            </div>
                                          </div>

                                          {/* Parts Detail List */}
                                          <div className="space-y-1.5 text-[11px] text-slate-650 border-b border-slate-50 pb-3">
                                            {cardParts.map((part: any, pIdx: number) => (
                                              <div key={pIdx} className="flex justify-between items-start gap-3">
                                                <span className="font-extrabold text-slate-400 w-12 flex-shrink-0">{part.category}</span>
                                                <span className="font-semibold text-slate-800 text-right line-clamp-1 flex-1" title={part.name}>
                                                  {part.name}
                                                </span>
                                              </div>
                                            ))}
                                          </div>

                                          {/* Warning / Alerts block */}
                                          {spec.report?.warning && (
                                            <div className="bg-rose-50 border border-rose-100/50 rounded-xl p-3 text-[10px] text-rose-800 space-y-1">
                                              <div className="font-extrabold flex items-center gap-1 text-[10.5px]">
                                                <span>⚠️</span> 호환성 및 안전 점검 알림
                                              </div>
                                              <div className="leading-relaxed font-semibold">
                                                {spec.report.warning}
                                              </div>
                                            </div>
                                          )}
                                        </div>

                                        {/* Total price and shopping cart button */}
                                        <div className="space-y-2.5 pt-3">
                                          <div className="flex justify-between items-center border-t border-slate-100 pt-3">
                                            <span className="text-[10px] text-slate-400 font-extrabold uppercase">정품 총합액</span>
                                            <span className="text-[14.5px] font-black text-slate-900 tracking-tight">
                                              {spec.price.toLocaleString()}원
                                            </span>
                                          </div>
                                          
                                          <div className="flex gap-1.5">
                                            <button
                                              onClick={() => {
                                                onAddToCart(spec);
                                                onClose();
                                              }}
                                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-[10.5px] shadow-sm cursor-pointer transition-all flex items-center justify-center gap-1"
                                              id={`add-cart-spec-btn-${spec.id}`}
                                            >
                                              <ShoppingCart className="w-3 h-3" /> 장바구니 담기
                                            </button>
                                            <button
                                              onClick={() => {
                                                alert("현재 견적 사양이 임시 보관함에 안전하게 저장되었습니다! 💾");
                                              }}
                                              className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-555 font-bold p-2.5 rounded-xl text-[10.5px] transition-all flex items-center justify-center cursor-pointer"
                                              title="견적 저장"
                                            >
                                              <Save className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              
                              {/* Bottom back buttons */}
                              <div className="flex justify-center gap-3 pt-2">
                                <button
                                  onClick={() => {
                                    initChat();
                                    handleOptionClick("🎮 스마트 맞춤 PC 견적 추천", "rec_start_direct");
                                  }}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-5 rounded-2xl text-[11px] transition-all flex items-center gap-1.5 cursor-pointer"
                                >
                                  목적 다시 맞추기 🔄
                                </button>
                              </div>
                            </div>
                          );
                        } else {
                          // ==========================================
                          // 📱 작게보기 상태 (isMaximized === false)
                          // ==========================================
                          return (
                            <div className="bg-white border-2 border-blue-500 rounded-3xl overflow-hidden shadow-lg flex flex-col w-full max-w-sm mt-1 p-4 space-y-4 text-left">
                              {/* 콤팩트 가로 알약(Pill) 버튼 탭 스위처 */}
                              <div className="flex gap-1.5 bg-slate-50 p-1 rounded-2xl border border-slate-100 overflow-x-auto scrollbar-none">
                                {msg.data.slice(0, 3).map((spec: any, idx: number) => {
                                  const isTabActive = activeRecommendTab === idx;
                                  const isUserSelected = userChosenIdx === idx;
                                  const tabIcon = idx === 0 ? "💰" : idx === 1 ? "⭐" : "🚀";
                                  const tabName = idx === 0 ? "가성비" : idx === 1 ? "균형" : "성능";
                                  return (
                                    <button
                                      key={idx}
                                      onClick={() => setActiveRecommendTab(idx)}
                                      className={`flex-1 min-w-[75px] py-2 px-1.5 rounded-xl text-center transition-all cursor-pointer flex items-center justify-center gap-0.5 text-[10px] whitespace-nowrap ${
                                        isTabActive
                                          ? "bg-[#0f172a] text-white shadow font-extrabold"
                                          : isUserSelected
                                            ? "bg-blue-50 text-blue-700 border border-blue-200/50 font-bold"
                                            : "bg-transparent text-slate-600 hover:bg-white/50 font-bold"
                                      }`}
                                    >
                                      <span>{tabIcon} {tabName}</span>
                                      <span className="text-[9.5px] opacity-90">({formatPriceMan(spec.price)})</span>
                                      {isUserSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-0.5"></span>}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Active Tab Contents */}
                              <div className="space-y-3 flex-1 flex flex-col justify-between">
                                <div className="space-y-3">
                                  {/* AI 실시간 예상 성능치 */}
                                  <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-blue-600 flex items-center gap-1">
                                      <span>✨</span> AI 실시간 예상 성능치
                                    </div>
                                    <h4 className="text-[12px] font-black text-slate-800 tracking-tight leading-snug">
                                      {activeSpec.performance?.headline || "구성이 완료되었습니다."}
                                    </h4>
                                    <p className="text-[9.5px] font-medium text-slate-400">
                                      {getTabSub(activeRecommendTab)}
                                    </p>
                                  </div>

                                  {/* AI 매니저 추천평 */}
                                  <div className="bg-blue-50/30 border border-blue-50 rounded-2xl p-3 space-y-1">
                                    <div className="text-[10px] font-bold text-slate-550 flex items-center gap-1.5">
                                      <span>📝</span> AI 매니저 추천평
                                    </div>
                                    <p className="text-[11px] text-slate-650 leading-relaxed font-semibold">
                                      {activeSpec.report?.reason || activeSpec.reason}
                                    </p>
                                  </div>

                                  {/* 부품 상세 목록 (심플 리스트 형태) */}
                                  <div className="space-y-1.5">
                                    <div className="text-[10px] font-bold text-slate-450">
                                      부품 조합 상세 ({activeParts.length}종)
                                    </div>
                                    <div className="border border-slate-100 rounded-2xl p-3.5 max-h-[220px] overflow-y-auto space-y-2.5 scrollbar-thin bg-white">
                                      {activeParts.map((part: any, pIdx: number) => (
                                        <div key={pIdx} className="space-y-2">
                                          <div className="flex justify-between items-start">
                                            <div className="flex flex-col gap-0.5 text-left max-w-[70%]">
                                              <span className="text-[8px] font-extrabold bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 w-fit uppercase tracking-wider">
                                                {part.category}
                                              </span>
                                              <span className="text-[10.5px] font-extrabold text-slate-800 leading-tight">
                                                {part.name}
                                              </span>
                                            </div>
                                            <span className="text-[11px] font-extrabold text-slate-700 whitespace-nowrap">
                                              {part.price > 0 ? `${part.price.toLocaleString()}원` : "기본포함"}
                                            </span>
                                          </div>
                                          {pIdx < activeParts.length - 1 && (
                                            <div className="border-b border-slate-50 w-full"></div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Compatibility warning if any */}
                                  {activeSpec.report?.warning && (
                                    <div className="bg-rose-50 border border-rose-100/50 rounded-xl p-3 text-[10px] text-rose-800 space-y-1">
                                      <div className="font-extrabold flex items-center gap-1 text-[10.5px]">
                                        <span>⚠️</span> 호환성 및 안전 점검 알림
                                      </div>
                                      <div className="leading-relaxed font-semibold">
                                        {activeSpec.report.warning}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Price and Action Buttons */}
                                <div className="space-y-3 pt-2">
                                  <div className="bg-[#0f172a] rounded-2xl p-3.5 flex justify-between items-center text-white font-extrabold shadow-sm">
                                    <span className="text-[10.5px] opacity-80">정품 합계액</span>
                                    <span className="text-[13.5px] font-black tracking-tight">
                                      {activeSpec.price.toLocaleString()}원
                                    </span>
                                  </div>

                                  <div className="space-y-2">
                                    <button
                                      onClick={() => {
                                        onAddToCart(activeSpec);
                                        onClose();
                                      }}
                                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-2xl text-xs shadow-md cursor-pointer transition-all flex items-center justify-center gap-1.5"
                                      id={`add-cart-spec-btn-${activeSpec.id}`}
                                    >
                                      <ShoppingCart className="w-3.5 h-3.5" /> 컴퓨존 장바구니에 전체 담기 <span className="text-[10px] font-light">↗</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        initChat();
                                        handleOptionClick("🎮 스마트 맞춤 PC 견적 추천", "rec_start_direct");
                                      }}
                                      className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold py-2.5 rounded-2xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5 text-slate-400" /> 목적 다시 맞추기 🔄
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }
                      })()}
                    </>
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
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          msg.data.warrantyStatus === "expired" || msg.data.monthsLeft < 0
                            ? "bg-slate-100 text-slate-500"
                            : "bg-emerald-50 text-emerald-700"
                        }`}>
                          <ShieldCheck className="w-3 h-3" />
                          {msg.data.warrantyStatus === "expired" || msg.data.monthsLeft < 0 ? "보증 만료" : "보증 가능"}
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
                          {msg.data.warrantyStatus === "expired" || msg.data.monthsLeft < 0 ? (
                            <span className="font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">만료됨 (보증기한 만료)</span>
                          ) : (
                            <span className="font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">D-13! (13일 남음)</span>
                          )}
                        </div>
                      </div>

                      {msg.data.productName.includes("조립PC") ? (
                        <>
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
                        </>
                      ) : (
                        <>
                          <div className="bg-slate-50 rounded-xl p-3 text-[10px] text-slate-500 leading-relaxed border border-slate-100 space-y-1.5">
                            <span className="font-bold text-slate-700 block">🏢 제조사({msg.data.productName.includes("ASUS") ? "ASUS" : "제조사"}) 직접 보증 안내</span>
                            <p>본 상품은 제조사 직접 A/S 보증 제품으로, 컴퓨존 위탁이 아닌 제조사 공식 서비스 센터를 통해 빠르고 전문적인 수리를 받으실 수 있습니다.</p>
                            <div className="border-t border-slate-100/60 pt-1.5 space-y-1 text-slate-600">
                              <p>• **AS 고객센터**: {msg.data.productName.includes("ASUS") ? "1566-6868" : "제조사 고객센터"}</p>
                              <p>• **접수 방법**: 가까운 ASUS 서비스센터 방문 접수 또는 택배 발송 접수</p>
                              {(msg.data.warrantyStatus === "expired" || msg.data.monthsLeft < 0) && (
                                <p className="text-rose-600 font-extrabold">• **주의**: 보증 기한 경과로 점검 시 유상 비용이 발생할 수 있습니다.</p>
                              )}
                            </div>
                          </div>

                          <a
                            href={msg.data.productName.includes("ASUS") ? "https://www.asus.com/kr/support/" : "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-xl text-xs shadow cursor-pointer transition-colors block text-center"
                          >
                            {msg.data.productName.includes("ASUS") ? "ASUS" : "제조사"} 공식 서비스센터 바로가기 🔗
                          </a>
                        </>
                      )}
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
                        {/* Disclaimer inside the revised specs card */}
                        <div className="text-[9px] text-slate-400 font-semibold text-center mt-2.5 pt-2 border-t border-slate-100/60 leading-relaxed">
                          AI 추천은 참고용입니다. 실제 가격·재고는 변동될 수 있으며, 최종 구매 전 확인을 권장합니다.
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

            {/* Counselor Queue Connection Loader dots */}
            {counselorQueue.active && counselorQueue.queueNum > 0 && (
              <div className="flex gap-2.5 justify-start items-center">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex-shrink-0 flex items-center justify-center text-sm shadow animate-pulse">
                  👔
                </div>
                <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none p-3 shadow-sm max-w-[70%] text-xs flex items-center gap-2 text-slate-500">
                  <span className="font-medium text-[11px] animate-pulse">전문 상담원 배정 및 연결 중...</span>
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
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



          {/* Bottom Chat Input Field Bar */}
          <div className="bg-white border-t border-slate-200 p-3 flex items-center gap-2" id="chat-input-row">
            <div className="relative">
              {/* Quick Menu Popover */}
              {isQuickMenuOpen && (
                <div className="absolute bottom-12 left-0 bg-white border border-slate-200 shadow-xl rounded-2xl p-2 w-52 z-50 flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="text-[10px] font-extrabold text-slate-400 px-2.5 py-1 border-b border-slate-50 uppercase tracking-wider">
                    빠른 메뉴 실행
                  </div>
                  <button
                    onClick={() => {
                      setIsQuickMenuOpen(false);
                      addUserMessage("맞춤 PC 추천해줘");
                      startRecommendationFlow();
                    }}
                    className="w-full text-left text-xs font-bold text-slate-700 hover:text-blue-700 hover:bg-blue-50 py-2 px-2.5 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <span>🎮</span> PC 견적 추천
                  </button>
                  <button
                    onClick={() => {
                      setIsQuickMenuOpen(false);
                      addUserMessage("내 PC A/S 보증기한 알려줘");
                      startAsFlow();
                    }}
                    className="w-full text-left text-xs font-bold text-slate-700 hover:text-blue-700 hover:bg-blue-50 py-2 px-2.5 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <span>🛡️</span> 무상 A/S 조회
                  </button>
                  <button
                    onClick={() => {
                      setIsQuickMenuOpen(false);
                      addUserMessage("상담사 연결 원해요");
                      startCounselorFlow();
                    }}
                    className="w-full text-left text-xs font-bold text-slate-700 hover:text-blue-700 hover:bg-blue-50 py-2 px-2.5 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <span>👔</span> 상담사 연결
                  </button>
                  <button
                    onClick={() => {
                      setIsQuickMenuOpen(false);
                      handleMenuFinder("빠른 견적 어디서 해요?");
                    }}
                    className="w-full text-left text-xs font-bold text-slate-700 hover:text-blue-700 hover:bg-blue-50 py-2 px-2.5 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <span>📍</span> 견적 메뉴 찾기
                  </button>
                  <div className="border-t border-slate-100 my-0.5"></div>
                  <button
                    onClick={() => {
                      setIsQuickMenuOpen(false);
                      addUserMessage("처음 홈 메뉴로 돌아갈래");
                      initChat();
                    }}
                    className="w-full text-left text-xs font-bold text-rose-600 hover:bg-rose-50 py-2 px-2.5 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <span>🏠</span> 처음으로 (초기화)
                  </button>
                </div>
              )}
              <button
                onClick={() => setIsQuickMenuOpen(prev => !prev)}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  isQuickMenuOpen 
                    ? "bg-blue-50 text-blue-600 border border-blue-200" 
                    : "bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 border border-transparent"
                }`}
                title="빠른 메뉴 열기"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder={
                flowState.currentFlow === "recommend" && flowState.step === 7
                  ? "추가할 보완 사항을 자유롭게 적어주세요..."
                  : "궁금한 내용을 여기에 입력해 주세요..."
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter") handleSendText();
              }}
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
        </>
      )}
    </AnimatePresence>
  );
}
