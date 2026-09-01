import mongoose, { type Types } from "mongoose";
import Conversation, {
  type IConversation,
  type ConversationStatus,
  type MessageRole,
  type IConversationMessage,
} from "../models/Conversation.js";
import {
  createEmptyState,
  type BuyerState,
} from "../agents/buyerState.js";
import { AppCustomError } from "./negotiationService.js";

const CONVERSATION_TTL_MINUTES = 30;

// ─────────────────────────────────────────────────────────
// Helper: Generate conversationId
// ─────────────────────────────────────────────────────────

export const generateConversationId = (): string => {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `conv_${ts}_${rand}`;
};

// ─────────────────────────────────────────────────────────
// Helper: Convert Mongoose stored state to pure BuyerState
// ─────────────────────────────────────────────────────────

export const storedStateToBuyerState = (
  stored: any,
  searchResultProductIds?: any[]
): BuyerState => {
  if (!stored) {
    return createEmptyState();
  }

  // Handle Mongoose Map or object for requirements
  let hardObj: Record<string, string | number | boolean> = {};
  if (stored.hardRequirements) {
    if (stored.hardRequirements instanceof Map) {
      hardObj = Object.fromEntries(stored.hardRequirements.entries());
    } else if (typeof stored.hardRequirements === "object") {
      hardObj = { ...stored.hardRequirements };
    }
  } else if (stored.requirements) {
    if (stored.requirements instanceof Map) {
      hardObj = Object.fromEntries(stored.requirements.entries());
    } else if (typeof stored.requirements === "object") {
      hardObj = { ...stored.requirements };
    }
  }

  let softObj: Record<string, string | number | boolean> = {};
  if (stored.softPreferences) {
    if (stored.softPreferences instanceof Map) {
      softObj = Object.fromEntries(stored.softPreferences.entries());
    } else if (typeof stored.softPreferences === "object") {
      softObj = { ...stored.softPreferences };
    }
  }

  let selId: string | null = null;
  if (stored.selectedProductId) {
    selId = typeof stored.selectedProductId === "object" && stored.selectedProductId.toString
      ? stored.selectedProductId.toString()
      : String(stored.selectedProductId);
  }

  let negId: string | null = null;
  if (stored.negotiationId) {
    negId = typeof stored.negotiationId === "object" && stored.negotiationId.toString
      ? stored.negotiationId.toString()
      : String(stored.negotiationId);
  }

  let agrId: string | null = null;
  if (stored.agreementId) {
    agrId = typeof stored.agreementId === "object" && stored.agreementId.toString
      ? stored.agreementId.toString()
      : String(stored.agreementId);
  }

  let searchResults: string[] = [];
  if (Array.isArray(stored.searchResults) && stored.searchResults.length > 0) {
    searchResults = stored.searchResults.map((id: any) => id.toString());
  } else if (Array.isArray(searchResultProductIds) && searchResultProductIds.length > 0) {
    searchResults = searchResultProductIds.map((id: any) => id.toString());
  }

  return {
    topic: stored.topic ?? null,
    category: stored.category ?? null,
    minPrice: stored.minPrice ?? null,
    maxPrice: stored.maxPrice ?? null,
    quantity: stored.quantity ?? null,
    sortBy: stored.sortBy ?? "relevance",
    requirements: hardObj,
    hardRequirements: hardObj,
    softPreferences: softObj,
    lastProducts: [], // hydrated dynamically if needed
    lastQuery: stored.lastQuery ?? null,
    turnCount: stored.turnCount ?? 0,
    searchResults,
    selectedProductId: selId,
    selectedProductName: stored.selectedProductName ?? null,
    negotiationId: negId,
    negotiationStatus: stored.negotiationStatus ?? null,
    agreementId: agrId,
    agreementStatus: stored.agreementStatus ?? null,
    paymentReady: stored.paymentReady ?? null,
    pendingAction: stored.pendingAction ?? null,
    buyerOffer: stored.buyerOffer ?? null,
    discountPercent: stored.discountPercent ?? null,
    requestedFreeDelivery: stored.requestedFreeDelivery ?? null,
  };
};

// ─────────────────────────────────────────────────────────
// 1. createConversation
// ─────────────────────────────────────────────────────────

export const createConversation = async (
  initialState?: Partial<BuyerState>,
  customConversationId?: string
): Promise<IConversation> => {
  const conversationId = customConversationId || generateConversationId();
  const baseState = createEmptyState();
  const state: BuyerState = {
    ...baseState,
    ...initialState,
  };

  const expiresAt = new Date(Date.now() + CONVERSATION_TTL_MINUTES * 60 * 1000);

  const effectiveHard =
    state.hardRequirements && Object.keys(state.hardRequirements).length > 0
      ? state.hardRequirements
      : state.requirements || {};

  const conversation = new Conversation({
    conversationId,
    status: "active",
    buyerState: {
      topic: state.topic,
      category: state.category,
      minPrice: state.minPrice,
      maxPrice: state.maxPrice,
      quantity: state.quantity,
      sortBy: state.sortBy,
      requirements: effectiveHard,
      hardRequirements: effectiveHard,
      softPreferences: state.softPreferences || {},
      lastQuery: state.lastQuery,
      turnCount: state.turnCount,
      searchResults: state.searchResults || [],
      selectedProductId: state.selectedProductId || null,
      selectedProductName: state.selectedProductName || null,
      negotiationId: state.negotiationId || null,
      negotiationStatus: state.negotiationStatus || null,
      agreementId: state.agreementId || null,
      agreementStatus: state.agreementStatus || null,
      paymentReady: state.paymentReady ?? null,
      pendingAction: state.pendingAction || null,
      buyerOffer: state.buyerOffer || null,
      discountPercent: state.discountPercent ?? null,
      requestedFreeDelivery: state.requestedFreeDelivery || null,
    },
    messages: [],
    searchResultProductIds: (state.searchResults || []).map((id) => new mongoose.Types.ObjectId(id)),
    expiresAt,
  });

  return await conversation.save();
};

// ─────────────────────────────────────────────────────────
// 2. getConversation
// ─────────────────────────────────────────────────────────

export const getConversation = async (
  conversationId: string
): Promise<IConversation | null> => {
  const doc = await Conversation.findOne({ conversationId });
  if (!doc) {
    return null;
  }

  // Check expiration
  if (doc.status === "active" && new Date() > doc.expiresAt) {
    doc.status = "expired";
    await doc.save();
  }

  return doc;
};

// ─────────────────────────────────────────────────────────
// 3. updateConversationState
// ─────────────────────────────────────────────────────────

export const updateConversationState = async (
  conversationId: string,
  buyerState: BuyerState
): Promise<IConversation | null> => {
  const effectiveHard =
    buyerState.hardRequirements && Object.keys(buyerState.hardRequirements).length > 0
      ? buyerState.hardRequirements
      : buyerState.requirements || {};

  const storedState = {
    topic: buyerState.topic,
    category: buyerState.category,
    minPrice: buyerState.minPrice,
    maxPrice: buyerState.maxPrice,
    quantity: buyerState.quantity,
    sortBy: buyerState.sortBy,
    requirements: effectiveHard,
    hardRequirements: effectiveHard,
    softPreferences: buyerState.softPreferences || {},
    lastQuery: buyerState.lastQuery,
    turnCount: buyerState.turnCount,
    searchResults: buyerState.searchResults || [],
    selectedProductId: buyerState.selectedProductId || null,
    selectedProductName: buyerState.selectedProductName || null,
    negotiationId: buyerState.negotiationId || null,
    negotiationStatus: buyerState.negotiationStatus || null,
    agreementId: buyerState.agreementId || null,
    agreementStatus: buyerState.agreementStatus || null,
    paymentReady: buyerState.paymentReady ?? null,
    pendingAction: buyerState.pendingAction || null,
    buyerOffer: buyerState.buyerOffer || null,
    discountPercent: buyerState.discountPercent ?? null,
    requestedFreeDelivery: buyerState.requestedFreeDelivery || null,
  };

  const updated = await Conversation.findOneAndUpdate(
    { conversationId },
    { $set: { buyerState: storedState } },
    { returnDocument: "after", runValidators: true }
  );

  return updated;
};

// ─────────────────────────────────────────────────────────
// 4. addMessage
// ─────────────────────────────────────────────────────────

export const addMessage = async (
  conversationId: string,
  role: MessageRole,
  content: string
): Promise<IConversation | null> => {
  const newMessage: IConversationMessage = {
    role,
    content,
    createdAt: new Date(),
  };

  const updated = await Conversation.findOneAndUpdate(
    { conversationId },
    { $push: { messages: newMessage } },
    { returnDocument: "after" }
  );

  return updated;
};

// ─────────────────────────────────────────────────────────
// 5. addSearchResults
// ─────────────────────────────────────────────────────────

export const addSearchResults = async (
  conversationId: string,
  productIds: (string | Types.ObjectId)[]
): Promise<IConversation | null> => {
  const strIds = productIds.map((id) => id.toString());
  const objectIds = strIds.map((id) => new mongoose.Types.ObjectId(id));

  const updated = await Conversation.findOneAndUpdate(
    { conversationId },
    {
      $set: {
        searchResultProductIds: objectIds,
        "buyerState.searchResults": strIds,
      },
    },
    { returnDocument: "after" }
  );

  return updated;
};

// ─────────────────────────────────────────────────────────
// 6. updateExpiration
// ─────────────────────────────────────────────────────────

export const updateExpiration = async (
  conversationId: string
): Promise<IConversation | null> => {
  const newExpiresAt = new Date(Date.now() + CONVERSATION_TTL_MINUTES * 60 * 1000);

  const updated = await Conversation.findOneAndUpdate(
    { conversationId },
    { $set: { expiresAt: newExpiresAt } },
    { returnDocument: "after" }
  );

  return updated;
};

// ─────────────────────────────────────────────────────────
// 7. expireConversation
// ─────────────────────────────────────────────────────────

export const expireConversation = async (
  conversationId: string
): Promise<IConversation | null> => {
  const updated = await Conversation.findOneAndUpdate(
    { conversationId },
    { $set: { status: "expired" } },
    { returnDocument: "after" }
  );

  return updated;
};

// ─────────────────────────────────────────────────────────
// 8. completeConversation
// ─────────────────────────────────────────────────────────

export const completeConversation = async (
  conversationId: string
): Promise<IConversation | null> => {
  const updated = await Conversation.findOneAndUpdate(
    { conversationId },
    { $set: { status: "completed" } },
    { returnDocument: "after" }
  );

  return updated;
};

// ─────────────────────────────────────────────────────────
// 9. clearConversationState
// ─────────────────────────────────────────────────────────

export const clearConversationState = async (
  conversationId: string
): Promise<IConversation | null> => {
  const emptyState = createEmptyState();
  const storedState = {
    topic: emptyState.topic,
    category: emptyState.category,
    minPrice: emptyState.minPrice,
    maxPrice: emptyState.maxPrice,
    quantity: emptyState.quantity,
    sortBy: emptyState.sortBy,
    requirements: emptyState.requirements,
    hardRequirements: emptyState.hardRequirements,
    softPreferences: emptyState.softPreferences,
    lastQuery: emptyState.lastQuery,
    turnCount: emptyState.turnCount,
    searchResults: [],
    selectedProductId: null,
    selectedProductName: null,
    negotiationId: null,
    negotiationStatus: null,
  };

  const updated = await Conversation.findOneAndUpdate(
    { conversationId },
    { $set: { buyerState: storedState, searchResultProductIds: [] } },
    { returnDocument: "after" }
  );

  return updated;
};
