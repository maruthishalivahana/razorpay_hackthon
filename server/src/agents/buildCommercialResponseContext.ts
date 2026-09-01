import type { CommercialResult } from "./buyerAgent.js";
import type { PublicProduct } from "../services/productService.js";

export interface CommercialResponseContext {
  decision: string;
  commercialTerms: {
    unitPrice: number;
    quantity: number;
    currency: string;
    freeDelivery: boolean;
    freeDeliveryEligible?: boolean;
    counterOfferPrice?: number;
    round?: number;
    maxRounds?: number;
  };
  requestedTerms: {
    buyerOffer?: number | null;
    requestedFreeDelivery: boolean;
    quantity?: number;
    discountPercent?: number | null;
    selectedProductName?: string | null;
  };
  negotiationStatus: string;
  nextAction?: string;
  product?: {
    name: string;
    price: number;
    currency: string;
  };
}

export function buildCommercialResponseContext(
  result: CommercialResult,
  selectedProduct?: PublicProduct
): CommercialResponseContext {
  return {
    decision: result.decision,
    commercialTerms: {
      unitPrice: result.commercialTerms.unitPrice,
      quantity: result.commercialTerms.quantity,
      currency: result.commercialTerms.currency || "INR",
      freeDelivery: Boolean(result.commercialTerms.freeDelivery),
      freeDeliveryEligible: Boolean(result.commercialTerms.freeDelivery),
      ...(result.commercialTerms.counterOfferPrice !== undefined
        ? { counterOfferPrice: result.commercialTerms.counterOfferPrice }
        : {}),
      ...(result.commercialTerms.round !== undefined ? { round: result.commercialTerms.round } : {}),
      ...(result.commercialTerms.maxRounds !== undefined
        ? { maxRounds: result.commercialTerms.maxRounds }
        : {}),
    },
    requestedTerms: {
      buyerOffer: result.requestedTerms.buyerOffer,
      requestedFreeDelivery: Boolean(result.requestedTerms.requestedFreeDelivery),
      quantity: result.requestedTerms.quantity,
      discountPercent: result.requestedTerms.discountPercent,
      selectedProductName: result.requestedTerms.selectedProductName,
    },
    negotiationStatus: result.negotiationStatus,
    ...(selectedProduct
      ? {
        product: {
          name: selectedProduct.name,
          price: selectedProduct.price,
          currency: selectedProduct.currency,
        },
      }
      : {}),
  };
}

export function validateCommercialResponseFacts(
  response: string,
  result: CommercialResult
): boolean {
  if (!response || response.trim().length === 0) return false;
  const lower = response.toLowerCase();

  // If status is ACTIVE, LLM must not claim deal is confirmed / accepted / final
  if (result.negotiationStatus === "ACTIVE") {
    if (/\b(?:deal confirmed|order placed|payment complete|paid successfully|accepted the deal)\b/i.test(lower)) {
      return false;
    }
  }

  // If freeDelivery is true and user requested it, response should acknowledge delivery
  if (result.requestedTerms.requestedFreeDelivery) {
    if (result.commercialTerms.freeDelivery) {
      if (!/(?:free\s*(?:delivery|shipping)|delivery\s*included|shipping\s*included|include\s*(?:free\s*)?delivery|free delivery)/i.test(lower)) {
        return false;
      }
    }
  }

  // If freeDelivery is false and user requested it, response must NOT claim free delivery is included
  if (result.requestedTerms.requestedFreeDelivery && !result.commercialTerms.freeDelivery) {
    if (/(?:free delivery is included|free shipping is included|we will include free delivery|including free delivery)\b/i.test(lower)) {
      return false;
    }
  }

  return true;
}
