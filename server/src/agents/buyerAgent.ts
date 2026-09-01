import mongoose from "mongoose";
import {
  searchProductsTool,
  getProductDetailsTool,
  startNegotiationTool,
  submitBuyerOfferTool,
  searchProductsToolDeclaration,
  getProductDetailsToolDeclaration,
} from "./tools/buyerTools.js";
import {
  getProductById,
  toPublicProduct,
  type PublicProduct,
} from "../services/productService.js";
import { AppCustomError, acceptNegotiation } from "../services/negotiationService.js";
import Policy from "../models/Policy.js";
import Product from "../models/Product.js";
import Negotiation, { type INegotiation } from "../models/Negotiation.js";
import Agreement from "../models/Agreement.js";
import { calculateEconomicOffer } from "../services/economicEngine.js";
import { createAgreementFromNegotiation, isPaymentReady } from "../services/agreementService.js";
import { createAuditEvent } from "../services/auditService.js";
import {
  createEmptyState,
  mergeIntent,
  deriveSearchParams,
  type BuyerState,
  type ChatAction,
  type ChatActionPayload,
  type ChatActionType,
  type CommerceQueryResult,
} from "./buyerState.js";
import { normalizeIntent } from "./intentNormalizer.js";
import {
  createConversation,
  getConversation,
  updateConversationState,
  addMessage,
  addSearchResults,
  updateExpiration,
  clearConversationState,
  storedStateToBuyerState,
} from "../services/conversationService.js";
import type { LLMProvider } from "../llm/llmProvider.js";
import { getLLMProvider } from "../llm/providerFactory.js";
import {
  selectProductFromSearchResults,
  type SelectionResult,
} from "./productResolver.js";
import { resolveCommerceQuery } from "../services/commerceQueryResolver.js";
import {
  buildCommercialResponseContext,
  validateCommercialResponseFacts,
} from "./buildCommercialResponseContext.js";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface BuyerAgentResult {
  message: string;
  products: PublicProduct[];
  selectedProduct?: PublicProduct;
  conversationId: string;
  searchState: {
    topic: string | null;
    category: string | null;
    minPrice: number | null;
    maxPrice: number | null;
    quantity: number | null;
    sortBy: string;
    requirements: Record<string, string | number | boolean>;
    hardRequirements: Record<string, string | number | boolean>;
    softPreferences: Record<string, string | number | boolean>;
    selectedProductId: string | null;
    selectedProductName: string | null;
    negotiationId: string | null;
    negotiationStatus: string | null;
    agreementId: string | null;
    agreementStatus: string | null;
    discountPercent?: number | null;
    requestedFreeDelivery?: boolean | null;
  };
  actions?: ChatAction[];
  commerceQuery?: CommerceQueryResult;
  nextAction?: string;
  agreement?: { id: string; status: string };
  paymentReady?: boolean;
  debug?: {
    intentSource: string;
  };
}

export interface CommercialResult {
  decision: "VALID" | "VALID_WITHOUT_DELIVERY" | "COUNTER_OFFER" | "EXPIRED" | "REJECT" | "DELIVERY_APPROVED" | "DELIVERY_REJECTED" | "ASK_TARGET";
  requestedTerms: {
    buyerOffer?: number | null;
    quantity: number;
    requestedFreeDelivery: boolean;
    discountPercent?: number | null;
    selectedProductName?: string | null;
  };
  commercialTerms: {
    unitPrice: number;
    quantity: number;
    freeDelivery: boolean;
    counterOfferPrice?: number;
    round?: number;
    maxRounds?: number;
    currency: string;
  };
  negotiationStatus: "ACTIVE" | "ACCEPTED" | "REJECTED" | "EXPIRED";
}

export function generateCommercialResponseFallback(result: CommercialResult): { message: string; nextAction?: string } {
  const { decision, requestedTerms, commercialTerms } = result;
  const currency = commercialTerms.currency || "INR";
  const currSym = currency === "INR" ? "₹" : `${currency} `;
  const formattedPrice = `${currSym}${commercialTerms.unitPrice.toLocaleString("en-IN")}`;
  const qtyText = commercialTerms.quantity > 1 ? ` for ${commercialTerms.quantity} units` : "";

  switch (decision) {
    case "VALID": {
      if (requestedTerms.requestedFreeDelivery) {
        return {
          message: `${formattedPrice} per unit${qtyText} works, and free delivery can be included. Would you like to accept these terms?`,
          nextAction: undefined,
        };
      }
      return {
        message: `${formattedPrice} per unit${qtyText} works within the current pricing rules. Would you like to accept these terms?`,
        nextAction: undefined,
      };
    }

    case "VALID_WITHOUT_DELIVERY": {
      return {
        message: `${formattedPrice} per unit${qtyText} works, but free delivery isn't available under the current terms. Would you like to accept ${formattedPrice} without free delivery?`,
        nextAction: undefined,
      };
    }

    case "COUNTER_OFFER": {
      const counterFormatted = `${currSym}${commercialTerms.counterOfferPrice?.toLocaleString("en-IN")}`;
      const roundInfo = `(Round ${commercialTerms.round} of ${commercialTerms.maxRounds})`;
      const buyerOfferFormatted = requestedTerms.buyerOffer
        ? `${currSym}${requestedTerms.buyerOffer.toLocaleString("en-IN")}`
        : "";

      if (requestedTerms.requestedFreeDelivery) {
        if (commercialTerms.freeDelivery) {
          const prefix = buyerOfferFormatted ? `Your offer of ${buyerOfferFormatted} was below the merchant's limit. ` : "";
          return {
            message: `${prefix}Free delivery is available, and the merchant's counter-offer is ${counterFormatted} per unit with free delivery ${roundInfo}.`,
            nextAction: "CONTINUE_NEGOTIATION",
          };
        } else {
          return {
            message: `The requested terms aren't available under the current merchant rules. The merchant's counter-offer is ${counterFormatted} per unit without free delivery ${roundInfo}.`,
            nextAction: "CONTINUE_NEGOTIATION",
          };
        }
      }

      return {
        message: `Your offer of ${buyerOfferFormatted} was below the merchant's limit. The merchant's counter-offer is ${counterFormatted} per unit ${roundInfo}.`,
        nextAction: "CONTINUE_NEGOTIATION",
      };
    }

    case "EXPIRED": {
      return {
        message: `Maximum negotiation rounds (${commercialTerms.maxRounds}) reached without agreement. The negotiation has expired.`,
        nextAction: undefined,
      };
    }

    case "DELIVERY_APPROVED": {
      return {
        message: "Yes, I can include free delivery with the current offer. Would you like to accept?",
        nextAction: undefined,
      };
    }

    case "DELIVERY_REJECTED": {
      return {
        message: "Free delivery isn't available under the current terms.",
        nextAction: undefined,
      };
    }

    case "ASK_TARGET": {
      if (requestedTerms.selectedProductName) {
        return {
          message: `Absolutely! You selected ${requestedTerms.selectedProductName}. What price were you hoping for?`,
          nextAction: "ASK_BUYER_TARGET",
        };
      }
      return {
        message: "Sure. What price were you hoping for?",
        nextAction: "ASK_BUYER_TARGET",
      };
    }

    case "REJECT":
    default: {
      if (requestedTerms.requestedFreeDelivery) {
        return {
          message: `The merchant's current rules don't allow the requested terms. The current offer is ${formattedPrice} per unit.`,
          nextAction: undefined,
        };
      }
      return {
        message: `The merchant's current rules don't allow a lower price than ${formattedPrice}.`,
        nextAction: undefined,
      };
    }
  }
}

/** Backward-compatible alias */
export const generateCommercialResponse = generateCommercialResponseFallback;

export interface RunBuyerAgentOptions {
  message?: string;
  action?: ChatActionPayload;
  conversationId?: string;
  /** Legacy: pass raw turns. Used for backward-compat with old test payloads */
  conversationContext?: ConversationTurn[];
  provider?: LLMProvider;
}

export const BUYER_AGENT_SYSTEM_INSTRUCTION = `
You are the Buyer Agent for an agentic commerce platform.
Your role is to communicate backend decisions clearly and naturally, not to make financial or commercial decisions.

RESPONSE GENERATION RULES:
1. The backend is the ONLY source of truth for:
   - prices
   - discounts
   - quantities
   - inventory
   - delivery
   - shipping
   - merchant policy
   - negotiation state
   - agreement state
   - payment readiness
2. Never invent or modify backend-provided commercial facts.
3. When backend provides a commercial result, communicate ALL relevant terms in a natural conversational response.
4. Do not use generic hardcoded responses when backend data contains additional commercial terms.
5. If the backend result contains freeDelivery: true, explicitly mention that free delivery is included.
6. If the backend result contains freeDelivery: false, explicitly say that free delivery is not included/available when relevant.
7. If the backend provides unitPrice, quantity, discount, freeDelivery, negotiationStatus, preserve those facts in the response.
8. Never call an offer "final" while negotiationStatus is ACTIVE. Use "current offer" instead.
9. Only describe an offer as accepted/final after the backend says: negotiationStatus = ACCEPTED.
10. Never decide whether an offer is valid yourself. The Economic Engine, Policy Engine, and Negotiation Engine are authoritative.
11. If the backend says the buyer's proposal is valid but still awaiting acceptance, ask whether the buyer wants to accept.
12. If the backend says the proposal is rejected or countered, explain the backend result without changing the values.
13. If the backend result contains free delivery, price, and quantity, communicate the complete commercial offer naturally.
14. If backend data is missing, do not guess it. Present prices in INR (₹).
`;

// ─────────────────────────────────────────────────────────
// Helper: Hydrate candidate products for reference resolution
// ─────────────────────────────────────────────────────────

const hydrateCandidateProducts = async (
  currentState: BuyerState
): Promise<PublicProduct[]> => {
  if (currentState.lastProducts && currentState.lastProducts.length > 0) {
    return currentState.lastProducts;
  }

  if (currentState.searchResults && currentState.searchResults.length > 0) {
    const products: PublicProduct[] = [];
    for (const id of currentState.searchResults) {
      try {
        const raw = await getProductById(id);
        if (raw && raw.status !== "inactive") {
          products.push(toPublicProduct(raw));
        }
      } catch {
        // Skip missing or invalid product IDs
      }
    }
    if (products.length > 0) {
      return products;
    }
  }

  if (currentState.topic || currentState.category) {
    try {
      const searchRes = await searchProductsTool(deriveSearchParams(currentState));
      return searchRes.products;
    } catch {
      return [];
    }
  }

  return [];
};

// ─────────────────────────────────────────────────────────
// Contextual Actions Generator
// ─────────────────────────────────────────────────────────

export const deriveContextualActions = async (
  state: BuyerState,
  overrideNegotiation?: INegotiation | null
): Promise<ChatAction[]> => {
  // 1. If agreement exists for this state
  if (state.agreementId) {
    try {
      const agreement = await Agreement.findById(state.agreementId);
      if (agreement) {
        if (agreement.status === "APPROVED") {
          return [
            {
              id: "pay_now",
              label: "Pay Now",
              type: "PAY_NOW",
              agreementId: agreement._id.toString(),
            },
          ];
        } else if (agreement.status === "PENDING_APPROVAL") {
          return [
            {
              id: "view_order_status",
              label: "View Order Status",
              type: "VIEW_ORDER_STATUS",
              agreementId: agreement._id.toString(),
            },
          ];
        }
      }
    } catch {
      // Fallback
    }
  }

  // 2. If negotiation exists
  const negId = overrideNegotiation?._id?.toString() || state.negotiationId;
  if (negId) {
    try {
      const negotiation = overrideNegotiation || (await Negotiation.findById(negId));
      if (negotiation) {
        // Check if an agreement already exists for this negotiation ID
        const existingAgreement = await Agreement.findOne({ negotiationId: negotiation._id });
        if (existingAgreement) {
          if (existingAgreement.status === "APPROVED") {
            return [
              {
                id: "pay_now",
                label: "Pay Now",
                type: "PAY_NOW",
                agreementId: existingAgreement._id.toString(),
              },
            ];
          } else if (existingAgreement.status === "PENDING_APPROVAL") {
            return [
              {
                id: "view_order_status",
                label: "View Order Status",
                type: "VIEW_ORDER_STATUS",
                agreementId: existingAgreement._id.toString(),
              },
            ];
          }
        }

        if (negotiation.status === "ACCEPTED") {
          return [
            {
              id: "place_order",
              label: "Place Order",
              type: "PLACE_ORDER",
              negotiationId: negotiation._id.toString(),
            },
          ];
        }

        if (negotiation.status === "ACTIVE") {
          const offerPrice = negotiation.currentMerchantOffer ?? negotiation.originalUnitPrice;
          if (offerPrice !== undefined) {
            const formattedPrice = `₹${offerPrice.toLocaleString("en-IN")}`;
            let hasFreeDelivery = false;
            if (negotiation.policyId) {
              try {
                const policy = await Policy.findById(negotiation.policyId);
                if (policy && policy.freeShippingThreshold !== undefined && policy.freeShippingThreshold !== null) {
                  const qty = state.quantity && state.quantity > 0 ? state.quantity : (negotiation.quantity || 1);
                  const orderValue = offerPrice * qty;
                  if (policy.freeShippingThreshold === 0 || orderValue >= policy.freeShippingThreshold) {
                    hasFreeDelivery = true;
                  }
                }
              } catch { }
            }
            const label = hasFreeDelivery
              ? `Accept ${formattedPrice} + Free Delivery`
              : `Accept ${formattedPrice}`;

            return [
              {
                id: "accept_offer",
                label,
                type: "ACCEPT_NEGOTIATION",
                negotiationId: negotiation._id.toString(),
              },
              {
                id: "continue_negotiation",
                label: "Continue Negotiating",
                type: "CONTINUE_NEGOTIATION",
                negotiationId: negotiation._id.toString(),
              },
            ];
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  return [];
};

// ─────────────────────────────────────────────────────────
// Deterministic Action Handler (No LLM usage for buttons)
// ─────────────────────────────────────────────────────────

export const processBuyerAction = async (
  conversationId: string,
  action: ChatActionPayload,
  currentState: BuyerState
): Promise<BuyerAgentResult> => {
  const { type, negotiationId: inputNegId, agreementId: inputAgrId, productId: inputProdId } = action;

  const targetNegId = inputNegId || currentState.negotiationId;
  const targetAgrId = inputAgrId || currentState.agreementId;

  if (type === "ACCEPT_NEGOTIATION") {
    if (!targetNegId) {
      throw new AppCustomError("NEGOTIATION_NOT_FOUND", "No active negotiation found to accept", 400);
    }

    if (!mongoose.Types.ObjectId.isValid(targetNegId)) {
      throw new AppCustomError("NEGOTIATION_NOT_FOUND", "Invalid negotiation ID format", 400);
    }

    if (inputNegId && currentState.negotiationId && inputNegId !== currentState.negotiationId) {
      throw new AppCustomError("NEGOTIATION_NOT_FOUND", "Negotiation does not belong to this conversation", 404);
    }

    const negotiation = await Negotiation.findById(targetNegId);
    if (!negotiation) {
      throw new AppCustomError("NEGOTIATION_NOT_FOUND", "Negotiation not found", 404);
    }

    if (currentState.selectedProductId && negotiation.productId.toString() !== currentState.selectedProductId) {
      throw new AppCustomError("INVALID_PRODUCT", "Negotiation product does not match selected product", 400);
    }

    if (negotiation.status === "EXPIRED") {
      throw new AppCustomError("NEGOTIATION_EXPIRED", "This negotiation has expired. You'll need to start a new negotiation.", 400);
    }

    if (negotiation.status === "ACCEPTED") {
      const acceptedPrice = negotiation.acceptedPrice ?? negotiation.currentMerchantOffer ?? negotiation.originalUnitPrice;
      const formattedPrice = `₹${acceptedPrice.toLocaleString("en-IN")}`;
      const msg = `Your negotiated price of ${formattedPrice} has already been accepted.`;

      const updatedState: BuyerState = {
        ...currentState,
        negotiationId: negotiation._id.toString(),
        negotiationStatus: "ACCEPTED",
        turnCount: currentState.turnCount + 1,
      };
      await updateConversationState(conversationId, updatedState);
      await addMessage(conversationId, "assistant", msg);

      const placeOrderAction: ChatAction = {
        id: "place_order",
        label: "Place Order",
        type: "PLACE_ORDER",
        negotiationId: negotiation._id.toString(),
      };

      return {
        message: msg,
        products: [],
        conversationId,
        searchState: publicSearchState(updatedState),
        actions: [placeOrderAction],
      };
    }

    if (negotiation.status !== "ACTIVE") {
      throw new AppCustomError("NEGOTIATION_NOT_ACTIVE", "This negotiation is no longer active.", 409);
    }

    const product = await Product.findById(negotiation.productId);
    const policy = await Policy.findById(negotiation.policyId);

    if (!product || !policy) {
      throw new AppCustomError("INVALID_PRODUCT", "Product or policy no longer exists", 400);
    }

    const offerPrice = negotiation.currentMerchantOffer ?? negotiation.originalUnitPrice;
    const econResult = calculateEconomicOffer({
      product,
      policy,
      quantity: negotiation.quantity,
      buyerOffer: offerPrice,
    });

    if (offerPrice < econResult.minimumAllowedUnitPrice) {
      const currentActions = await deriveContextualActions(currentState, negotiation);
      return {
        message: "The offer has changed. Let me show you the current offer.",
        products: [],
        conversationId,
        searchState: publicSearchState(currentState),
        actions: currentActions,
      };
    }

    const acceptedNeg = await acceptNegotiation(negotiation._id.toString(), offerPrice);

    await createAuditEvent({
      merchantId: acceptedNeg.merchantId,
      negotiationId: acceptedNeg._id,
      eventType: "NEGOTIATION_ACCEPTED",
      actorType: "BUYER",
      description: `Buyer accepted offer of ₹${offerPrice} per unit for ${acceptedNeg.quantity} units.`,
      data: { offerPrice, quantity: acceptedNeg.quantity, finalOrderValue: acceptedNeg.finalOrderValue },
    });

    const formattedPrice = `₹${offerPrice.toLocaleString("en-IN")}`;
    const msg = `Your negotiated price of ${formattedPrice} per unit has been accepted.`;

    const updatedState: BuyerState = {
      ...currentState,
      negotiationId: acceptedNeg._id.toString(),
      negotiationStatus: "ACCEPTED",
      turnCount: currentState.turnCount + 1,
    };

    await updateConversationState(conversationId, updatedState);
    await addMessage(conversationId, "assistant", msg);
    await updateExpiration(conversationId);

    const placeOrderAction: ChatAction = {
      id: "place_order",
      label: "Place Order",
      type: "PLACE_ORDER",
      negotiationId: acceptedNeg._id.toString(),
    };

    return {
      message: msg,
      products: [],
      conversationId,
      searchState: publicSearchState(updatedState),
      actions: [placeOrderAction],
    };
  }

  if (type === "CONTINUE_NEGOTIATION") {
    if (!targetNegId) {
      throw new AppCustomError("NEGOTIATION_NOT_FOUND", "No active negotiation found", 400);
    }

    if (inputNegId && currentState.negotiationId && inputNegId !== currentState.negotiationId) {
      throw new AppCustomError("NEGOTIATION_NOT_FOUND", "Negotiation does not belong to this conversation", 404);
    }

    const msg = "Sure. What price would you like to propose?";
    const updatedState: BuyerState = {
      ...currentState,
      negotiationStatus: "ACTIVE",
      turnCount: currentState.turnCount + 1,
    };

    await updateConversationState(conversationId, updatedState);
    await addMessage(conversationId, "assistant", msg);
    await updateExpiration(conversationId);

    return {
      message: msg,
      products: [],
      conversationId,
      searchState: publicSearchState(updatedState),
      actions: [],
    };
  }

  if (type === "PLACE_ORDER") {
    if (!targetNegId) {
      throw new AppCustomError("NEGOTIATION_NOT_FOUND", "No accepted negotiation found for placing order", 400);
    }

    if (inputNegId && currentState.negotiationId && inputNegId !== currentState.negotiationId) {
      throw new AppCustomError("NEGOTIATION_NOT_FOUND", "Negotiation does not belong to this conversation", 404);
    }

    // Reload negotiation from DB — do not trust state alone
    const negotiation = await Negotiation.findById(targetNegId);
    if (!negotiation) {
      throw new AppCustomError("NEGOTIATION_NOT_FOUND", "Negotiation not found", 404);
    }

    // Cross-conversation safety: verify negotiation belongs to the same merchant/product scope
    if (negotiation.status !== "ACCEPTED") {
      throw new AppCustomError("NEGOTIATION_NOT_ACCEPTED", "Negotiation is not in ACCEPTED status. Please accept a negotiation first.", 400);
    }

    // Idempotent Agreement creation — reuses existing if already created
    let agreement: any;
    try {
      agreement = await createAgreementFromNegotiation(negotiation._id.toString());
    } catch (err: any) {
      if (err?.code === "POLICY_VALIDATION_FAILED") {
        const msg = "The order could not be processed because the negotiated terms no longer meet the current merchant policy. Please start a new negotiation.";
        await addMessage(conversationId, "assistant", msg);
        return {
          message: msg,
          products: [],
          conversationId,
          searchState: publicSearchState(currentState),
          actions: [],
        };
      }
      if (err?.code === "INVALID_PRODUCT" || err?.code === "NEGOTIATION_NOT_FOUND") {
        const msg = "The product or negotiation is no longer available. Please search for products again.";
        await addMessage(conversationId, "assistant", msg);
        return {
          message: msg,
          products: [],
          conversationId,
          searchState: publicSearchState(currentState),
          actions: [],
        };
      }
      throw err;
    }

    const agreementId = agreement._id.toString();
    let paymentReadyResult = false;
    let msg: string;
    let nextAction: ChatAction;

    if (agreement.status === "APPROVED") {
      // Call isPaymentReady — do not infer from status alone
      try {
        const payResult = await isPaymentReady(agreementId);
        paymentReadyResult = payResult.paymentReady;
      } catch {
        paymentReadyResult = false;
      }

      if (paymentReadyResult) {
        const formattedVal = `₹${agreement.finalOrderValue.toLocaleString("en-IN")}`;
        msg = `Your order is approved and ready for payment! Total: ${formattedVal} for ${agreement.quantity} unit(s) at ₹${agreement.agreedUnitPrice.toLocaleString("en-IN")} each.`;
        nextAction = {
          id: "pay_now",
          label: "Pay Now",
          type: "PAY_NOW",
          agreementId,
        };
      } else {
        msg = "Your order is approved but not yet ready for payment. Please try again shortly.";
        nextAction = {
          id: "view_order_status",
          label: "View Order Status",
          type: "VIEW_ORDER_STATUS",
          agreementId,
        };
      }
    } else if (agreement.status === "PENDING_APPROVAL") {
      const formattedVal = `₹${agreement.finalOrderValue.toLocaleString("en-IN")}`;
      msg = `Your order has been submitted successfully! Total: ${formattedVal} for ${agreement.quantity} unit(s). It is currently waiting for merchant approval. We'll update you once it's approved.`;
      nextAction = {
        id: "view_order_status",
        label: "View Order Status",
        type: "VIEW_ORDER_STATUS",
        agreementId,
      };
    } else if (agreement.status === "REJECTED") {
      msg = "Unfortunately, your order was rejected by the merchant. Please contact support or start a new negotiation.";
      const updatedState: BuyerState = {
        ...currentState,
        negotiationId: negotiation._id.toString(),
        negotiationStatus: "ACCEPTED",
        agreementId,
        agreementStatus: agreement.status,
        paymentReady: false,
        turnCount: currentState.turnCount + 1,
      };
      await updateConversationState(conversationId, updatedState);
      await addMessage(conversationId, "assistant", msg);
      await updateExpiration(conversationId);
      return {
        message: msg,
        products: [],
        conversationId,
        searchState: publicSearchState(updatedState),
        actions: [],
        agreement: { id: agreementId, status: agreement.status },
        paymentReady: false,
      };
    } else if (agreement.status === "COMPLETED") {
      const formattedVal = `₹${agreement.finalOrderValue.toLocaleString("en-IN")}`;
      msg = `This order (${formattedVal}) has already been completed. Thank you for your purchase!`;
      const updatedState: BuyerState = {
        ...currentState,
        negotiationId: negotiation._id.toString(),
        negotiationStatus: "ACCEPTED",
        agreementId,
        agreementStatus: agreement.status,
        paymentReady: false,
        turnCount: currentState.turnCount + 1,
      };
      await updateConversationState(conversationId, updatedState);
      await addMessage(conversationId, "assistant", msg);
      await updateExpiration(conversationId);
      return {
        message: msg,
        products: [],
        conversationId,
        searchState: publicSearchState(updatedState),
        actions: [],
        agreement: { id: agreementId, status: agreement.status },
        paymentReady: false,
      };
    } else {
      // DRAFT / EXPIRED or unknown
      msg = `Your order status is: ${agreement.status}. Please contact support if this is unexpected.`;
      nextAction = {
        id: "view_order_status",
        label: "View Order Status",
        type: "VIEW_ORDER_STATUS",
        agreementId,
      };
    }

    // Audit event for buyer-initiated order placement
    await createAuditEvent({
      merchantId: negotiation.merchantId,
      negotiationId: negotiation._id,
      agreementId: agreement._id,
      eventType: "ORDER_PLACED",
      actorType: "BUYER",
      description: `Buyer placed order. Agreement status: ${agreement.status}. Payment ready: ${paymentReadyResult}.`,
      data: {
        agreementStatus: agreement.status,
        finalOrderValue: agreement.finalOrderValue,
        quantity: agreement.quantity,
        agreedUnitPrice: agreement.agreedUnitPrice,
        paymentReady: paymentReadyResult,
      },
    });

    const updatedState: BuyerState = {
      ...currentState,
      negotiationId: negotiation._id.toString(),
      negotiationStatus: "ACCEPTED",
      agreementId,
      agreementStatus: agreement.status,
      paymentReady: paymentReadyResult,
      turnCount: currentState.turnCount + 1,
    };

    await updateConversationState(conversationId, updatedState);
    await addMessage(conversationId, "assistant", msg);
    await updateExpiration(conversationId);

    return {
      message: msg,
      products: [],
      conversationId,
      searchState: publicSearchState(updatedState),
      actions: [nextAction!],
      agreement: { id: agreementId, status: agreement.status },
      paymentReady: paymentReadyResult,
    };
  }


  if (type === "VIEW_ORDER_STATUS") {
    if (!targetAgrId) {
      throw new AppCustomError("AGREEMENT_NOT_FOUND", "No agreement found for this order", 400);
    }

    const agreement = await Agreement.findById(targetAgrId);
    if (!agreement) {
      throw new AppCustomError("AGREEMENT_NOT_FOUND", "Agreement not found", 404);
    }

    const agreementId = agreement._id.toString();
    const formattedVal = `₹${agreement.finalOrderValue.toLocaleString("en-IN")}`;
    let msg: string;
    let nextAction: ChatAction;
    let paymentReadyResult = false;

    if (agreement.status === "APPROVED") {
      try {
        const payResult = await isPaymentReady(agreementId);
        paymentReadyResult = payResult.paymentReady;
      } catch {
        paymentReadyResult = false;
      }

      if (paymentReadyResult) {
        msg = `Your order of ${formattedVal} is approved and ready for payment!`;
        nextAction = {
          id: "pay_now",
          label: "Pay Now",
          type: "PAY_NOW",
          agreementId,
        };
      } else {
        msg = `Your order of ${formattedVal} is approved but not yet ready for payment. Please try again shortly.`;
        nextAction = {
          id: "view_order_status",
          label: "View Order Status",
          type: "VIEW_ORDER_STATUS",
          agreementId,
        };
      }
    } else if (agreement.status === "PENDING_APPROVAL") {
      msg = `Your order of ${formattedVal} is currently pending merchant approval.`;
      nextAction = {
        id: "view_order_status",
        label: "View Order Status",
        type: "VIEW_ORDER_STATUS",
        agreementId,
      };
    } else if (agreement.status === "REJECTED") {
      msg = `Your order of ${formattedVal} was rejected by the merchant. Please start a new negotiation.`;
      return {
        message: msg,
        products: [],
        conversationId,
        searchState: publicSearchState(currentState),
        actions: [],
        agreement: { id: agreementId, status: agreement.status },
        paymentReady: false,
      };
    } else if (agreement.status === "COMPLETED") {
      msg = `Your order of ${formattedVal} has already been completed. Thank you for your purchase!`;
      return {
        message: msg,
        products: [],
        conversationId,
        searchState: publicSearchState(currentState),
        actions: [],
        agreement: { id: agreementId, status: agreement.status },
        paymentReady: false,
      };
    } else {
      msg = `Your order status is: ${agreement.status}.`;
      nextAction = {
        id: "view_order_status",
        label: "View Order Status",
        type: "VIEW_ORDER_STATUS",
        agreementId,
      };
    }

    return {
      message: msg,
      products: [],
      conversationId,
      searchState: publicSearchState(currentState),
      actions: [nextAction!],
      agreement: { id: agreementId, status: agreement.status },
      paymentReady: paymentReadyResult,
    };
  }

  if (type === "PAY_NOW") {
    if (!targetAgrId) {
      throw new AppCustomError("AGREEMENT_NOT_FOUND", "No agreement found for payment", 400);
    }

    const agreement = await Agreement.findById(targetAgrId);
    if (!agreement) {
      throw new AppCustomError("AGREEMENT_NOT_FOUND", "Agreement not found", 404);
    }

    if (agreement.status !== "APPROVED") {
      throw new AppCustomError("ORDER_NOT_READY", "Order is not ready for payment", 400);
    }

    const agreementId = agreement._id.toString();

    // Call isPaymentReady — do not infer from status alone
    let paymentReadyResult = false;
    try {
      const payResult = await isPaymentReady(agreementId);
      paymentReadyResult = payResult.paymentReady;
    } catch {
      paymentReadyResult = false;
    }

    if (!paymentReadyResult) {
      throw new AppCustomError("ORDER_NOT_READY", "Order is approved but not yet ready for payment", 400);
    }

    const formattedVal = `₹${agreement.finalOrderValue.toLocaleString("en-IN")}`;
    const msg = `Payment ready! Proceeding to payment for your order of ${formattedVal} (${agreement.quantity} unit(s) at ₹${agreement.agreedUnitPrice.toLocaleString("en-IN")} each). (Test environment — no real charge made)`;

    const payAction: ChatAction = {
      id: "pay_now",
      label: "Pay Now",
      type: "PAY_NOW",
      agreementId,
    };

    return {
      message: msg,
      products: [],
      conversationId,
      searchState: publicSearchState(currentState),
      actions: [payAction],
      agreement: { id: agreementId, status: agreement.status },
      paymentReady: true,
    };
  }

  throw new AppCustomError("INVALID_ACTION", `Unsupported action type: ${type}`, 400);
};

// ─────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────

export const runBuyerAgent = async (
  messageOrOptions: string | RunBuyerAgentOptions,
  legacyContext: ConversationTurn[] = [],
  legacyConversationId?: string
): Promise<BuyerAgentResult> => {
  let message: string | undefined;
  let actionPayload: ChatActionPayload | undefined;
  let providedConversationId: string | undefined;
  let passedContext: ConversationTurn[];
  let customProvider: LLMProvider | undefined;

  if (typeof messageOrOptions === "string") {
    message = messageOrOptions;
    passedContext = legacyContext;
    providedConversationId = legacyConversationId;
  } else {
    message = messageOrOptions.message;
    actionPayload = messageOrOptions.action;
    providedConversationId = messageOrOptions.conversationId;
    passedContext = messageOrOptions.conversationContext ?? [];
    customProvider = messageOrOptions.provider;
  }

  console.log("[BUYER_AGENT] Incoming message/action:", JSON.stringify({ message, action: actionPayload }));

  if (!actionPayload && (!message || message.trim().length === 0)) {
    throw new AppCustomError("INVALID_INPUT", "Either message text or action is required", 400);
  }

  const provider = customProvider || getLLMProvider();

  // ── Session resolution via MongoDB ─────────────────────────
  let conversationId: string;
  let currentState: BuyerState;
  let history: ConversationTurn[] = [];

  if (providedConversationId) {
    const doc = await getConversation(providedConversationId);

    if (!doc) {
      throw new AppCustomError(
        "CONVERSATION_NOT_FOUND",
        "No conversation found for the supplied conversationId.",
        404
      );
    }

    if (doc.status === "expired") {
      throw new AppCustomError(
        "CONVERSATION_EXPIRED",
        "This conversation has expired. Start a new conversation by omitting conversationId.",
        410
      );
    }

    conversationId = doc.conversationId;
    currentState = storedStateToBuyerState(doc.buyerState, doc.searchResultProductIds);
    history = (doc.messages || []).map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    }));
  } else {
    const newDoc = await createConversation();
    conversationId = newDoc.conversationId;
    currentState = createEmptyState();
    history = [];
  }

  if (passedContext.length > 0 && history.length === 0) {
    history = [...passedContext];
  }

  // ── Action Request Handling (Bypasses LLM) ───────────────
  if (actionPayload) {
    return await processBuyerAction(conversationId, actionPayload, currentState);
  }

  // ── Check explicit "Start over" reset ─────────────────────
  const normalizedMsg = message!.trim().toLowerCase().replace(/[.]+$/, "");
  if (normalizedMsg === "start over") {
    await clearConversationState(conversationId);
    currentState = createEmptyState();
    console.log(`[BUYER_AGENT] Reset buyerState for conversation: ${conversationId}`);
  }

  try {
    // ── Step 1: Normalize intent via LLM Provider ─────
    console.log("[BUYER_AGENT] Extracting intent using provider:", provider.name);
    let intent = await normalizeIntent(
      message!,
      currentState,
      history,
      provider
    );
    console.log("[BUYER_AGENT] Intent:", JSON.stringify(intent));

    await addMessage(conversationId, "user", message!);
    history.push({ role: "user", content: message! });

    // ── Step 2: Handle non-search / selection / details / negotiation intents ──
    if (intent.type === "CLARIFICATION_REQUIRED") {
      const clarificationMsg =
        intent.clarificationQuestion ??
        "Could you clarify what you're looking for?";

      const updatedState = mergeIntent(currentState, intent);
      await updateConversationState(conversationId, updatedState);
      await addMessage(conversationId, "assistant", clarificationMsg);
      await updateExpiration(conversationId);

      return {
        message: clarificationMsg,
        products: [],
        conversationId,
        searchState: publicSearchState(updatedState),
      };
    }

    if (intent.type === "OUT_OF_SCOPE") {
      const outOfScopeMsg =
        intent.outOfScopeMessage ??
        "I'm here to help you find products. What would you like to shop for?";

      const updatedState = mergeIntent(currentState, intent);
      await updateConversationState(conversationId, updatedState);
      await addMessage(conversationId, "assistant", outOfScopeMsg);
      await updateExpiration(conversationId);

      return {
        message: outOfScopeMsg,
        products: [],
        conversationId,
        searchState: publicSearchState(updatedState),
      };
    }

    // ── Generic Commerce Query Intent ──
    if (intent.type === "COMMERCE_QUERY") {
      const queryResult = await resolveCommerceQuery(intent, currentState);
      const updatedState = mergeIntent(currentState, intent);

      await updateConversationState(conversationId, updatedState);
      await addMessage(conversationId, "assistant", queryResult.answer);
      await updateExpiration(conversationId);

      const contextualActions = await deriveContextualActions(updatedState);

      return {
        message: queryResult.answer,
        products: [],
        conversationId,
        searchState: publicSearchState(updatedState),
        actions: contextualActions,
        commerceQuery: queryResult,
      };
    }

    // ── Explicit Acceptance Intent ──
    if (intent.type === "ACCEPT_NEGOTIATION") {
      return await processBuyerAction(
        conversationId,
        {
          type: "ACCEPT_NEGOTIATION",
          negotiationId: intent.updates.negotiationId || currentState.negotiationId || undefined,
        },
        currentState
      );
    }

    // ── Place Order Intent (natural language → deterministic action) ──
    if (intent.type === "PLACE_ORDER") {
      return await processBuyerAction(
        conversationId,
        {
          type: "PLACE_ORDER",
          negotiationId: currentState.negotiationId || undefined,
          agreementId: currentState.agreementId || undefined,
        },
        currentState
      );
    }

    // ── Negotiation Intent Handling (START_NEGOTIATION / CONTINUE_NEGOTIATION / BUYER_OFFER) ──
    if (
      intent.type === "START_NEGOTIATION" ||
      intent.type === "CONTINUE_NEGOTIATION" ||
      intent.type === "BUYER_OFFER" ||
      intent.type === "REQUEST_FREE_DELIVERY"
    ) {
      // ─── 0. Resolve product reference if caller provided selectedProductIndex ───
      // This enables combined "I liked the second option, can we negotiate?" in one intent.
      const incomingIndex = intent.updates.selectedProductIndex;
      const incomingRef = intent.updates.selectedProductReference;

      if (
        intent.type === "START_NEGOTIATION" &&
        (incomingIndex !== undefined && incomingIndex !== null || incomingRef !== undefined)
      ) {
        const refToResolve: string | number = incomingIndex !== undefined && incomingIndex !== null
          ? incomingIndex
          : (incomingRef as string);

        // Hydrate candidate products from DB searchResult IDs (lastProducts is empty after DB load)
        let candidateProducts = currentState.lastProducts;
        if (
          (!candidateProducts || candidateProducts.length === 0) &&
          currentState.searchResults &&
          currentState.searchResults.length > 0
        ) {
          const fetched: typeof candidateProducts = [];
          for (const id of currentState.searchResults) {
            try {
              const p = await getProductById(id);
              if (p) fetched.push(toPublicProduct(p));
            } catch { }
          }
          candidateProducts = fetched;
        }

        const selResult = selectProductFromSearchResults(refToResolve, currentState, candidateProducts);

        if (!selResult.success) {
          // Out-of-range, no results, or ambiguous
          let errMsg = selResult.message;
          if (selResult.code === "NO_SEARCH_RESULTS") {
            errMsg = "There aren't any search results yet. Let me search for some products first.";
          } else if (selResult.code === "PRODUCT_REFERENCE_INVALID") {
            errMsg = `I only found ${candidateProducts.length} product(s). Which one would you like to negotiate?`;
          }
          await addMessage(conversationId, "assistant", errMsg);
          await updateExpiration(conversationId);
          return {
            message: errMsg,
            products: [],
            conversationId,
            searchState: publicSearchState(currentState),
          };
        }

        // Guard: accepted negotiation must not be overwritten
        if (currentState.negotiationStatus === "ACCEPTED") {
          const lockedMsg =
            "The current negotiation has already been accepted. To negotiate a different product, we need to start a separate negotiation.";
          await addMessage(conversationId, "assistant", lockedMsg);
          await updateExpiration(conversationId);
          return {
            message: lockedMsg,
            products: [],
            conversationId,
            searchState: publicSearchState(currentState),
          };
        }

        // Guard: if there's an ACTIVE negotiation for a DIFFERENT product, require explicit cancellation
        if (
          currentState.negotiationId &&
          currentState.negotiationStatus === "ACTIVE" &&
          currentState.selectedProductId !== selResult.selectedProductId
        ) {
          const switchMsg =
            `You currently have an active negotiation for ${currentState.selectedProductName || "a product"}. ` +
            `To switch to ${selResult.selectedProductName}, please finish or cancel that negotiation first.`;
          await addMessage(conversationId, "assistant", switchMsg);
          await updateExpiration(conversationId);
          return {
            message: switchMsg,
            products: [],
            conversationId,
            searchState: publicSearchState(currentState),
          };
        }

        // Switch selection and clear any previous negotiation for a different product
        const switchingProduct = currentState.selectedProductId !== selResult.selectedProductId;
        currentState = {
          ...currentState,
          selectedProductId: selResult.selectedProductId,
          selectedProductName: selResult.selectedProductName,
          negotiationId: switchingProduct ? null : currentState.negotiationId,
          negotiationStatus: switchingProduct ? null : currentState.negotiationStatus,
        };

        // Patch intent updates so mergeIntent persists the new selection
        intent = {
          ...intent,
          updates: {
            ...intent.updates,
            selectedProductId: selResult.selectedProductId,
            selectedProductName: selResult.selectedProductName,
            negotiationId: switchingProduct ? null : intent.updates.negotiationId,
            negotiationStatus: switchingProduct ? null : intent.updates.negotiationStatus,
          },
        };
      }

      // 1. Verify selectedProductId exists
      if (!currentState.selectedProductId) {
        let responseMsg = "Which product would you like me to negotiate for?";
        if (currentState.searchResults && currentState.searchResults.length > 0) {
          responseMsg += " You can choose a product first, such as the first or second option.";
        }

        await addMessage(conversationId, "assistant", responseMsg);
        await updateExpiration(conversationId);

        return {
          message: responseMsg,
          products: [],
          conversationId,
          searchState: publicSearchState(currentState),
        };
      }

      // 2. Fetch fresh Product from MongoDB
      let rawProduct: any = null;
      try {
        rawProduct = await getProductById(currentState.selectedProductId);
      } catch {
        // missing
      }

      if (!rawProduct || rawProduct.status === "inactive") {
        const notFoundMsg = "The selected product is no longer available.";
        await addMessage(conversationId, "assistant", notFoundMsg);
        await updateExpiration(conversationId);

        return {
          message: notFoundMsg,
          products: [],
          conversationId,
          searchState: publicSearchState(currentState),
        };
      }

      const selectedProd = toPublicProduct(rawProduct);

      // 3. Negotiability Check
      if (rawProduct.isNegotiable === false) {
        const notNegotiableMsg = "This product is not currently negotiable.";
        await addMessage(conversationId, "assistant", notNegotiableMsg);
        await updateExpiration(conversationId);

        return {
          message: notNegotiableMsg,
          products: [],
          selectedProduct: selectedProd,
          conversationId,
          searchState: publicSearchState(currentState),
        };
      }

      // 4. Inventory Check
      const requestedQty = intent.updates.quantity ?? currentState.quantity ?? 1;
      if (rawProduct.inventory < requestedQty) {
        let invMsg: string;
        if (rawProduct.inventory <= 0) {
          invMsg = `The selected product (${rawProduct.name}) is currently out of stock.`;
        } else {
          invMsg = `There are only ${rawProduct.inventory} units available, so I can't negotiate for ${requestedQty} units.`;
        }

        await addMessage(conversationId, "assistant", invMsg);
        await updateExpiration(conversationId);

        return {
          message: invMsg,
          products: [],
          selectedProduct: selectedProd,
          conversationId,
          searchState: publicSearchState(currentState),
        };
      }

      const merchantIdStr = rawProduct.merchantId?._id
        ? rawProduct.merchantId._id.toString()
        : rawProduct.merchantId.toString();

      const policy = await Policy.findOne({ merchantId: merchantIdStr, isActive: true });
      if (!policy || !policy.negotiationEnabled) {
        const policyDisabledMsg = "Negotiation is disabled for this merchant.";
        await addMessage(conversationId, "assistant", policyDisabledMsg);
        await updateExpiration(conversationId);

        return {
          message: policyDisabledMsg,
          products: [],
          selectedProduct: selectedProd,
          conversationId,
          searchState: publicSearchState(currentState),
        };
      }

      // 6. Execute Negotiation logic
      let negId = currentState.negotiationId;
      let isNewNegotiation = false;

      if (!negId) {
        // Start new negotiation
        const startRes = await startNegotiationTool({
          productId: rawProduct._id.toString(),
          quantity: requestedQty,
        });
        negId = startRes.negotiation.id;
        isNewNegotiation = true;
      }

      let activeNeg = await Negotiation.findById(negId);
      if (!activeNeg) {
        throw new AppCustomError("NEGOTIATION_NOT_FOUND", "Negotiation session not found", 404);
      }

      // If quantity changed on active negotiation, update it
      if (requestedQty !== activeNeg.quantity) {
        activeNeg.quantity = requestedQty;
        activeNeg.finalOrderValue = (activeNeg.currentMerchantOffer ?? activeNeg.originalUnitPrice) * requestedQty;
        await activeNeg.save();
      }

      // Check if negotiation is expired/completed
      if (activeNeg.status !== "ACTIVE") {
        let endedMsg = `This negotiation is currently ${activeNeg.status.toLowerCase()}.`;
        if (activeNeg.status === "ACCEPTED") {
          endedMsg = "The negotiation has already been accepted, so the agreed terms cannot be changed.";
        } else if (activeNeg.status === "EXPIRED") {
          endedMsg = `This negotiation has expired as the maximum rounds were reached.`;
        }

        await addMessage(conversationId, "assistant", endedMsg);
        await updateExpiration(conversationId);

        return {
          message: endedMsg,
          products: [],
          selectedProduct: selectedProd,
          conversationId,
          searchState: publicSearchState(currentState),
        };
      }

      const isFreeDelRequested = Boolean(intent.type === "REQUEST_FREE_DELIVERY" || intent.updates.requestedFreeDelivery || currentState.requestedFreeDelivery);
      let freeDelApproved = false;

      if (isFreeDelRequested && policy) {
        const checkPrice = intent.updates.buyerOffer || activeNeg.currentMerchantOffer || rawProduct.price;
        const totalVal = checkPrice * requestedQty;
        if (policy.freeShippingThreshold !== undefined && policy.freeShippingThreshold !== null) {
          if (policy.freeShippingThreshold === 0 || totalVal >= policy.freeShippingThreshold) {
            freeDelApproved = true;
          }
        }
        console.log(`[DELIVERY_POLICY] currentOfferUnitPrice: ${checkPrice}, quantity: ${requestedQty}, orderValue: ${totalVal}, freeShippingThreshold: ${policy.freeShippingThreshold}, freeDeliveryEligible: ${freeDelApproved}`);
      }

      // If buyer submitted a specific numeric offer or a valid percentage-based proposal
      let commercialResult: CommercialResult;
      let finalStatus: string = activeNeg.status;

      const requestedDiscountPercent = intent.updates.discountPercent ?? currentState.discountPercent ?? null;
      const derivedOfferFromDiscount = requestedDiscountPercent !== null && requestedDiscountPercent >= 0 && requestedDiscountPercent <= 100
        ? Math.round(((rawProduct.price * (1 - requestedDiscountPercent / 100)) + Number.EPSILON) * 100) / 100
        : null;
      const effectiveBuyerOffer = intent.updates.buyerOffer ?? derivedOfferFromDiscount;

      if (effectiveBuyerOffer !== null && effectiveBuyerOffer > 0) {
        const offerRes = await submitBuyerOfferTool(activeNeg._id.toString(), effectiveBuyerOffer);
        finalStatus = offerRes.status;

        let decisionType: CommercialResult["decision"] = "REJECT";
        if (offerRes.decision === "ACCEPT") {
          decisionType = isFreeDelRequested && !freeDelApproved ? "VALID_WITHOUT_DELIVERY" : "VALID";
        } else if (offerRes.decision === "COUNTER_OFFER") {
          decisionType = "COUNTER_OFFER";
        } else if (offerRes.decision === "EXPIRED") {
          decisionType = "EXPIRED";
        }

        commercialResult = {
          decision: decisionType,
          requestedTerms: {
            buyerOffer: effectiveBuyerOffer,
            quantity: requestedQty,
            requestedFreeDelivery: isFreeDelRequested,
            discountPercent: requestedDiscountPercent,
          },
          commercialTerms: {
            unitPrice: effectiveBuyerOffer,
            quantity: requestedQty,
            freeDelivery: freeDelApproved,
            counterOfferPrice: offerRes.merchantCounterOffer,
            round: offerRes.round,
            maxRounds: offerRes.maxRounds,
            currency: selectedProd.currency || "INR",
          },
          negotiationStatus: finalStatus as any,
        };
      } else if (intent.type === "REQUEST_FREE_DELIVERY" || isFreeDelRequested) {
        try {
          await createAuditEvent({
            merchantId: merchantIdStr,
            negotiationId: activeNeg._id.toString(),
            eventType: "DELIVERY_TERM_REQUESTED",
            actorType: "BUYER",
            description: "Buyer requested free delivery",
            data: { requestedFreeDelivery: true, approved: freeDelApproved },
          });
        } catch { }

        const currentPrice = activeNeg.currentMerchantOffer ?? activeNeg.originalUnitPrice ?? rawProduct.price;
        commercialResult = {
          decision: freeDelApproved ? "DELIVERY_APPROVED" : "DELIVERY_REJECTED",
          requestedTerms: {
            quantity: requestedQty,
            requestedFreeDelivery: true,
          },
          commercialTerms: {
            unitPrice: currentPrice,
            quantity: requestedQty,
            freeDelivery: freeDelApproved,
            currency: selectedProd.currency || "INR",
          },
          negotiationStatus: finalStatus as any,
        };
      } else {
        const justSelected =
          intent.updates.selectedProductIndex !== undefined ||
          intent.updates.selectedProductReference !== undefined;

        const currentPrice = activeNeg.currentMerchantOffer ?? activeNeg.originalUnitPrice ?? rawProduct.price;
        const currentOrderVal = currentPrice * requestedQty;
        const isEligibleForShipping = policy && policy.freeShippingThreshold !== undefined && policy.freeShippingThreshold !== null
          ? (policy.freeShippingThreshold === 0 || currentOrderVal >= policy.freeShippingThreshold)
          : false;

        commercialResult = {
          decision: "ASK_TARGET",
          requestedTerms: {
            quantity: requestedQty,
            requestedFreeDelivery: false,
            selectedProductName: justSelected ? currentState.selectedProductName : null,
          },
          commercialTerms: {
            unitPrice: currentPrice,
            quantity: requestedQty,
            freeDelivery: isEligibleForShipping,
            currency: selectedProd.currency || "INR",
          },
          negotiationStatus: finalStatus as any,
        };
      }

      console.log(`[DELIVERY_POLICY] freeDeliveryEligible: ${freeDelApproved}, threshold: ${policy?.freeShippingThreshold}`);
      console.log("[BUYER_AGENT] Backend commercial result:", JSON.stringify(commercialResult));

      const fallback = generateCommercialResponseFallback(commercialResult);
      const nextActionToReturn: string | undefined = fallback.nextAction;
      let offerResponseText: string = fallback.message;

      if (provider && typeof provider.generateResponse === "function") {
        try {
          const responseContext = buildCommercialResponseContext(
            commercialResult,
            selectedProd ? (rawProduct as any) : undefined
          );
          const llmMsg = await provider.generateResponse({
            message: message || "",
            products: selectedProd ? [selectedProd] : [],
            buyerState: currentState,
            conversationHistory: history,
            commercialResult: responseContext,
          });

          if (llmMsg && validateCommercialResponseFacts(llmMsg, commercialResult)) {
            offerResponseText = llmMsg.trim();
          } else {
            console.warn(
              "[BUYER_AGENT] LLM response failed commercial fact validation or was empty. Using deterministic fallback."
            );
            offerResponseText = fallback.message;
          }
        } catch (err: any) {
          console.warn("[BUYER_AGENT] Error in LLM response generation, using fallback:", err?.message || err);
          offerResponseText = fallback.message;
        }
      }

      console.log("[BUYER_AGENT] Response generation input:", JSON.stringify({
        userRequest: {
          buyerOffer: effectiveBuyerOffer,
          requestedFreeDelivery: isFreeDelRequested,
          quantity: requestedQty,
        },
        backendDecision: commercialResult,
        negotiationStatus: finalStatus,
      }));
      console.log("[BUYER_AGENT] Response generation output:", offerResponseText);

      const updatedState = mergeIntent(currentState, {
        ...intent,
        updates: {
          selectedProductId: currentState.selectedProductId,
          selectedProductName: currentState.selectedProductName,
          negotiationId: activeNeg._id.toString(),
          negotiationStatus: finalStatus,
          quantity: requestedQty,
          buyerOffer: effectiveBuyerOffer ?? currentState.buyerOffer ?? null,
          discountPercent: requestedDiscountPercent ?? currentState.discountPercent ?? null,
          requestedFreeDelivery: isFreeDelRequested ? true : currentState.requestedFreeDelivery,
        },
      });

      await updateConversationState(conversationId, updatedState);
      await addMessage(conversationId, "assistant", offerResponseText);
      await updateExpiration(conversationId);

      let contextualActions: ChatAction[] = [];
      if (nextActionToReturn !== "ASK_BUYER_TARGET") {
        activeNeg = (await Negotiation.findById(activeNeg._id)) || activeNeg;
        contextualActions = await deriveContextualActions(updatedState, activeNeg);
      }

      return {
        message: offerResponseText,
        products: [],
        selectedProduct: selectedProd,
        conversationId,
        searchState: publicSearchState(updatedState),
        actions: contextualActions,
        nextAction: nextActionToReturn,
      };
    }

    // ── Step 3: Handle SELECT_PRODUCT intent ──────────────────
    if (intent.type === "SELECT_PRODUCT") {
      const candidateProducts = await hydrateCandidateProducts(currentState);

      let ref: string | number =
        intent.updates.selectedProductIndex ??
        intent.updates.selectedProductReference ??
        message ??
        "";

      let resolution: SelectionResult = selectProductFromSearchResults(
        ref,
        currentState,
        candidateProducts
      );

      if (
        !resolution.success &&
        resolution.message.includes("Which product would you like") &&
        typeof ref === "string" &&
        ref.trim().length > 0
      ) {
        try {
          const fallbackSearch = await searchProductsTool({ query: ref.trim() });
          if (fallbackSearch.products.length > 0) {
            resolution = selectProductFromSearchResults(ref, currentState, fallbackSearch.products);
          }
        } catch (e) { }
      }

      if (!resolution.success) {
        const errorMsg = resolution.message;
        await addMessage(conversationId, "assistant", errorMsg);
        await updateExpiration(conversationId);

        return {
          message: errorMsg,
          products: [],
          conversationId,
          searchState: publicSearchState(currentState),
        };
      }

      // Re-fetch current product from MongoDB to ensure fresh inventory and price
      let freshProduct: PublicProduct;
      try {
        const raw = await getProductById(resolution.selectedProductId);
        freshProduct = toPublicProduct(raw);
      } catch (prodErr: any) {
        const notFoundMsg = "The selected product could not be found in the catalog.";
        await addMessage(conversationId, "assistant", notFoundMsg);
        await updateExpiration(conversationId);

        return {
          message: notFoundMsg,
          products: [],
          conversationId,
          searchState: publicSearchState(currentState),
        };
      }

      // Check stock and inventory constraints
      if (freshProduct.inventory <= 0) {
        const outOfStockMsg = `The selected product (${freshProduct.name}) is currently out of stock.`;
        await addMessage(conversationId, "assistant", outOfStockMsg);
        await updateExpiration(conversationId);

        return {
          message: outOfStockMsg,
          products: [],
          conversationId,
          searchState: publicSearchState(currentState),
        };
      }

      if (
        currentState.quantity !== null &&
        freshProduct.inventory < currentState.quantity
      ) {
        const lowStockMsg = `The selected product (${freshProduct.name}) only has ${freshProduct.inventory} units available, but you requested ${currentState.quantity}.`;

        // Save selection ID but alert user about inventory
        const updatedState = mergeIntent(currentState, {
          ...intent,
          updates: {
            selectedProductId: freshProduct.id,
            selectedProductName: freshProduct.name,
          },
        });
        await updateConversationState(conversationId, updatedState);
        await addMessage(conversationId, "assistant", lowStockMsg);
        await updateExpiration(conversationId);

        return {
          message: lowStockMsg,
          products: [],
          selectedProduct: freshProduct,
          conversationId,
          searchState: publicSearchState(updatedState),
        };
      }

      // Normal successful selection
      const updatedState = mergeIntent(currentState, {
        ...intent,
        updates: {
          selectedProductId: freshProduct.id,
          selectedProductName: freshProduct.name,
        },
      });

      await updateConversationState(conversationId, updatedState);

      const finalMessage = await provider.generateResponse({
        message: message ?? "",
        products: [freshProduct],
        buyerState: updatedState,
        conversationHistory: history,
      });

      const responseText =
        finalMessage ||
        `You selected ${freshProduct.name} at ₹${freshProduct.price.toLocaleString("en-IN")}.`;

      await addMessage(conversationId, "assistant", responseText);
      await updateExpiration(conversationId);

      return {
        message: responseText,
        products: [],
        selectedProduct: freshProduct,
        conversationId,
        searchState: publicSearchState(updatedState),
      };
    }

    // ── Step 4: Handle PRODUCT_DETAILS intent ──────────────────
    if (intent.type === "PRODUCT_DETAILS") {
      let targetProductId = currentState.selectedProductId;
      let selectedProduct: PublicProduct | undefined;

      if (!targetProductId) {
        // Try resolving selection from message if present
        const candidates = await hydrateCandidateProducts(currentState);
        const resolution = selectProductFromSearchResults(message ?? "", currentState, candidates);
        if (resolution.success) {
          targetProductId = resolution.selectedProductId;
        }
      }

      if (!targetProductId) {
        const askMsg =
          "Which product would you like details for? You can select from the search results (e.g., 'the first one' or 'option 2').";
        await addMessage(conversationId, "assistant", askMsg);
        await updateExpiration(conversationId);

        return {
          message: askMsg,
          products: [],
          conversationId,
          searchState: publicSearchState(currentState),
        };
      }

      try {
        const raw = await getProductById(targetProductId);
        selectedProduct = toPublicProduct(raw);
      } catch (err: any) {
        const errDetails = "Could not retrieve details for the selected product.";
        await addMessage(conversationId, "assistant", errDetails);
        await updateExpiration(conversationId);

        return {
          message: errDetails,
          products: [],
          conversationId,
          searchState: publicSearchState(currentState),
        };
      }

      const responseMessage = await provider.generateResponse({
        message: message ?? "",
        products: [selectedProduct],
        buyerState: currentState,
        conversationHistory: history,
      });

      const finalResponseText =
        responseMessage ||
        `${selectedProduct.name} — ₹${selectedProduct.price.toLocaleString("en-IN")}\nCategory: ${selectedProduct.category}\nAvailable: ${selectedProduct.inventory}\nDescription: ${selectedProduct.description}`;

      await addMessage(conversationId, "assistant", finalResponseText);
      await updateExpiration(conversationId);

      return {
        message: finalResponseText,
        products: [],
        selectedProduct,
        conversationId,
        searchState: publicSearchState(currentState),
      };
    }

    // ── Step 5: Merge search intent into state ─────────────────────
    const newState = mergeIntent(currentState, intent);
    console.log("[BUYER_AGENT] New state:", JSON.stringify(publicSearchState(newState)));

    // Check if sufficient parameters for search
    if (!newState.topic && !newState.category) {
      const msg = "What product are you looking for? I can help you find the best options.";
      await updateConversationState(conversationId, newState);
      await addMessage(conversationId, "assistant", msg);
      await updateExpiration(conversationId);

      return {
        message: msg,
        products: [],
        conversationId,
        searchState: publicSearchState(newState),
      };
    }

    // Derive search params and call search tool
    const searchParams = deriveSearchParams(newState);
    console.log("[BUYER_AGENT] Derived search params:", JSON.stringify(searchParams));

    let toolResult;
    try {
      toolResult = await searchProductsTool(searchParams);
    } catch (searchError: any) {
      if (searchError instanceof AppCustomError) {
        throw searchError;
      }
      console.error("[BUYER_AGENT] Product search failed:", searchError.message || searchError);
      throw new AppCustomError(
        "PRODUCT_SEARCH_FAILED",
        "Failed to execute product search query.",
        500
      );
    }

    const retrievedProducts = toolResult.products;
    const searchResultIds = retrievedProducts.map((p) => p.id);

    newState.lastProducts = retrievedProducts;
    newState.lastQuery = newState.topic;
    newState.searchResults = searchResultIds;

    await updateConversationState(conversationId, newState);
    if (searchResultIds.length > 0) {
      await addSearchResults(conversationId, searchResultIds);
    }

    // Generate natural language response via LLM Provider
    const finalMessage = await provider.generateResponse({
      message: message ?? "",
      products: retrievedProducts,
      buyerState: newState,
      conversationHistory: history,
    });

    await addMessage(conversationId, "assistant", finalMessage);
    await updateExpiration(conversationId);

    console.log(`[CONVERSATION]
ID: ${conversationId}
Provider: ${provider.name}
Previous: ${JSON.stringify(publicSearchState(currentState))}
Updated: ${JSON.stringify(publicSearchState(newState))}
Search results: ${retrievedProducts.length}`);

    const finalActions = await deriveContextualActions(newState);
    const result: BuyerAgentResult = {
      message: finalMessage,
      products: retrievedProducts,
      conversationId,
      searchState: publicSearchState(newState),
      actions: finalActions,
    };

    if (process.env.NODE_ENV === "development") {
      result.debug = {
        intentSource: provider.name,
      };
    }

    return result;
  } catch (error: any) {
    if (error instanceof AppCustomError) {
      throw error;
    }
    console.error(
      "[BUYER_AGENT] Error during agent execution:",
      error.message || error
    );
    throw new AppCustomError(
      "BUYER_AGENT_UNAVAILABLE",
      "The shopping assistant is temporarily unavailable.",
      503
    );
  }
};

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const publicSearchState = (state: BuyerState) => ({
  topic: state.topic,
  category: state.category,
  minPrice: state.minPrice,
  maxPrice: state.maxPrice,
  quantity: state.quantity,
  sortBy: state.sortBy,
  requirements: state.hardRequirements || state.requirements || {},
  hardRequirements: state.hardRequirements || state.requirements || {},
  softPreferences: state.softPreferences || {},
  selectedProductId: state.selectedProductId,
  selectedProductName: state.selectedProductName,
  negotiationId: state.negotiationId,
  negotiationStatus: state.negotiationStatus,
  agreementId: state.agreementId || null,
  agreementStatus: state.agreementStatus || null,
  paymentReady: state.paymentReady ?? null,
  discountPercent: state.discountPercent ?? null,
  requestedFreeDelivery: state.requestedFreeDelivery ?? null,
});
