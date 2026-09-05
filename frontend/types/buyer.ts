export type BuyerChatActionType =
  | "ACCEPT_NEGOTIATION"
  | "CONTINUE_NEGOTIATION"
  | "PLACE_ORDER"
  | "VIEW_ORDER_STATUS"
  | "PAY_NOW"
  | "VIEW_PRODUCT"
  | "VIEW_DETAILS"
  | "MAKE_OFFER";

export interface BuyerChatAction {
  id: string;
  label: string;
  type: BuyerChatActionType;
  negotiationId?: string;
  agreementId?: string;
  productId?: string;
  disabled?: boolean;
}

export interface BuyerChatActionPayload {
  type: BuyerChatActionType;
  negotiationId?: string;
  agreementId?: string;
  productId?: string;
}

export interface BuyerProduct {
  id: string;
  _id?: string;
  merchantId?: string;
  name: string;
  description?: string;
  category: string;
  price: number;
  inventory: number;
  deliveryDays: number;
  isNegotiable: boolean;
  imageUrl?: string;
  specifications?: Record<string, string | number | boolean>;
  tags?: string[];
  sku?: string;
  score?: number;
}

export interface BuyerSearchState {
  topic?: string | null;
  category?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  quantity?: number | null;
  sortBy?: string;
  requirements?: Record<string, string | number | boolean>;
  hardRequirements?: Record<string, string | number | boolean>;
  softPreferences?: Record<string, string | number | boolean>;
  selectedProductId?: string | null;
  selectedProductName?: string | null;
  negotiationId?: string | null;
  negotiationStatus?: string | null;
  agreementId?: string | null;
  agreementStatus?: string | null;
  discountPercent?: number | null;
  requestedFreeDelivery?: boolean | null;
}

export interface BuyerAgentResultData {
  conversationId: string;
  message: string;
  products: BuyerProduct[];
  selectedProduct?: BuyerProduct;
  searchState: BuyerSearchState;
  actions?: BuyerChatAction[];
  nextAction?: string;
  paymentReady?: boolean;
  agreement?: { id: string; status: string };
}

export interface BuyerChatApiResponse {
  success: boolean;
  data: BuyerAgentResultData;
}

export interface BuyerChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  products?: BuyerProduct[];
  selectedProduct?: BuyerProduct;
  actions?: BuyerChatAction[];
  searchState?: BuyerSearchState;
  paymentReady?: boolean;
  agreement?: { id: string; status: string };
}
