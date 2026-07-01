/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { AppNotification } from "../types";
import { X, Bell, ShieldAlert, AlertTriangle, Info, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface NotificationManagerProps {
  notifications: AppNotification[];
  onCloseBubble: () => void;
  onActionNotification: (notification: AppNotification) => void;
  showBubble: boolean;
  currentBubbleNotification: AppNotification | null;
  isListOpen: boolean;
  onToggleList: () => void;
  onDismissNotification: (id: string) => void;
}

export default function NotificationManager({
  notifications,
  onCloseBubble,
  onActionNotification,
  showBubble,
  currentBubbleNotification,
  isListOpen,
  onToggleList,
  onDismissNotification,
}: NotificationManagerProps) {
  const sortedNotifications = React.useMemo(() => {
    const priority = { high: 3, warning: 2, info: 1 };
    return [...notifications].sort((a, b) => priority[b.level] - priority[a.level]);
  }, [notifications]);

  const activeCount = notifications.filter((n) => n.active).length;

  const getBadgeColor = (level: string) => {
    switch (level) {
      case "high":
        return "bg-rose-500 border-rose-600 text-rose-500";
      case "warning":
        return "bg-amber-500 border-amber-600 text-amber-500";
      default:
        return "bg-indigo-500 border-indigo-600 text-indigo-500";
    }
  };

  const getIcon = (level: string) => {
    switch (level) {
      case "high":
        return <ShieldAlert className="w-4 h-4 text-rose-600" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-amber-600" />;
      default:
        return <Info className="w-4 h-4 text-indigo-600" />;
    }
  };

  return (
    <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none" id="notification-manager-container">
      {/* 1. Proactive Speech Bubble (Sliding AnimatePresence) */}
      <AnimatePresence>
        {showBubble && currentBubbleNotification && (
          <motion.div
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9 }}
            className="pointer-events-auto bg-white border border-slate-100 rounded-2xl p-4 shadow-xl max-w-sm w-80 relative flex gap-3 cursor-pointer select-none hover:shadow-2xl transition-shadow group"
            id={`proactive-bubble-${currentBubbleNotification.id}`}
            onClick={() => onActionNotification(currentBubbleNotification)}
          >
            {/* Urgent Tag/Indicator */}
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border ${
              currentBubbleNotification.level === "high" ? "bg-rose-50 border-rose-100" :
              currentBubbleNotification.level === "warning" ? "bg-amber-50 border-amber-100" :
              "bg-indigo-50 border-indigo-100"
            }`}>
              {getIcon(currentBubbleNotification.level)}
            </div>

            <div className="flex-1 pr-4">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${
                  currentBubbleNotification.level === "high" ? "bg-rose-500 animate-pulse" :
                  currentBubbleNotification.level === "warning" ? "bg-amber-500" : "bg-indigo-500"
                }`}></span>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  {currentBubbleNotification.level === "high" ? "긴급 공지" :
                   currentBubbleNotification.level === "warning" ? "알림 가이드" : "정보 안내"}
                </span>
              </div>
              <p className="text-xs text-slate-800 font-bold mt-1 leading-snug">
                {currentBubbleNotification.text}
              </p>
              <div className="flex items-center gap-1 text-[10px] text-indigo-600 font-extrabold mt-1.5 group-hover:underline">
                확인하러 가기 <ArrowRight className="w-3 h-3" />
              </div>
            </div>

            {/* Close Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseBubble();
              }}
              className="absolute top-3.5 right-3.5 p-1 rounded-full text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer"
              id="close-bubble-btn"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Notification List Center Drawer Overlay */}
      <AnimatePresence>
        {isListOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="pointer-events-auto bg-white border border-slate-100 rounded-2xl shadow-2xl p-4 w-80 max-h-96 overflow-y-auto flex flex-col"
            id="notification-center-drawer"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
              <div className="flex items-center gap-1.5 text-slate-800 font-bold text-sm">
                <Bell className="w-4 h-4 text-indigo-600" />
                <span>스마트 알림 센터 ({activeCount})</span>
              </div>
              <button onClick={onToggleList} className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
              {sortedNotifications.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  <span>📭</span>
                  <p className="mt-1 font-semibold">새로운 알림이 없습니다.</p>
                </div>
              ) : (
                sortedNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-3 rounded-xl border flex gap-2.5 items-start cursor-pointer transition-all hover:border-slate-200 ${
                      notif.active ? "bg-slate-50/50 border-slate-100" : "bg-slate-100/30 border-slate-100 opacity-60"
                    }`}
                    onClick={() => {
                      onActionNotification(notif);
                      onToggleList();
                    }}
                    id={`notif-item-${notif.id}`}
                  >
                    <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center border ${
                      notif.level === "high" ? "bg-rose-50 border-rose-100" :
                      notif.level === "warning" ? "bg-amber-50 border-amber-100" :
                      "bg-indigo-50 border-indigo-100"
                    }`}>
                      {getIcon(notif.level)}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${
                          notif.level === "high" ? "text-rose-600" :
                          notif.level === "warning" ? "text-amber-600" : "text-indigo-600"
                        }`}>
                          {notif.level === "high" ? "긴급" : notif.level === "warning" ? "주의" : "정보"}
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">{notif.dateStr}</span>
                      </div>
                      <p className="text-[11px] text-slate-700 font-semibold leading-tight mt-1">
                        {notif.text}
                      </p>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDismissNotification(notif.id);
                      }}
                      className="text-slate-300 hover:text-rose-600 p-0.5 rounded transition-colors cursor-pointer self-start"
                      title="알림 지우기"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
