export type NegotiationStatus = "ACTIVE" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export interface NegotiationHistoryItem {
  round: number;
  actor: "BUYER" | "MERCHANT";
  offer: number;
  timestamp: string;
}

export interface PopulatedProduct {
  _id?: string;
  id?: string;
  name: string;
  sku: string;
  price: number;
  costPrice?: number;
  category?: string;
  imageUrl?: string;
  deliveryDays?: number;
  isNegotiable?: boolean;
}

export interface PopulatedMerchant {
  _id?: string;
  id?: string;
  name: string;
  businessName: string;
  email: string;
  currency?: string;
}

export interface PopulatedPolicy {
  _id?: string;
  id?: string;
  name: string;
  maxDiscountPercent: number;
  minMarginPercent: number;
  freeShippingThreshold: number;
  autoApprovalLimit: number;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string | Date;
}

export interface ConversationInfo {
  conversationId: string;
  messages: ConversationMessage[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface AuditEventInfo {
  eventType: string;
  actorType: string;
  actorId?: string;
  description: string;
  data?: Record<string, unknown>;
  createdAt: string | Date;
}

export interface Negotiation {
  _id?: string;
  id?: string;
  merchantId: string | PopulatedMerchant;
  productId: string | PopulatedProduct;
  policyId?: string | PopulatedPolicy;
  status: NegotiationStatus;
  quantity: number;
  currency: string;
  originalUnitPrice: number;
  currentBuyerOffer?: number;
  currentMerchantOffer?: number;
  currentDiscountPercent?: number;
  currentMarginPercent?: number;
  currentRound: number;
  maxRounds: number;
  acceptedPrice?: number;
  finalOrderValue?: number;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  history?: NegotiationHistoryItem[];
  conversation?: ConversationInfo | null;
  auditEvents?: AuditEventInfo[];
  freeDeliveryEligible?: boolean;
}

export interface NegotiationPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface NegotiationsListApiResponse {
  success: boolean;
  data: Negotiation[];
  pagination?: NegotiationPagination;
}

export interface SingleNegotiationApiResponse {
  success: boolean;
  data: Negotiation;
}
