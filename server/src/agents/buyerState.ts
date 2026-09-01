import type { PublicProduct } from "../services/productService.js";

export type ChatActionType =
  | "ACCEPT_NEGOTIATION"
  | "CONTINUE_NEGOTIATION"
  | "PLACE_ORDER"
  | "VIEW_ORDER_STATUS"
  | "PAY_NOW"
  | "VIEW_PRODUCT"
  | "VIEW_DETAILS"
  | "MAKE_OFFER";

export interface ChatAction {
  id: string;
  label: string;
  type: ChatActionType;
  negotiationId?: string;
  agreementId?: string;
  productId?: string;
  disabled?: boolean;
}

export interface ChatActionPayload {
  type: ChatActionType;
  negotiationId?: string;
  agreementId?: string;
  productId?: string;
}

// ─────────────────────────────────────────────────────────
// BuyerState — the commerce intent for a single session
// ─────────────────────────────────────────────────────────

export interface BuyerState {
  topic: string | null;
  category: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  quantity: number | null;
  sortBy: "relevance" | "price_asc" | "price_desc";
  requirements: Record<string, string | number | boolean>;
  hardRequirements: Record<string, string | number | boolean>;
  softPreferences: Record<string, string | number | boolean>;
  lastProducts: PublicProduct[];
  lastQuery: string | null;
  turnCount: number;
  searchResults: string[];
  selectedProductId: string | null;
  selectedProductName: string | null;
  negotiationId: string | null;
  negotiationStatus: string | null;
  agreementId?: string | null;
  agreementStatus?: string | null;
  paymentReady?: boolean | null;
  pendingAction?: string | null;
  buyerOffer?: number | null;
  discountPercent?: number | null;
  requestedFreeDelivery?: boolean | null;
}

export type CommerceQueryKind =
  | "PRODUCT_PRICE"
  | "PRODUCT_INVENTORY"
  | "PRODUCT_DELIVERY"
  | "PRODUCT_NEGOTIABILITY"
  | "PRODUCT_DETAILS"
  | "PRODUCT_CATEGORY"
  | "PRODUCT_AVAILABILITY"
  | "ORDER_QUANTITY_LIMIT"
  | "DISCOUNT_AVAILABILITY"
  | "DISCOUNT_LIMIT"
  | "SHIPPING_AVAILABILITY"
  | "SHIPPING_COST"
  | "NEGOTIATION_STATUS"
  | "CURRENT_OFFER"
  | "NEGOTIATION_LIMIT"
  | "AGREEMENT_STATUS"
  | "PAYMENT_READINESS"
  | "ORDER_TOTAL"
  | "PRICE_EXPLANATION"
  | "POLICY_EXPLANATION"
  | "UNSUPPORTED_QUERY";

export type CommerceQuerySubject =
  | "SELECTED_PRODUCT"
  | "CURRENT_NEGOTIATION"
  | "CURRENT_AGREEMENT"
  | "CURRENT_ORDER"
  | "MERCHANT_POLICY"
  | "CURRENT_SEARCH_RESULTS";

export interface CommerceQueryPayload {
  kind: CommerceQueryKind;
  subject?: CommerceQuerySubject;
  targetProductRef?: string | number;
}

export interface CommerceQueryResult {
  kind: CommerceQueryKind;
  answer: string;
  source:
  | "PRODUCT"
  | "POLICY"
  | "NEGOTIATION"
  | "ECONOMIC_ENGINE"
  | "AGREEMENT"
  | "APPROVAL"
  | "SYSTEM";
  data?: Record<string, any>;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
}

export type IntentType =
  | "NEW_SEARCH"
  | "UPDATE_SEARCH"
  | "SELECT_PRODUCT"
  | "PRODUCT_DETAILS"
  | "START_NEGOTIATION"
  | "CONTINUE_NEGOTIATION"
  | "BUYER_OFFER"
  | "ACCEPT_NEGOTIATION"
  | "REQUEST_FREE_DELIVERY"
  | "PLACE_ORDER"
  | "COMMERCE_QUERY"
  | "CLARIFICATION_REQUIRED"
  | "OUT_OF_SCOPE";

export interface BuyerIntent {
  type: IntentType;
  /**
   * Fields to merge into the current BuyerState.
   * For NEW_SEARCH this replaces most state.
   * For UPDATE_SEARCH only the provided fields are updated.
   * For SELECT_PRODUCT selection details are updated.
   */
  updates: {
    topic?: string | null;
    category?: string | null;
    minPrice?: number | null;
    maxPrice?: number | null;
    quantity?: number | null;
    sortBy?: "relevance" | "price_asc" | "price_desc";
    requirements?: Record<string, string | number | boolean>;
    hardRequirements?: Record<string, string | number | boolean>;
    softPreferences?: Record<string, string | number | boolean>;
    selectedProductIndex?: number | null;
    selectedProductReference?: string | null;
    selectedProductId?: string | null;
    selectedProductName?: string | null;
    searchResults?: string[];
    negotiationId?: string | null;
    negotiationStatus?: string | null;
    agreementId?: string | null;
    agreementStatus?: string | null;
    paymentReady?: boolean | null;
    pendingAction?: string | null;
    buyerOffer?: number | null;
    discountPercent?: number | null;
    requestedFreeDelivery?: boolean | null;
    query?: CommerceQueryPayload;
  };
  /**
   * Specific fields to explicitly clear (set to null/empty).
   */
  clearFields?: (keyof BuyerState)[];
  /** Only populated for CLARIFICATION_REQUIRED */
  clarificationQuestion?: string;
  /** Only populated for OUT_OF_SCOPE */
  outOfScopeMessage?: string;
}

// ─────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────

export const createEmptyState = (): BuyerState => ({
  topic: null,
  category: null,
  minPrice: null,
  maxPrice: null,
  quantity: null,
  sortBy: "relevance",
  requirements: {},
  hardRequirements: {},
  softPreferences: {},
  lastProducts: [],
  lastQuery: null,
  turnCount: 0,
  searchResults: [],
  selectedProductId: null,
  selectedProductName: null,
  negotiationId: null,
  negotiationStatus: null,
  agreementId: null,
  agreementStatus: null,
  paymentReady: null,
  pendingAction: null,
  buyerOffer: null,
  discountPercent: null,
  requestedFreeDelivery: null,
});

// ─────────────────────────────────────────────────────────
// mergeIntent — pure function, returns new state
// ─────────────────────────────────────────────────────────

export const mergeIntent = (
  current: BuyerState,
  intent: BuyerIntent
): BuyerState => {
  // For states that don't touch commerce intent
  if (
    intent.type === "CLARIFICATION_REQUIRED" ||
    intent.type === "OUT_OF_SCOPE" ||
    intent.type === "PRODUCT_DETAILS"
  ) {
    return { ...current, turnCount: current.turnCount + 1 };
  }

  if (intent.type === "NEW_SEARCH") {
    // Topic has changed — reset price/quantity/requirements/selection/negotiation, apply all updates
    const next: BuyerState = {
      ...createEmptyState(),
      turnCount: current.turnCount + 1,
    };

    const u = intent.updates;
    if (u.topic !== undefined) next.topic = u.topic;
    if (u.category !== undefined) next.category = u.category;
    if (u.minPrice !== undefined) next.minPrice = u.minPrice;
    if (u.maxPrice !== undefined) next.maxPrice = u.maxPrice;
    if (u.quantity !== undefined) next.quantity = u.quantity;
    if (u.sortBy !== undefined) next.sortBy = u.sortBy ?? "relevance";

    if (u.hardRequirements !== undefined) {
      next.hardRequirements = u.hardRequirements ?? {};
    } else if (u.requirements !== undefined) {
      next.hardRequirements = u.requirements ?? {};
    }

    if (u.softPreferences !== undefined) {
      next.softPreferences = u.softPreferences ?? {};
    }

    next.requirements = { ...next.hardRequirements };
    if (u.searchResults !== undefined) next.searchResults = u.searchResults ?? [];
    if (u.selectedProductId !== undefined) next.selectedProductId = u.selectedProductId;
    if (u.selectedProductName !== undefined) next.selectedProductName = u.selectedProductName;
    if (u.negotiationId !== undefined) next.negotiationId = u.negotiationId;
    if (u.negotiationStatus !== undefined) next.negotiationStatus = u.negotiationStatus;

    return next;
  }

  // UPDATE_SEARCH, SELECT_PRODUCT, START_NEGOTIATION, CONTINUE_NEGOTIATION — merge updates into current state
  const next: BuyerState = {
    ...current,
    turnCount: current.turnCount + 1,
  };

  const u = intent.updates;

  if (u.topic !== undefined && u.topic !== null) next.topic = u.topic;
  if (u.category !== undefined && u.category !== null) next.category = u.category;
  if (u.minPrice !== undefined && u.minPrice !== null) next.minPrice = u.minPrice;
  if (u.maxPrice !== undefined && u.maxPrice !== null) next.maxPrice = u.maxPrice;
  if (u.quantity !== undefined && u.quantity !== null) next.quantity = u.quantity;
  if (u.sortBy !== undefined) next.sortBy = u.sortBy ?? "relevance";

  if (u.searchResults !== undefined) next.searchResults = u.searchResults;
  if (u.selectedProductId !== undefined) next.selectedProductId = u.selectedProductId;
  if (u.selectedProductName !== undefined) next.selectedProductName = u.selectedProductName;
  if (u.negotiationId !== undefined) next.negotiationId = u.negotiationId;
  if (u.negotiationStatus !== undefined) next.negotiationStatus = u.negotiationStatus;
  if (u.agreementId !== undefined) next.agreementId = u.agreementId;
  if (u.agreementStatus !== undefined) next.agreementStatus = u.agreementStatus;
  if (u.paymentReady !== undefined) next.paymentReady = u.paymentReady;
  if (u.pendingAction !== undefined) next.pendingAction = u.pendingAction;
  if (u.buyerOffer !== undefined) next.buyerOffer = u.buyerOffer;
  if (u.discountPercent !== undefined) next.discountPercent = u.discountPercent;
  if (u.requestedFreeDelivery !== undefined) next.requestedFreeDelivery = u.requestedFreeDelivery;

  // Merge hardRequirements & softPreferences (additive with upgrade/downgrade support)
  const initialHard =
    current.hardRequirements && Object.keys(current.hardRequirements).length > 0
      ? current.hardRequirements
      : current.requirements || {};
  const updatedHard = { ...initialHard };
  const updatedSoft = { ...(current.softPreferences || {}) };

  if (u.hardRequirements && typeof u.hardRequirements === "object") {
    for (const [k, v] of Object.entries(u.hardRequirements)) {
      updatedHard[k] = v;
      delete updatedSoft[k]; // Upgrade from soft to hard
    }
  } else if (u.requirements && typeof u.requirements === "object") {
    for (const [k, v] of Object.entries(u.requirements)) {
      updatedHard[k] = v;
      delete updatedSoft[k];
    }
  }

  if (u.softPreferences && typeof u.softPreferences === "object") {
    for (const [k, v] of Object.entries(u.softPreferences)) {
      updatedSoft[k] = v;
      delete updatedHard[k]; // Downgrade from hard to soft
    }
  }

  next.hardRequirements = updatedHard;
  next.softPreferences = updatedSoft;
  next.requirements = { ...updatedHard };

  // Explicit clears
  if (intent.clearFields && intent.clearFields.length > 0) {
    for (const field of intent.clearFields) {
      if (field === "requirements" || field === "hardRequirements") {
        next.requirements = {};
        next.hardRequirements = {};
      } else if (field === "softPreferences") {
        next.softPreferences = {};
      } else if (field === "minPrice" || field === "maxPrice" || field === "quantity") {
        (next as any)[field] = null;
      } else if (field === "topic" || field === "category" || field === "lastQuery") {
        (next as any)[field] = null;
      } else if (field === "selectedProductId" || field === "selectedProductName") {
        (next as any)[field] = null;
      } else if (field === "negotiationId" || field === "negotiationStatus") {
        (next as any)[field] = null;
      } else if (field === "searchResults") {
        next.searchResults = [];
      } else if (field === "sortBy") {
        next.sortBy = "relevance";
      }
    }
  }

  return next;
};

// ─────────────────────────────────────────────────────────
// Derive search params from BuyerState
// ─────────────────────────────────────────────────────────

export interface DerivedSearchParams {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  quantity?: number;
  sortBy: "relevance" | "price_asc" | "price_desc";
  requirements?: Record<string, string | number | boolean>;
  hardRequirements?: Record<string, string | number | boolean>;
  softPreferences?: Record<string, string | number | boolean>;
  preferences?: Record<string, string | number | boolean>;
}

export const deriveSearchParams = (state: BuyerState): DerivedSearchParams => {
  const params: DerivedSearchParams = {
    sortBy: state.sortBy,
  };

  if (state.topic) params.query = state.topic;
  if (state.category) params.category = state.category;
  if (state.minPrice !== null) params.minPrice = state.minPrice;
  if (state.maxPrice !== null) params.maxPrice = state.maxPrice;
  if (state.quantity !== null) params.quantity = state.quantity;

  const hard =
    state.hardRequirements && Object.keys(state.hardRequirements).length > 0
      ? state.hardRequirements
      : state.requirements || {};
  const soft = state.softPreferences || {};

  if (Object.keys(hard).length > 0) {
    params.hardRequirements = hard;
    params.requirements = hard;
  }

  if (Object.keys(soft).length > 0) {
    params.softPreferences = soft;
    params.preferences = soft;
  }

  return params;
};
