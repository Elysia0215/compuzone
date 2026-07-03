/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Search, ShoppingCart, User, Cpu, ShieldAlert, FileText, Menu, ExternalLink } from "lucide-react";

interface StoreHeaderProps {
  cartCount: number;
  onOpenCart: () => void;
  onSearch: (term: string) => void;
  onTriggerMenuLink: (menuId: string, label: string) => void;
}

export default function StoreHeader({
  cartCount,
  onOpenCart,
  onSearch,
  onTriggerMenuLink,
}: StoreHeaderProps) {
  const [searchTerm, setSearchTerm] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      onSearch(searchTerm);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-100 bg-white shadow-sm" id="store-header">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand Logo */}
        <div className="flex items-center gap-8">
          <button
            onClick={() => onTriggerMenuLink("home", "홈")}
            className="flex items-center gap-2 cursor-pointer text-2xl font-black tracking-tight text-blue-600"
            id="brand-logo-btn"
          >
            <span className="bg-blue-600 px-2 py-0.5 rounded text-white font-mono font-extrabold text-xl mr-1">C</span>
            COMPUZONE <span className="text-xs font-semibold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded ml-2 border border-slate-100">KOMI</span>
          </button>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600">
            <button
              onClick={() => onTriggerMenuLink("quick-estimate", "간편 조립 견적")}
              className="hover:text-blue-600 transition-colors flex items-center gap-1 cursor-pointer"
              id="nav-quick-estimate"
            >
              <Cpu className="w-4 h-4 text-blue-500" />
              간편 조립 견적
            </button>
            <button
              onClick={() => onTriggerMenuLink("category-guide", "부품 가이드")}
              className="hover:text-blue-600 transition-colors flex items-center gap-1 cursor-pointer"
              id="nav-category-guide"
            >
              <FileText className="w-4 h-4 text-emerald-500" />
              부품 백과
            </button>
            <button
              onClick={() => onTriggerMenuLink("as-center", "A/S 안심케어")}
              className="hover:text-blue-600 transition-colors flex items-center gap-1 cursor-pointer"
              id="nav-as-center"
            >
              <ShieldAlert className="w-4 h-4 text-orange-500" />
              A/S 보증조회
            </button>
            <a
              href="https://m.compuzone.co.kr/main/main.htm"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 transition-colors flex items-center gap-1 cursor-pointer text-slate-600"
              id="nav-official-site"
            >
              <ExternalLink className="w-4 h-4 text-blue-600" />
              컴퓨존 공식몰
            </a>
          </nav>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSubmit} className="hidden sm:flex flex-1 max-w-md mx-8 relative">
          <input
            type="text"
            placeholder="RTX 5060, CPU, 메인보드 등 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-10 pl-4 pr-10 rounded-full bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-all text-slate-800"
            id="store-search-input"
          />
          <button
            type="submit"
            className="absolute right-3 top-2.5 text-slate-400 hover:text-blue-600 cursor-pointer"
            id="store-search-submit"
          >
            <Search className="w-5 h-5" />
          </button>
        </form>

        {/* User Info & Cart */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-700">홍길동님</span>
            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">VIP</span>
          </div>

          {/* Cart Icon */}
          <button
            onClick={onOpenCart}
            className="relative p-2.5 rounded-full hover:bg-slate-50 transition-colors text-slate-700 cursor-pointer border border-slate-100"
            id="cart-icon-btn"
          >
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white shadow" id="cart-badge">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
