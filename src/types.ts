/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  specs: {
    cpu?: string;
    gpu?: string;
    ram?: string;
    ssd?: string;
    power?: string;
    mb?: string;
    [key: string]: string | undefined;
  };
  imageUrl?: string;
  description: string;
  pros: string[];
  cons: string[];
  recommendedUsers: string[];
  stockStatus: "in_stock" | "out_of_stock";
}

export interface CustomEstimate {
  id: string;
  title: string;
  price: number;
  specs: {
    cpu: string;
    gpu: string;
    ram: string;
    ssd: string;
    power: string;
    mb: string;
  };
  reason: string;
}

export type MessageType =
  | "text"
  | "options"
  | "deep_link"
  | "loading"
  | "recommend_results"
  | "as_info"
  | "counselor_choices"
  | "parts_info"
  | "product_info";

export interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: Date;
  type: MessageType;
  options?: { label: string; action: string }[];
  deepLink?: { label: string; url: string; menuId?: string };
  data?: any;
}

export type NotificationType =
  | "as_expiry"
  | "incomplete_estimate"
  | "cart_abandoned"
  | "restock"
  | "first_visit";

export type NotificationLevel = "high" | "warning" | "info"; // Red, Orange, Blue

export interface AppNotification {
  id: string;
  type: NotificationType;
  level: NotificationLevel;
  text: string;
  dateStr?: string;
  actionPayload?: any;
  active: boolean;
}

export interface ASOrder {
  orderId: string;
  orderDate: string;
  productName: string;
  purchasePrice: number;
  warrantyExpiry: string;
  warrantyStatus: string; // "active" | "expired"
  monthsLeft: number;
}
