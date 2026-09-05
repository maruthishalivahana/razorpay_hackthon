import mongoose from "mongoose";
import Negotiation, {
  type INegotiation,
  type NegotiationStatus,
} from "../models/Negotiation.js";
import Merchant from "../models/Merchant.js";
import Product from "../models/Product.js";
import Policy from "../models/Policy.js";
import Conversation from "../models/Conversation.js";
import { calculateEconomicOffer, roundMoney, roundPercent } from "./economicEngine.js";
import { evaluatePolicy } from "./policyEngine.js";
import { createAuditEvent, getAuditEventsForNegotiation } from "./auditService.js";
import { getCurrentPolicyForMerchant } from "./policyService.js";

export class AppCustomError extends Error {
  public code: string;
  public statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "AppCustomError";
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface StartNegotiationInput {
  merchantId: string;
  productId: string;
  policyId: string;
  quantity: number;
  currency: string;
}

export interface SubmitBuyerOfferResponse {
  negotiationId: string;
  decision: "ACCEPT" | "COUNTER_OFFER" | "REJECT" | "EXPIRED";
  status: NegotiationStatus;
  round: number;
  maxRounds: number;
  remainingRounds: number;
  buyerOffer: number;
  merchantCounterOffer?: number;
  acceptedPrice?: number;
  finalOrderValue?: number;
  originalUnitPrice: number;
  quantity: number;
  orderValue?: number;
  discountPercent?: number;
  marginPercent?: number;
  reason: string;
}

export const startNegotiation = async (
  input: StartNegotiationInput
): Promise<INegotiation> => {
  const { merchantId, productId, policyId, quantity, currency } = input;

  if (!mongoose.Types.ObjectId.isValid(merchantId)) {
    throw new AppCustomError("INVALID_MERCHANT", "Invalid merchant ID format", 400);
  }
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new AppCustomError("INVALID_PRODUCT", "Invalid product ID format", 400);
  }
  if (!mongoose.Types.ObjectId.isValid(policyId)) {
    throw new AppCustomError("INVALID_POLICY", "Invalid policy ID format", 400);
  }

  const merchant = await Merchant.findById(merchantId);
  if (!merchant) {
    throw new AppCustomError("INVALID_MERCHANT", "Merchant not found", 404);
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new AppCustomError("INVALID_PRODUCT", "Product not found", 404);
  }

  const policy = await Policy.findById(policyId);
  if (!policy) {
    throw new AppCustomError("INVALID_POLICY", "Policy not found", 404);
  }

  if (product.merchantId.toString() !== merchantId) {
    throw new AppCustomError(
      "INVALID_PRODUCT",
      "Product does not belong to the specified merchant",
      400
    );
  }

  if (policy.merchantId.toString() !== merchantId) {
    throw new AppCustomError(
      "INVALID_POLICY",
      "Policy does not belong to the specified merchant",
      400
    );
  }

  if (!policy.isActive) {
    throw new AppCustomError(
      "POLICY_VIOLATION",
      "Merchant policy is inactive.",
      400
    );
  }

  if (!policy.negotiationEnabled) {
    throw new AppCustomError(
      "NEGOTIATION_DISABLED",
      "Negotiation is disabled for this merchant.",
      400
    );
  }

  const normalizedCurrency = (currency || "INR").trim().toUpperCase();
  const allowedCurrencies = (policy.allowedCurrencies || []).map((c) =>
    c.toUpperCase()
  );
  if (!allowedCurrencies.includes(normalizedCurrency)) {
    throw new AppCustomError(
      "POLICY_VIOLATION",
      `Currency ${normalizedCurrency} is not allowed by merchant policy.`,
      400
    );
  }

  if (quantity < 1 || quantity > policy.maxQuantityPerOrder) {
    throw new AppCustomError(
      "POLICY_VIOLATION",
      `Quantity exceeds merchant policy limit of ${policy.maxQuantityPerOrder}.`,
      400
    );
  }

  const negotiation = new Negotiation({
    merchantId,
    productId,
    policyId,
    quantity,
    currency: normalizedCurrency,
    originalUnitPrice: product.price,
    status: "ACTIVE",
    currentRound: 1,
    maxRounds: policy.maxNegotiationRounds,
    history: [],
    startedAt: new Date(),
  });

  return await negotiation.save();
};

export const submitBuyerOffer = async (
  negotiationId: string,
  buyerOffer: number
): Promise<SubmitBuyerOfferResponse> => {
  if (!mongoose.Types.ObjectId.isValid(negotiationId)) {
    throw new AppCustomError(
      "NEGOTIATION_NOT_FOUND",
      "Invalid negotiation ID format",
      400
    );
  }

  if (typeof buyerOffer !== "number" || buyerOffer <= 0) {
    throw new AppCustomError(
      "INVALID_OFFER",
      "Buyer offer must be greater than 0",
      400
    );
  }

  const negotiation = await Negotiation.findById(negotiationId);
  if (!negotiation) {
    throw new AppCustomError(
      "NEGOTIATION_NOT_FOUND",
      "Negotiation not found",
      404
    );
  }

  if (negotiation.status !== "ACTIVE") {
    throw new AppCustomError(
      "NEGOTIATION_NOT_ACTIVE",
      "This negotiation is no longer active.",
      409
    );
  }

  if (negotiation.currentRound > negotiation.maxRounds) {
    negotiation.status = "EXPIRED";
    negotiation.completedAt = new Date();
    await negotiation.save();

    return {
      negotiationId: negotiation._id.toString(),
      decision: "EXPIRED",
      status: "EXPIRED",
      round: negotiation.maxRounds,
      maxRounds: negotiation.maxRounds,
      remainingRounds: 0,
      buyerOffer,
      originalUnitPrice: negotiation.originalUnitPrice,
      quantity: negotiation.quantity,
      reason: "Maximum negotiation rounds reached without agreement.",
    };
  }

  const product = await Product.findById(negotiation.productId);
  if (!product) {
    throw new AppCustomError("INVALID_PRODUCT", "Product not found", 404);
  }

  const policy = await getCurrentPolicyForMerchant(negotiation.merchantId.toString());
  if (policy._id.toString() !== negotiation.policyId.toString()) {
    negotiation.policyId = policy._id;
  }

  console.log("[POLICY_EVALUATION]", JSON.stringify({
    merchantId: negotiation.merchantId.toString(),
    policyId: policy._id.toString(),
    maxDiscountPercent: policy.maxDiscountPercent,
    minMarginPercent: policy.minMarginPercent,
    autoApprovalLimit: policy.autoApprovalLimit,
    requestedDiscount: ((product.price - buyerOffer) / product.price) * 100,
    productPrice: product.price,
    costPrice: product.costPrice,
  }));

  if (!policy.negotiationEnabled) {
    negotiation.status = "REJECTED";
    negotiation.completedAt = new Date();
    await negotiation.save();

    return {
      negotiationId: negotiation._id.toString(),
      decision: "REJECT",
      status: "REJECTED",
      round: negotiation.currentRound,
      maxRounds: negotiation.maxRounds,
      remainingRounds: 0,
      buyerOffer,
      originalUnitPrice: product.price,
      quantity: negotiation.quantity,
      reason: "Negotiation is not allowed by merchant policy.",
    };
  }

  // 1. Financial analysis via Economic Engine
  const economicResult = calculateEconomicOffer({
    product,
    policy,
    quantity: negotiation.quantity,
    buyerOffer,
  });

  // 2. Policy evaluation via Policy Engine
  const policyResult = evaluatePolicy({
    policy,
    product,
    quantity: negotiation.quantity,
    unitPrice: buyerOffer,
    currency: negotiation.currency,
    negotiationRequested: true,
  });

  await createAuditEvent({
    merchantId: negotiation.merchantId,
    negotiationId: negotiation._id,
    productId: product._id,
    eventType: "POLICY_EVALUATED",
    actorType: "AGENT",
    description: `Policy evaluated buyer offer at ${buyerOffer} per unit: ${policyResult.decision}.`,
    data: {
      productId: product._id.toString(),
      productPrice: product.price,
      costPrice: product.costPrice,
      requestedDiscountPercent: policyResult.evaluatedValues.discountPercent,
      maximumDiscountPercent: policy.maxDiscountPercent,
      minimumProfitMarginPercent: policy.minMarginPercent,
      calculatedFinalPrice: policyResult.evaluatedValues.unitPrice,
      calculatedProfit: roundMoney(
        (policyResult.evaluatedValues.unitPrice - product.costPrice) * negotiation.quantity
      ),
      calculatedMarginPercent: policyResult.evaluatedValues.marginPercent,
      autoApprovalLimit: policy.autoApprovalLimit,
      approvalRequired: policyResult.approvalRequired,
      decision: policyResult.allowed
        ? "AUTO_APPROVED"
        : policyResult.approvalRequired
          ? "MERCHANT_APPROVAL_REQUIRED"
          : "BLOCKED",
      policyDecision: policyResult.decision,
      reasons: policyResult.reasons,
      violations: policyResult.violations,
      currency: negotiation.currency,
    },
  });

  // Record Buyer offer in history
  negotiation.history.push({
    round: negotiation.currentRound,
    actor: "BUYER",
    offer: buyerOffer,
    timestamp: new Date(),
  });
  negotiation.currentBuyerOffer = buyerOffer;

  // OUTCOME 1: VALID OFFER (Merchant accepts price as valid offer, status remains ACTIVE)
  if (
    buyerOffer >= economicResult.minimumAllowedUnitPrice &&
    (policyResult.allowed || policyResult.approvalRequired)
  ) {
    negotiation.status = "ACTIVE";
    negotiation.currentMerchantOffer = buyerOffer;
    negotiation.currentDiscountPercent = roundPercent(
      ((product.price - buyerOffer) / product.price) * 100
    );
    negotiation.currentMarginPercent = roundPercent(
      ((buyerOffer - product.costPrice) / buyerOffer) * 100
    );

    negotiation.history.push({
      round: negotiation.currentRound,
      actor: "MERCHANT",
      offer: buyerOffer,
      timestamp: new Date(),
    });

    negotiation.markModified("history");
    await negotiation.save();

    return {
      negotiationId: negotiation._id.toString(),
      decision: "ACCEPT",
      status: "ACTIVE",
      round: negotiation.currentRound,
      maxRounds: negotiation.maxRounds,
      remainingRounds: Math.max(0, negotiation.maxRounds - negotiation.currentRound),
      buyerOffer,
      merchantCounterOffer: buyerOffer,
      acceptedPrice: undefined,
      finalOrderValue: roundMoney(buyerOffer * negotiation.quantity),
      originalUnitPrice: product.price,
      quantity: negotiation.quantity,
      orderValue: roundMoney(buyerOffer * negotiation.quantity),
      discountPercent: negotiation.currentDiscountPercent,
      marginPercent: negotiation.currentMarginPercent,
      reason: "Buyer offer is valid as it satisfies merchant policy and margin requirements.",
    };
  }

  // OUTCOME 2 & 3: Counter-Offer or Expired
  const merchantCounterOffer = economicResult.recommendedCounterOfferUnitPrice;
  negotiation.currentMerchantOffer = merchantCounterOffer;
  negotiation.currentDiscountPercent = roundPercent(
    ((product.price - merchantCounterOffer) / product.price) * 100
  );
  negotiation.currentMarginPercent = roundPercent(
    ((merchantCounterOffer - product.costPrice) / merchantCounterOffer) * 100
  );

  // Record Merchant counter offer in history
  negotiation.history.push({
    round: negotiation.currentRound,
    actor: "MERCHANT",
    offer: merchantCounterOffer,
    timestamp: new Date(),
  });

  const activeRound = negotiation.currentRound;

  if (activeRound >= negotiation.maxRounds) {
    // Max rounds exhausted
    negotiation.status = "EXPIRED";
    negotiation.completedAt = new Date();
    negotiation.markModified("history");
    await negotiation.save();

    return {
      negotiationId: negotiation._id.toString(),
      decision: "EXPIRED",
      status: "EXPIRED",
      round: activeRound,
      maxRounds: negotiation.maxRounds,
      remainingRounds: 0,
      buyerOffer,
      merchantCounterOffer,
      originalUnitPrice: product.price,
      quantity: negotiation.quantity,
      orderValue: roundMoney(merchantCounterOffer * negotiation.quantity),
      discountPercent: negotiation.currentDiscountPercent,
      marginPercent: negotiation.currentMarginPercent,
      reason: "Maximum negotiation rounds reached without agreement.",
    };
  }

  // Advance to next round
  negotiation.currentRound += 1;
  negotiation.markModified("history");
  await negotiation.save();

  return {
    negotiationId: negotiation._id.toString(),
    decision: "COUNTER_OFFER",
    status: "ACTIVE",
    round: activeRound,
    maxRounds: negotiation.maxRounds,
    remainingRounds: negotiation.maxRounds - activeRound,
    buyerOffer,
    merchantCounterOffer,
    originalUnitPrice: product.price,
    quantity: negotiation.quantity,
    orderValue: roundMoney(merchantCounterOffer * negotiation.quantity),
    discountPercent: negotiation.currentDiscountPercent,
    marginPercent: negotiation.currentMarginPercent,
    reason: "Buyer offer is below the merchant's minimum allowed price.",
  };
};

export const acceptNegotiation = async (
  negotiationId: string,
  finalPrice?: number
): Promise<INegotiation> => {
  if (!mongoose.Types.ObjectId.isValid(negotiationId)) {
    throw new AppCustomError(
      "NEGOTIATION_NOT_FOUND",
      "Invalid negotiation ID format",
      400
    );
  }

  const negotiation = await Negotiation.findById(negotiationId);
  if (!negotiation) {
    throw new AppCustomError(
      "NEGOTIATION_NOT_FOUND",
      "Negotiation not found",
      404
    );
  }

  if (negotiation.status !== "ACTIVE") {
    throw new AppCustomError(
      "NEGOTIATION_NOT_ACTIVE",
      "This negotiation is no longer active.",
      409
    );
  }

  const targetPrice = finalPrice ?? negotiation.currentMerchantOffer ?? negotiation.originalUnitPrice;

  const product = await Product.findById(negotiation.productId);
  if (!product) {
    throw new AppCustomError("INVALID_PRODUCT", "Product not found", 404);
  }

  const policy = await getCurrentPolicyForMerchant(negotiation.merchantId.toString());
  if (policy._id.toString() !== negotiation.policyId.toString()) {
    negotiation.policyId = policy._id;
  }

  const economicResult = calculateEconomicOffer({
    product,
    policy,
    quantity: negotiation.quantity,
    buyerOffer: targetPrice,
  });

  if (targetPrice < economicResult.minimumAllowedUnitPrice) {
    throw new AppCustomError(
      "POLICY_VIOLATION",
      "Proposed final price violates merchant policy and margin requirements",
      400
    );
  }

  negotiation.status = "ACCEPTED";
  negotiation.acceptedPrice = targetPrice;
  negotiation.finalOrderValue = roundMoney(targetPrice * negotiation.quantity);
  negotiation.currentDiscountPercent = roundPercent(
    ((product.price - targetPrice) / product.price) * 100
  );
  negotiation.currentMarginPercent = roundPercent(
    ((targetPrice - product.costPrice) / targetPrice) * 100
  );
  negotiation.completedAt = new Date();

  return await negotiation.save();
};

export const rejectNegotiation = async (
  negotiationId: string
): Promise<INegotiation> => {
  if (!mongoose.Types.ObjectId.isValid(negotiationId)) {
    throw new AppCustomError(
      "NEGOTIATION_NOT_FOUND",
      "Invalid negotiation ID format",
      400
    );
  }

  const negotiation = await Negotiation.findById(negotiationId);
  if (!negotiation) {
    throw new AppCustomError(
      "NEGOTIATION_NOT_FOUND",
      "Negotiation not found",
      404
    );
  }

  if (negotiation.status !== "ACTIVE") {
    throw new AppCustomError(
      "NEGOTIATION_NOT_ACTIVE",
      "This negotiation is no longer active.",
      409
    );
  }

  negotiation.status = "REJECTED";
  negotiation.completedAt = new Date();
  return await negotiation.save();
};

export const getNegotiationById = async (
  id: string
): Promise<any> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppCustomError(
      "NEGOTIATION_NOT_FOUND",
      "Invalid negotiation ID format",
      400
    );
  }

  const negotiation = await Negotiation.findById(id)
    .populate("merchantId", "name businessName email currency")
    .populate("productId", "name sku price costPrice category imageUrl deliveryDays isNegotiable")
    .populate("policyId", "name maxDiscountPercent minMarginPercent freeShippingThreshold autoApprovalLimit");

  if (!negotiation) {
    throw new AppCustomError(
      "NEGOTIATION_NOT_FOUND",
      "Negotiation not found",
      404
    );
  }

  // Retrieve associated conversation messages if available
  let conversation: any = null;
  try {
    const convDoc = await Conversation.findOne({
      $or: [
        { "buyerState.negotiationId": id },
        { "buyerState.negotiationId": new mongoose.Types.ObjectId(id) },
      ],
    }).select("conversationId messages createdAt updatedAt");

    if (convDoc) {
      conversation = {
        conversationId: convDoc.conversationId,
        messages: convDoc.messages,
        createdAt: convDoc.createdAt,
        updatedAt: convDoc.updatedAt,
      };
    }
  } catch {
    // Non-fatal fallback
  }

  // Retrieve associated audit events if available
  let auditEvents: any[] = [];
  try {
    auditEvents = await getAuditEventsForNegotiation(id);
  } catch {
    // Non-fatal fallback
  }

  const negObj = negotiation.toObject ? negotiation.toObject() : negotiation;

  // Derive free delivery eligibility from Policy.freeShippingThreshold
  let freeDeliveryEligible: boolean | undefined = undefined;
  const policy = negotiation.policyId as any;
  if (policy && typeof policy.freeShippingThreshold === "number" && policy.freeShippingThreshold > 0) {
    const effectiveUnitPrice =
      negotiation.acceptedPrice ??
      negotiation.currentMerchantOffer ??
      negotiation.originalUnitPrice;
    const orderValue = effectiveUnitPrice * negotiation.quantity;
    freeDeliveryEligible = orderValue >= policy.freeShippingThreshold;
  }

  return {
    ...negObj,
    conversation,
    auditEvents,
    freeDeliveryEligible,
  };
};

export interface GetNegotiationsQuery {
  merchantId?: string;
  status?: string;
  search?: string;
  page?: string | number;
  limit?: string | number;
}

export const getAllNegotiations = async (query: GetNegotiationsQuery = {}) => {
  const filter: any = {};

  if (query.merchantId) {
    if (!mongoose.Types.ObjectId.isValid(query.merchantId)) {
      throw new AppCustomError("INVALID_MERCHANT", "Invalid merchant ID format", 400);
    }
    filter.merchantId = query.merchantId;
  }

  if (query.status) {
    filter.status = query.status.toUpperCase();
  }

  if (query.search && query.search.trim()) {
    const trimmed = query.search.trim();
    const matchingProducts = await Product.find({
      $or: [
        { name: { $regex: trimmed, $options: "i" } },
        { sku: { $regex: trimmed, $options: "i" } },
      ],
    }).distinct("_id");
    filter.productId = { $in: matchingProducts };
  }

  const page = Math.max(1, parseInt(String(query.page || "1"), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(query.limit || "20"), 10) || 20)
  );
  const skip = (page - 1) * limit;

  const total = await Negotiation.countDocuments(filter);
  const totalPages = Math.ceil(total / limit) || 1;

  const rawData = await Negotiation.find(filter)
    .populate("merchantId", "name businessName email currency")
    .populate("productId", "name sku price category imageUrl deliveryDays")
    .populate("policyId", "name maxDiscountPercent minMarginPercent freeShippingThreshold autoApprovalLimit")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const data = rawData.map((neg) => {
    const negObj = neg.toObject ? neg.toObject() : neg;
    let freeDeliveryEligible: boolean | undefined = undefined;
    const policy = neg.policyId as any;
    if (policy && typeof policy.freeShippingThreshold === "number" && policy.freeShippingThreshold > 0) {
      const effectiveUnitPrice =
        neg.acceptedPrice ?? neg.currentMerchantOffer ?? neg.originalUnitPrice;
      const orderValue = effectiveUnitPrice * neg.quantity;
      freeDeliveryEligible = orderValue >= policy.freeShippingThreshold;
    }
    return {
      ...negObj,
      freeDeliveryEligible,
    };
  });

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};
