import mongoose, { Schema, Document, type Types } from "mongoose";

// ─────────────────────────────────────────────────────────
// Sub-document: embedded message
// ─────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface IConversationMessage {
  role: MessageRole;
  content: string;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────
// Sub-document: BuyerState as stored in MongoDB
// Maps 1-to-1 with BuyerState from buyerState.ts.
// ─────────────────────────────────────────────────────────

export interface IStoredBuyerState {
  topic?: string | null;
  category?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  quantity?: number | null;
  sortBy: "relevance" | "price_asc" | "price_desc";
  requirements: Record<string, string | number | boolean>;
  hardRequirements?: Record<string, string | number | boolean>;
  softPreferences?: Record<string, string | number | boolean>;
  selectedProductId?: Types.ObjectId | null;
  selectedProductName?: string | null;
  negotiationId?: Types.ObjectId | string | null;
  negotiationStatus?: string | null;
  agreementId?: Types.ObjectId | string | null;
  agreementStatus?: string | null;
  paymentReady?: boolean | null;
  pendingAction?: string | null;
  buyerOffer?: number | null;
  discountPercent?: number | null;
  requestedFreeDelivery?: boolean | null;
  lastSearchCriteria?: Record<string, any>;
  searchResults?: string[];
  lastQuery?: string | null;
  turnCount: number;
}

// ─────────────────────────────────────────────────────────
// Conversation status
// ─────────────────────────────────────────────────────────

export type ConversationStatus = "active" | "expired" | "completed";

// ─────────────────────────────────────────────────────────
// Main document interface
// ─────────────────────────────────────────────────────────

export interface IConversation extends Document {
  conversationId: string;
  status: ConversationStatus;
  buyerState: IStoredBuyerState;
  messages: IConversationMessage[];
  searchResultProductIds: Types.ObjectId[];
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────
// Sub-schemas
// ─────────────────────────────────────────────────────────

const messageSchema = new Schema<IConversationMessage>(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "system", "tool"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  { _id: false }
);

const buyerStateSchema = new Schema<IStoredBuyerState>(
  {
    topic: { type: String, default: null },
    category: { type: String, default: null },
    minPrice: { type: Number, default: null },
    maxPrice: { type: Number, default: null },
    quantity: { type: Number, default: null },
    sortBy: {
      type: String,
      enum: ["relevance", "price_asc", "price_desc"],
      required: true,
      default: "relevance",
    },
    requirements: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
    hardRequirements: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
    softPreferences: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
    selectedProductId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    selectedProductName: { type: String, default: null },
    negotiationId: {
      type: Schema.Types.Mixed,
      default: null,
    },
    negotiationStatus: { type: String, default: null },
    agreementId: {
      type: Schema.Types.Mixed,
      default: null,
    },
    agreementStatus: { type: String, default: null },
    paymentReady: { type: Boolean, default: null },
    pendingAction: { type: String, default: null },
    buyerOffer: { type: Number, default: null },
    discountPercent: { type: Number, default: null },
    requestedFreeDelivery: { type: Boolean, default: null },
    lastSearchCriteria: { type: Schema.Types.Mixed, default: null },
    searchResults: { type: [String], default: [] },
    lastQuery: { type: String, default: null },
    turnCount: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────
// Main schema
// ─────────────────────────────────────────────────────────

const conversationSchema = new Schema<IConversation>(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "expired", "completed"],
      required: true,
      default: "active",
    },
    buyerState: buyerStateSchema,
    messages: {
      type: [messageSchema],
      default: [],
    },
    searchResultProductIds: {
      type: [Schema.Types.ObjectId],
      ref: "Product",
      default: [],
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ─────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────

conversationSchema.index({ status: 1 });
conversationSchema.index({ expiresAt: 1 });
conversationSchema.index({ updatedAt: -1 });

// ─────────────────────────────────────────────────────────
// Model
// ─────────────────────────────────────────────────────────

const Conversation = mongoose.model<IConversation>(
  "Conversation",
  conversationSchema
);

export default Conversation;
