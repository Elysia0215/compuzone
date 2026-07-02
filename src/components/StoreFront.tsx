/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { PRODUCT_CATALOG } from "../catalog";
import { Product, CustomEstimate } from "../types";
import { Plus, Check, ShoppingBag, Eye, X, ArrowRight, MessageSquare, Trash2 } from "lucide-react";

interface StoreFrontProps {
  cart: { item: Product | CustomEstimate; quantity: number }[];
  onAddToCart: (product: Product | CustomEstimate) => void;
  onRemoveFromCart: (id: string) => void;
  onAskKomiAboutProduct: (productName: string) => void;
  searchTerm: string;
  onClearSearch: () => void;
  isCartOpen: boolean;
  onCloseCart: () => void;
  onCheckout: () => void;
  onTriggerMenuLink: (menuId: string, label: string) => void;
}

export default function StoreFront({
  cart,
  onAddToCart,
  onRemoveFromCart,
  onAskKomiAboutProduct,
  searchTerm,
  onClearSearch,
  isCartOpen,
  onCloseCart,
  onCheckout,
  onTriggerMenuLink,
}: StoreFrontProps) {
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);
  const [activeCategory, setActiveCategory] = React.useState<string>("전체");
  const [visibleCount, setVisibleCount] = React.useState<number>(8);

  const categories = [
    { label: "전체", value: "전체" },
    { label: "CPU", value: "CPU" },
    { label: "그래픽카드 (GPU)", value: "GPU" },
    { label: "메인보드 (MB)", value: "Motherboard" },
    { label: "메모리 (RAM)", value: "RAM" },
    { label: "SSD", value: "SSD" },
    { label: "파워 (PSU)", value: "Power" },
    { label: "쿨러/튜닝", value: "Cooler" },
  ];

  const handleCategoryChange = (catVal: string) => {
    setActiveCategory(catVal);
    setVisibleCount(8);
  };

  const filteredProducts = React.useMemo(() => {
    let list = PRODUCT_CATALOG;
    if (activeCategory !== "전체") {
      list = list.filter((p) => p.category === activeCategory);
    }
    if (!searchTerm) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term)
    );
  }, [searchTerm, activeCategory]);

  const totalCartPrice = React.useMemo(() => {
    return cart.reduce((sum, item) => sum + item.item.price * item.quantity, 0);
  }, [cart]);

  return (
    <div className="flex-1 bg-slate-50/50 pb-16" id="store-front">
      {/* Hero Banner */}
      {!searchTerm && (
        <section className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-800 text-white py-12 px-6 sm:px-12 relative overflow-hidden shadow-sm" id="store-hero">
          {/* Decorative shapes */}
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-blue-500 opacity-20 blur-2xl"></div>
          <div className="absolute -left-16 -bottom-16 w-64 h-64 rounded-full bg-indigo-500 opacity-20 blur-2xl"></div>

          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
            <div className="max-w-xl text-center md:text-left">
              <span className="bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4 inline-block shadow">
                KOMI SMART CHATBOT OPEN!
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight mt-2">
                인공지능 비서 <span className="underline decoration-red-500 decoration-2 underline-offset-4">코미</span>와 함께<br className="hidden sm:inline" />
                나만의 맞춤 PC 견적을 짜보세요!
              </h1>
              <p className="mt-4 text-blue-100 text-sm sm:text-base">
                사용자의 사용 목적, 조건, 예산에 최적화된 최신 3대 견적(가성비·균형·성능)을 3분 안에 산출하고, 실시간으로 AI 피드백을 전달합니다.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 justify-center md:justify-start">
                <button
                  onClick={() => onTriggerMenuLink("quick-estimate", "간편 조립 견적")}
                  className="bg-yellow-400 hover:bg-yellow-300 text-slate-900 font-bold px-5 py-2.5 rounded-lg text-sm transition-all shadow-md flex items-center gap-2 cursor-pointer"
                  id="hero-quick-estimate-btn"
                >
                  3분 PC 견적 시작하기
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onAskKomiAboutProduct("RTX 5060")}
                  className="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-all flex items-center gap-2 cursor-pointer"
                  id="hero-rtx-5060-btn"
                >
                  신상 RTX 5060 질문하기
                  <MessageSquare className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Komi Character Promo Box */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 max-w-sm w-full shadow-lg text-center">
              <div className="flex justify-center mb-3">
                <div className="w-16 h-16 rounded-full bg-blue-100 border border-white flex items-center justify-center animate-bounce shadow">
                  <span className="text-3xl">🤖</span>
                </div>
              </div>
              <h3 className="font-bold text-lg">AI 챗봇 &quot;코미&quot; 추천 가이드</h3>
              <p className="text-xs text-blue-100 mt-2 leading-relaxed">
                &quot;게이밍용 부품 설명이 필요하시거나, 내 컴퓨터의 남은 A/S 기간이 궁금하실 때도 오른쪽 아래 말풍선을 탭해서 코미를 불러주세요!&quot;
              </p>
              <div className="mt-4 flex flex-col gap-1.5 text-xs text-blue-200">
                <div className="flex items-center gap-1.5 justify-center">
                  <span className="text-yellow-400">●</span> 100% 실시간 하드웨어 지식 탑재
                </div>
                <div className="flex items-center gap-1.5 justify-center">
                  <span className="text-emerald-400">●</span> 주문 데이터 연동 스마트 보증조회
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Catalog Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8" id="store-main">
        <div className="flex items-center justify-between mb-6" id="catalog-header-sec">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {searchTerm ? `"${searchTerm}" 검색 결과` : "실시간 부품 카탈로그"}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {searchTerm ? `${filteredProducts.length}개의 부품이 발견되었습니다.` : "컴퓨존에서 선별한 신뢰도 최상급 PC 하드웨어 부품들입니다."}
            </p>
          </div>

          {searchTerm && (
            <button
              onClick={onClearSearch}
              className="text-xs text-blue-600 font-bold bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full cursor-pointer"
              id="clear-search-btn"
            >
              전체 보기로 돌아가기
            </button>
          )}
        </div>

        {/* Category Filters Bar */}
        <div className="flex flex-wrap gap-2 mb-6" id="category-filter-bar">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => handleCategoryChange(cat.value)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm border ${
                activeCategory === cat.value
                  ? "bg-blue-600 border-blue-700 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Catalog Grid */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 shadow-sm" id="empty-catalog">
            <span className="text-4xl">🔍</span>
            <p className="mt-4 text-base font-medium text-slate-700">검색어와 연관된 부품을 찾을 수 없습니다.</p>
            <p className="text-xs text-slate-400 mt-1">철자를 확인하거나 다른 검색어를 입력해주세요.</p>
            <button
              onClick={onClearSearch}
              className="mt-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm cursor-pointer"
              id="empty-catalog-reset"
            >
              전체 카탈로그 보기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" id="catalog-grid">
            {filteredProducts.slice(0, visibleCount).map((product) => (
              <div
                key={product.id}
                className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group relative"
                id={`product-card-${product.id}`}
              >
                {/* Category Badge */}
                <span className="absolute left-3 top-3 z-10 bg-slate-900/80 backdrop-blur text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
                  {product.category}
                </span>

                {/* Product Image */}
                <div className="relative aspect-video bg-slate-100 overflow-hidden cursor-pointer" onClick={() => setSelectedProduct(product)}>
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <span className="bg-white text-slate-900 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow">
                      <Eye className="w-3.5 h-3.5" /> 상세 보기
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors" title={product.name}>
                      {product.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                      {product.description}
                    </p>
                  </div>

                  <div className="mt-4">
                    {/* Price and Stock */}
                    <div className="flex items-center justify-between border-t border-slate-50 pt-3">
                      <span className="text-base font-black text-slate-900">
                        ₩{product.price.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                        재고있음
                      </span>
                    </div>

                    {/* Quick Buttons */}
                    <div className="grid grid-cols-2 gap-2 mt-3.5">
                      <button
                        onClick={() => onAskKomiAboutProduct(product.name)}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold py-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        id={`ask-btn-${product.id}`}
                      >
                        <MessageSquare className="w-3 h-3" /> 코미에게 질문
                      </button>
                      <button
                        onClick={() => onAddToCart(product)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                        id={`add-cart-btn-${product.id}`}
                      >
                        <Plus className="w-3 h-3" /> 장바구니 담기
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredProducts.length > visibleCount && (
          <div className="flex justify-center mt-8" id="load-more-container">
            <button
              onClick={() => setVisibleCount((prev) => prev + 8)}
              className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold px-6 py-2.5 rounded-xl text-xs shadow-sm hover:shadow transition-all cursor-pointer flex items-center gap-1.5"
              id="load-more-btn"
            >
              더보기 (+8개 부품)
            </button>
          </div>
        )}
      </main>

      {/* Disclaimer at home page bottom (P1) */}
      <footer className="max-w-7xl mx-auto px-4 mt-8 pb-4 text-center text-[11px] text-slate-400 font-semibold leading-relaxed border-t border-slate-200/60 pt-4">
        AI 추천은 참고용입니다. 실제 가격·재고는 변동될 수 있으며, 최종 구매 전 확인을 권장합니다.
      </footer>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" id="product-detail-modal">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative border border-slate-100">
            {/* Header image */}
            <div className="relative aspect-video bg-slate-100">
              <img
                src={selectedProduct.imageUrl}
                alt={selectedProduct.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <button
                onClick={() => setSelectedProduct(null)}
                className="absolute right-4 top-4 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors cursor-pointer"
                id="modal-close-btn"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="absolute left-4 bottom-4 bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                {selectedProduct.category}
              </span>
            </div>

            {/* Content body */}
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-900 leading-tight">
                {selectedProduct.name}
              </h2>
              <p className="text-2xl font-black text-slate-900 mt-2 border-b border-slate-100 pb-3">
                ₩{selectedProduct.price.toLocaleString()}
              </p>

              {/* Specs List */}
              <div className="mt-4 bg-slate-50 rounded-xl p-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">하드웨어 상세 정보</h4>
                <div className="grid grid-cols-2 gap-y-2 text-xs">
                  {Object.entries(selectedProduct.specs).map(([key, value]) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-slate-400 capitalize">{key}</span>
                      <span className="font-semibold text-slate-800 mt-0.5">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Product description */}
              <div className="mt-5">
                <h3 className="font-bold text-slate-800 text-sm">상품 개요</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {selectedProduct.description}
                </p>
              </div>

              {/* Pros & Cons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100/50">
                  <h4 className="font-bold text-emerald-800 text-xs flex items-center gap-1">
                    <span>👍</span> 특장점 (Pros)
                  </h4>
                  <ul className="text-slate-600 text-[11px] list-disc pl-4 mt-2 space-y-1 leading-relaxed">
                    {selectedProduct.pros.map((pro, idx) => (
                      <li key={idx}>{pro}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-rose-50/50 rounded-xl p-4 border border-rose-100/50">
                  <h4 className="font-bold text-rose-800 text-xs flex items-center gap-1">
                    <span>⚠️</span> 유의사항 (Cons)
                  </h4>
                  <ul className="text-slate-600 text-[11px] list-disc pl-4 mt-2 space-y-1 leading-relaxed">
                    {selectedProduct.cons.map((con, idx) => (
                      <li key={idx}>{con}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Recommended Users */}
              <div className="mt-5">
                <h4 className="font-bold text-slate-800 text-xs">이런 분들께 추천해요! (Recommended For)</h4>
                <ul className="text-slate-600 text-[11px] list-disc pl-4 mt-2 space-y-1 leading-relaxed">
                  {selectedProduct.recommendedUsers.map((user, idx) => (
                    <li key={idx}>{user}</li>
                  ))}
                </ul>
              </div>

              {/* Footer Actions */}
              <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                <button
                  onClick={() => {
                    onAskKomiAboutProduct(selectedProduct.name);
                    setSelectedProduct(null);
                  }}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-4 py-2.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  id="modal-ask-btn"
                >
                  <MessageSquare className="w-4 h-4" /> 코미에게 실시간 AI 질문
                </button>
                <button
                  onClick={() => {
                    onAddToCart(selectedProduct);
                    setSelectedProduct(null);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  id="modal-add-cart-btn"
                >
                  <Plus className="w-4 h-4" /> 장바구니에 부품 추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" id="cart-drawer-overlay">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity" onClick={onCloseCart}></div>

          <div className="absolute inset-y-0 right-0 max-w-md w-full bg-white flex flex-col shadow-2xl border-l border-slate-100">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-800 text-base">장바구니 견적</h3>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {cart.length}개
                </span>
              </div>
              <button onClick={onCloseCart} className="p-1 rounded-full text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                  <span className="text-4xl mb-3">🛒</span>
                  <p className="font-semibold text-slate-600 text-sm">장바구니가 텅 비어 있습니다.</p>
                  <p className="text-xs text-slate-400 mt-1">상단의 부품을 추가하거나, 코미 챗봇의 맞춤 견적 카드를 담아보세요!</p>
                  <button
                    onClick={() => {
                      onCloseCart();
                      onTriggerMenuLink("quick-estimate", "간편 조립 견적");
                    }}
                    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs cursor-pointer shadow-sm"
                    id="cart-quick-estimate-btn"
                  >
                    코미와 견적 짜러가기
                  </button>
                </div>
              ) : (
                cart.map((item, idx) => (
                  <div key={idx} className="flex gap-3 bg-slate-50 border border-slate-100 p-3.5 rounded-xl justify-between items-center group relative">
                    <div className="flex-1">
                      <span className="text-[9px] bg-slate-900 text-white font-extrabold px-1.5 py-0.5 rounded uppercase">
                        {"category" in item.item ? item.item.category : "조립 PC 견적"}
                      </span>
                      <h4 className="font-bold text-slate-800 text-xs mt-1.5 leading-snug line-clamp-1">
                        {"name" in item.item ? item.item.name : item.item.title}
                      </h4>
                      <p className="text-xs text-blue-600 font-extrabold mt-1">
                        ₩{item.item.price.toLocaleString()} x {item.quantity}
                      </p>
                    </div>
                    <button
                      onClick={() => onRemoveFromCart(item.item.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      id={`remove-cart-item-${item.item.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer Summary */}
            {cart.length > 0 && (
              <div className="p-5 border-t border-slate-100 bg-slate-50">
                <div className="flex items-center justify-between text-sm mb-4">
                  <span className="text-slate-500 font-medium">총 견적 합계액</span>
                  <span className="text-lg font-black text-slate-900">
                    ₩{totalCartPrice.toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={onCloseCart}
                    className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    쇼핑 계속하기
                  </button>
                  <button
                    onClick={onCheckout}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-sm transition-colors cursor-pointer"
                    id="checkout-btn"
                  >
                    견적 주문하기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
