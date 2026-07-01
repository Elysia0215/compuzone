/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import StoreHeader from "./components/StoreHeader";
import StoreFront from "./components/StoreFront";
import ChatbotKomi from "./components/ChatbotKomi";
import NotificationManager from "./components/NotificationManager";
import { Product, CustomEstimate, AppNotification } from "./types";
import { MessageSquare, Bell, Sparkles, CheckCircle2, ShoppingBag } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  // ----------------------------------------------------
  // E-commerce & Cart State
  // ----------------------------------------------------
  const [cart, setCart] = React.useState<{ item: Product | CustomEstimate; quantity: number }[]>([]);
  const [isCartOpen, setIsCartOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [toast, setToast] = React.useState<string | null>(null);

  // ----------------------------------------------------
  // Chatbot & Notifications State
  // ----------------------------------------------------
  const [isChatOpen, setIsChatOpen] = React.useState(false);
  const [isNotifListOpen, setIsNotifListOpen] = React.useState(false);
  const [showBubble, setShowBubble] = React.useState(false);
  const [currentBubble, setCurrentBubble] = React.useState<AppNotification | null>(null);
  const [targetNotification, setTargetNotification] = React.useState<AppNotification | null>(null);

  // Core Notifications list
  const [notifications, setNotifications] = React.useState<AppNotification[]>([
    {
      id: "as-expiry",
      type: "as_expiry",
      level: "high", // Red Dot
      text: "출장 A/S 보증이 D-14! (2026-07-14까지)",
      dateStr: "오늘",
      active: true,
    },
    {
      id: "incomplete-estimate",
      type: "incomplete_estimate",
      level: "warning", // Orange Dot
      text: "만들던 게임용 견적 이어서 볼까요?",
      dateStr: "어제",
      active: true,
    },
    {
      id: "restock",
      type: "restock",
      level: "info", // Blue Dot
      text: "찜한 RTX 5060 재입고됐어요",
      dateStr: "방금 전",
      active: true,
    },
    {
      id: "first-visit",
      type: "first_visit",
      level: "info",
      text: "3분이면 맞춤 PC 추천받아요 👋",
      dateStr: "지금",
      active: false,
    },
    {
      id: "cart-abandoned",
      type: "cart_abandoned",
      level: "warning",
      text: "장바구니 견적, 아직 고민 중이세요?",
      dateStr: "방금 전",
      active: false,
    }
  ]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // ----------------------------------------------------
  // Schedulers for Proactive Trigger Alerts
  // ----------------------------------------------------
  React.useEffect(() => {
    // 1. Initial high urgency bubble (A/S Expiry) trigger after 1 second
    const asTimer = setTimeout(() => {
      const asNotif = notifications.find((n) => n.id === "as-expiry");
      if (asNotif && asNotif.active && !isChatOpen) {
        setCurrentBubble(asNotif);
        setShowBubble(true);
      }
    }, 1200);

    // 2. First-visit bubble trigger after 4 seconds of session
    const firstVisitTimer = setTimeout(() => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === "first-visit" ? { ...n, active: true } : n))
      );
      // Only display first visit bubble if we haven't opened chat yet
      if (!isChatOpen) {
        const fvNotif = {
          id: "first-visit",
          type: "first_visit" as const,
          level: "info" as const,
          text: "3분이면 맞춤 PC 추천받아요 👋",
          dateStr: "지금",
          active: true,
        };
        setCurrentBubble(fvNotif);
        setShowBubble(true);
      }
    }, 4500);

    return () => {
      clearTimeout(asTimer);
      clearTimeout(firstVisitTimer);
    };
  }, []);

  // Auto-collapse bubbles after 6 seconds of exposure
  React.useEffect(() => {
    if (showBubble) {
      const collapseTimer = setTimeout(() => {
        setShowBubble(false);
      }, 6000);
      return () => clearTimeout(collapseTimer);
    }
  }, [showBubble, currentBubble]);

  // ----------------------------------------------------
  // E-commerce Cart Operations
  // ----------------------------------------------------
  const handleAddToCart = (product: Product | CustomEstimate) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { item: product, quantity: 1 }];
    });

    const name = "name" in product ? product.name : product.title;
    showToast(`"${name}" 장바구니에 담겼습니다!`);

    // 3. Trigger "Cart Abandoned" warning notification 4 seconds after adding if they do not checkout
    setTimeout(() => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === "cart-abandoned" ? { ...n, active: true } : n))
      );
      if (!isCartOpen && !isChatOpen) {
        const caNotif = notifications.find((n) => n.id === "cart-abandoned");
        if (caNotif) {
          setCurrentBubble({ ...caNotif, active: true });
          setShowBubble(true);
        }
      }
    }, 4000);
  };

  const handleRemoveFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.item.id !== id));
  };

  const handleCheckout = () => {
    setCart([]);
    setIsCartOpen(false);
    showToast("🎉 주문 및 견적 신청서가 안전하게 접수되었습니다!");
  };

  // ----------------------------------------------------
  // Chatbot Connection & Deep Linking Route Handles
  // ----------------------------------------------------
  const handleOpenKomiWithProduct = (productName: string) => {
    setIsChatOpen(true);
    // Convey product inquiry trigger
    const prodNotif: AppNotification = {
      id: "product-query",
      type: "restock",
      level: "info",
      text: `${productName} 설명 요청`,
      active: true,
    };
    setTargetNotification(prodNotif);
  };

  const handleTriggerMenuLink = (menuId: string, label: string) => {
    if (menuId === "quick-estimate") {
      setIsChatOpen(true);
      const estimateNotif: AppNotification = {
        id: "estimate-start",
        type: "first_visit",
        level: "info",
        text: "스마트 PC 조립 견적 시작",
        active: true,
      };
      setTargetNotification(estimateNotif);
    } else if (menuId === "category-guide") {
      setIsChatOpen(true);
      const catNotif: AppNotification = {
        id: "category-query",
        type: "restock",
        level: "info",
        text: "CPU 부품 정보 설명",
        active: true,
      };
      setTargetNotification(catNotif);
    } else if (menuId === "as-center") {
      setIsChatOpen(true);
      const asNotif: AppNotification = {
        id: "as-query",
        type: "as_expiry",
        level: "high",
        text: "A/S 안심보증 조회",
        active: true,
      };
      setTargetNotification(asNotif);
    } else if (menuId === "home") {
      setSearchTerm("");
    }
  };

  const handleActionNotification = (notif: AppNotification) => {
    setIsChatOpen(true);
    setTargetNotification(notif);
    setShowBubble(false);
  };

  const handleDismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (currentBubble?.id === id) {
      setShowBubble(false);
    }
  };

  // Determine if persistent red dot badge should be on the chatbot button (A/S Expiry high alert is active)
  const isHighAlertActive = React.useMemo(() => {
    return notifications.some((n) => n.id === "as-expiry" && n.active);
  }, [notifications]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans select-none overflow-x-hidden relative" id="app-root">
      {/* Toast Notification Container */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-slate-900 text-white font-bold text-xs px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-2 border border-slate-800"
            id="app-toast-notif"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Compuzone E-commerce Header */}
      <StoreHeader
        cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
        onOpenCart={() => setIsCartOpen(true)}
        onSearch={setSearchTerm}
        onTriggerMenuLink={handleTriggerMenuLink}
      />

      {/* Main E-commerce Shop Display */}
      <StoreFront
        cart={cart}
        onAddToCart={handleAddToCart}
        onRemoveFromCart={handleRemoveFromCart}
        onAskKomiAboutProduct={handleOpenKomiWithProduct}
        searchTerm={searchTerm}
        onClearSearch={() => setSearchTerm("")}
        isCartOpen={isCartOpen}
        onCloseCart={() => setIsCartOpen(false)}
        onCheckout={handleCheckout}
        onTriggerMenuLink={handleTriggerMenuLink}
      />

      {/* Proactive Speech Bubbles & Multi Notification Center Popup */}
      <NotificationManager
        notifications={notifications}
        onCloseBubble={() => setShowBubble(false)}
        onActionNotification={handleActionNotification}
        showBubble={showBubble}
        currentBubbleNotification={currentBubble}
        isListOpen={isNotifListOpen}
        onToggleList={() => setIsNotifListOpen((p) => !p)}
        onDismissNotification={handleDismissNotification}
      />

      {/* Floating Chatbot Launch Trigger Buttons */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2" id="floating-launch-triggers">
        {/* Bell notification trigger */}
        <button
          onClick={() => setIsNotifListOpen((p) => !p)}
          className="p-3.5 bg-white hover:bg-slate-50 border border-slate-100 rounded-full text-slate-600 shadow-lg cursor-pointer flex items-center justify-center relative transition-transform duration-150 hover:scale-105"
          id="bell-launcher"
        >
          <Bell className="w-5 h-5" />
          {notifications.filter((n) => n.active).length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shadow" id="bell-badge">
              {notifications.filter((n) => n.active).length}
            </span>
          )}
        </button>

        {/* Core Chatbot widget icon */}
        <button
          onClick={() => setIsChatOpen((p) => !p)}
          className="h-14 w-14 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-800 hover:from-indigo-700 hover:to-indigo-900 text-white shadow-xl flex items-center justify-center text-2xl relative cursor-pointer transition-transform duration-150 hover:scale-105 border border-indigo-500/20"
          id="chatbot-launcher-btn"
        >
          <span>🤖</span>
          {/* Persistent Red Alert dot for A/S expiration */}
          {isHighAlertActive && (
            <span className="absolute top-0 right-0 flex h-3.5 w-3.5" id="high-alert-persistent-badge">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500 border border-white"></span>
            </span>
          )}
        </button>
      </div>

      {/* Chatbot Komi Interactive Overlay Panel */}
      <ChatbotKomi
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onAddToCart={handleAddToCart}
        onOpenCart={() => setIsCartOpen(true)}
        onViewProductDetail={handleOpenKomiWithProduct}
        activeNotification={targetNotification}
        onClearNotification={() => setTargetNotification(null)}
        onTriggerIncompleteEstimate={() => handleTriggerMenuLink("quick-estimate", "간편 조립 견적")}
        onOpenCartFromNotif={() => setIsCartOpen(true)}
      />
    </div>
  );
}
