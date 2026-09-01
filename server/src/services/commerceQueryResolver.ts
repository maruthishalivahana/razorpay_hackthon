/**
 * commerceQueryResolver.ts
 *
 * Generic Commerce Query Resolver for Buyer Agent.
 * Maps structured commerce query intents to authoritative backend data sources
 * (Product, Policy, Negotiation, Agreement, Payment Readiness)
 * and formats buyer-safe factual answers without inventing data or mutating commercial state.
 */

import mongoose from "mongoose";
import Product from "../models/Product.js";
import Policy from "../models/Policy.js";
import Negotiation from "../models/Negotiation.js";
import Agreement from "../models/Agreement.js";
import { isPaymentReady } from "./agreementService.js";
import type { BuyerState, BuyerIntent, CommerceQueryResult, CommerceQueryKind } from "../agents/buyerState.js";
import { getProductById, toPublicProduct } from "./productService.js";

export const resolveCommerceQuery = async (
  intent: BuyerIntent,
  state: BuyerState
): Promise<CommerceQueryResult> => {
  const query = intent.updates.query;
  const kind: CommerceQueryKind = query?.kind || "PRODUCT_PRICE";

  // ── Step 1: Resolve target product if query targets a product ──
  let targetProduct: any = null;
  let targetProductId: string | null = state.selectedProductId;

  // Handle explicit ordinal / reference in query (e.g. "How much is the 2nd one?")
  if (query?.targetProductRef !== undefined && query.targetProductRef !== null) {
    if (typeof query.targetProductRef === "number") {
      const idx = query.targetProductRef - 1; // 1-indexed to 0-indexed
      if (state.searchResults && state.searchResults[idx]) {
        targetProductId = state.searchResults[idx];
      }
    } else if (typeof query.targetProductRef === "string") {
      if (/cheapest|lowest/i.test(query.targetProductRef) && state.lastProducts && state.lastProducts.length > 0) {
        const sorted = [...state.lastProducts].sort((a, b) => a.price - b.price);
        targetProductId = sorted[0].id;
      }
    }
  }

  if (targetProductId) {
    try {
      targetProduct = await getProductById(targetProductId);
    } catch {
      targetProduct = null;
    }
  }

  // Handle cases where multiple search results exist at same price or ambigious
  if (!targetProduct && state.searchResults && state.searchResults.length > 1) {
    const products: any[] = [];
    for (const id of state.searchResults.slice(0, 5)) {
      try {
        const p = await getProductById(id);
        if (p) products.push(p);
      } catch {}
    }

    if (query?.targetProductRef && typeof query.targetProductRef === "number") {
      const p = products[query.targetProductRef - 1];
      if (p) targetProduct = p;
    }
  }

  // ── Step 2: Handle product-requiring queries when no product is selected ──
  const requiresProduct = [
    "PRODUCT_PRICE",
    "PRODUCT_INVENTORY",
    "PRODUCT_DELIVERY",
    "PRODUCT_NEGOTIABILITY",
    "PRODUCT_DETAILS",
    "PRODUCT_CATEGORY",
    "PRODUCT_AVAILABILITY",
    "ORDER_QUANTITY_LIMIT",
    "DISCOUNT_AVAILABILITY",
    "SHIPPING_AVAILABILITY",
  ].includes(kind);

  if (requiresProduct && !targetProduct && !state.negotiationId && !state.agreementId) {
    return {
      kind,
      answer: "Which product are you asking about?",
      source: "SYSTEM",
      confidence: "LOW",
    };
  }

  // Fetch Policy if product exists
  let policy: any = null;
  if (targetProduct) {
    const merchantIdStr = targetProduct.merchantId?._id
      ? targetProduct.merchantId._id.toString()
      : targetProduct.merchantId.toString();
    policy = await Policy.findOne({ merchantId: merchantIdStr, isActive: true });
  }

  // Fetch active Negotiation if present
  let negotiation: any = null;
  if (state.negotiationId) {
    try {
      negotiation = await Negotiation.findById(state.negotiationId);
    } catch {}
  }

  // Fetch active Agreement if present
  let agreement: any = null;
  if (state.agreementId) {
    try {
      agreement = await Agreement.findById(state.agreementId);
    } catch {}
  }

  // ── Step 3: Resolve query by Kind ──

  switch (kind) {
    case "PRODUCT_PRICE": {
      if (negotiation && negotiation.status === "ACTIVE" && negotiation.currentMerchantOffer) {
        return {
          kind,
          answer: `The current offer for ${targetProduct?.name || "the product"} is ₹${negotiation.currentMerchantOffer.toLocaleString("en-IN")} per unit.`,
          source: "NEGOTIATION",
          data: { currentOffer: negotiation.currentMerchantOffer },
          confidence: "HIGH",
        };
      }

      if (targetProduct) {
        return {
          kind,
          answer: `The price for ${targetProduct.name} is ₹${targetProduct.price.toLocaleString("en-IN")}.`,
          source: "PRODUCT",
          data: { price: targetProduct.price, currency: targetProduct.currency },
          confidence: "HIGH",
        };
      }
      break;
    }

    case "PRODUCT_INVENTORY":
    case "PRODUCT_AVAILABILITY": {
      if (targetProduct) {
        const inv = targetProduct.inventory;
        const maxOrder = policy?.maxQuantityPerOrder;

        let ans = `There are ${inv} unit(s) currently available in stock for ${targetProduct.name}.`;
        if (maxOrder && maxOrder < inv) {
          ans = `You can order up to ${maxOrder} units per order under the merchant's rules, and there are ${inv} units currently in stock.`;
        }

        return {
          kind,
          answer: ans,
          source: "PRODUCT",
          data: { inventory: inv, maxQuantityPerOrder: maxOrder },
          confidence: "HIGH",
        };
      }
      break;
    }

    case "PRODUCT_DELIVERY": {
      if (targetProduct) {
        const days = targetProduct.deliveryDays ?? 3;
        return {
          kind,
          answer: `Delivery for ${targetProduct.name} takes approximately ${days} business days.`,
          source: "PRODUCT",
          data: { deliveryDays: days },
          confidence: "HIGH",
        };
      }
      break;
    }

    case "PRODUCT_NEGOTIABILITY": {
      if (targetProduct) {
        const isNeg = Boolean(targetProduct.isNegotiable && (policy ? policy.negotiationEnabled : true));
        const ans = isNeg
          ? `${targetProduct.name} is negotiable! You can propose a target price.`
          : `${targetProduct.name} is currently sold at fixed list price.`;
        return {
          kind,
          answer: ans,
          source: "POLICY",
          data: { isNegotiable: isNeg },
          confidence: "HIGH",
        };
      }
      break;
    }

    case "ORDER_QUANTITY_LIMIT": {
      const inv = targetProduct?.inventory ?? 0;
      const maxOrder = policy?.maxQuantityPerOrder;

      if (maxOrder) {
        return {
          kind,
          answer: `The maximum quantity per order is ${maxOrder} units (current stock: ${inv} units).`,
          source: "POLICY",
          data: { maxQuantityPerOrder: maxOrder, inventory: inv },
          confidence: "HIGH",
        };
      }

      return {
        kind,
        answer: `There is no explicit per-order limit specified. Total stock available is ${inv} units.`,
        source: "PRODUCT",
        data: { inventory: inv },
        confidence: "HIGH",
      };
    }

    case "DISCOUNT_AVAILABILITY":
    case "DISCOUNT_LIMIT": {
      if (targetProduct) {
        const isNeg = Boolean(targetProduct.isNegotiable && (policy ? policy.negotiationEnabled : true));
        if (isNeg) {
          return {
            kind,
            answer: `The merchant's current pricing rules allow discounts on ${targetProduct.name} through negotiation.`,
            source: "POLICY",
            data: { discountAllowed: true },
            confidence: "HIGH",
          };
        }
        return {
          kind,
          answer: `Discounts are not available for ${targetProduct.name} under current merchant policy.`,
          source: "POLICY",
          data: { discountAllowed: false },
          confidence: "HIGH",
        };
      }
      break;
    }

    case "SHIPPING_AVAILABILITY":
    case "SHIPPING_COST": {
      const threshold = policy?.freeShippingThreshold;
      const currentPrice = negotiation?.currentMerchantOffer ?? negotiation?.originalUnitPrice ?? targetProduct?.price;
      const qty = state?.quantity && state.quantity > 0 ? state.quantity : (negotiation?.quantity || 1);

      if (threshold !== undefined && threshold !== null) {
        if (threshold === 0) {
          return {
            kind,
            answer: "Yes, this order qualifies for free delivery.",
            source: "POLICY",
            data: { freeDelivery: true, threshold: 0 },
            confidence: "HIGH",
          };
        }

        if (currentPrice !== undefined && currentPrice !== null) {
          const orderVal = currentPrice * qty;
          if (orderVal >= threshold) {
            return {
              kind,
              answer: "Yes, this order qualifies for free delivery.",
              source: "POLICY",
              data: { freeDelivery: true, freeShippingThreshold: threshold, orderValue: orderVal },
              confidence: "HIGH",
            };
          }
        }

        return {
          kind,
          answer: `No, free delivery is not available for this order under the current shipping policy. Free delivery is available on orders of ₹${threshold.toLocaleString("en-IN")} or more.`,
          source: "POLICY",
          data: { freeShippingThreshold: threshold },
          confidence: "HIGH",
        };
      }

      return {
        kind,
        answer: "No, free delivery is not currently available.",
        source: "POLICY",
        confidence: "MEDIUM",
      };
    }

    case "CURRENT_OFFER": {
      if (negotiation) {
        const offer = negotiation.currentMerchantOffer ?? negotiation.originalUnitPrice;
        return {
          kind,
          answer: `The current offer is ₹${offer.toLocaleString("en-IN")} per unit.`,
          source: "NEGOTIATION",
          data: { currentOffer: offer, status: negotiation.status },
          confidence: "HIGH",
        };
      }
      if (targetProduct) {
        return {
          kind,
          answer: `The listed price for ${targetProduct.name} is ₹${targetProduct.price.toLocaleString("en-IN")}. No negotiation has been started yet.`,
          source: "PRODUCT",
          data: { price: targetProduct.price },
          confidence: "HIGH",
        };
      }
      break;
    }

    case "NEGOTIATION_STATUS": {
      if (negotiation) {
        return {
          kind,
          answer: `Your negotiation is currently ${negotiation.status.toLowerCase()}.`,
          source: "NEGOTIATION",
          data: { status: negotiation.status },
          confidence: "HIGH",
        };
      }
      return {
        kind,
        answer: "There is no active negotiation for this session.",
        source: "SYSTEM",
        confidence: "HIGH",
      };
    }

    case "AGREEMENT_STATUS": {
      if (agreement) {
        let text = `Your order agreement status is ${agreement.status}.`;
        if (agreement.status === "APPROVED") {
          text = "Your order has been approved and is ready for payment.";
        } else if (agreement.status === "PENDING_APPROVAL") {
          text = "Your order agreement is currently pending merchant approval.";
        }
        return {
          kind,
          answer: text,
          source: "AGREEMENT",
          data: { status: agreement.status, agreementId: agreement._id.toString() },
          confidence: "HIGH",
        };
      }
      return {
        kind,
        answer: "No order agreement has been created yet.",
        source: "SYSTEM",
        confidence: "HIGH",
      };
    }

    case "PAYMENT_READINESS": {
      if (agreement) {
        const isReady = await isPaymentReady(agreement._id.toString());
        const ans = isReady
          ? "Your order is approved and ready for payment."
          : "Your order is pending approval and is not yet ready for payment.";
        return {
          kind,
          answer: ans,
          source: "APPROVAL",
          data: { paymentReady: isReady, agreementStatus: agreement.status },
          confidence: "HIGH",
        };
      }
      return {
        kind,
        answer: "An order agreement must be created before proceeding to payment.",
        source: "SYSTEM",
        confidence: "HIGH",
      };
    }

    case "ORDER_TOTAL": {
      const qty = state.quantity ?? 1;
      let unitPrice = targetProduct?.price ?? 0;

      if (agreement) {
        unitPrice = agreement.agreedUnitPrice;
        const total = agreement.finalOrderValue;
        return {
          kind,
          answer: `The total for ${agreement.quantity} unit(s) is ₹${total.toLocaleString("en-IN")}.`,
          source: "AGREEMENT",
          data: { agreedUnitPrice: unitPrice, quantity: agreement.quantity, finalOrderValue: total },
          confidence: "HIGH",
        };
      }

      if (negotiation) {
        unitPrice = negotiation.currentMerchantOffer ?? negotiation.originalUnitPrice;
      }

      const total = unitPrice * qty;
      return {
        kind,
        answer: `The total estimated price for ${qty} unit(s) at ₹${unitPrice.toLocaleString("en-IN")} each is ₹${total.toLocaleString("en-IN")}.`,
        source: negotiation ? "NEGOTIATION" : "PRODUCT",
        data: { unitPrice, quantity: qty, total },
        confidence: "HIGH",
      };
    }

    case "PRICE_EXPLANATION":
    case "POLICY_EXPLANATION": {
      return {
        kind,
        answer: "The merchant's current pricing rules don't allow a lower price for this offer.",
        source: "ECONOMIC_ENGINE",
        confidence: "HIGH",
      };
    }

    case "UNSUPPORTED_QUERY":
    default: {
      return {
        kind: "UNSUPPORTED_QUERY",
        answer: "I don't have structured information in the catalog for that request.",
        source: "SYSTEM",
        confidence: "LOW",
      };
    }
  }

  return {
    kind: "UNSUPPORTED_QUERY",
    answer: "I don't have structured information in the catalog for that request.",
    source: "SYSTEM",
    confidence: "LOW",
  };
};
