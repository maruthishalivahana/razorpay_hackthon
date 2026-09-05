import mongoose from "mongoose";
import Agreement, { type IAgreement, type AgreementStatus } from "../models/Agreement.js";
import Negotiation from "../models/Negotiation.js";
import Product from "../models/Product.js";
import Policy from "../models/Policy.js";
import Approval from "../models/Approval.js";
import { AppCustomError } from "./negotiationService.js";
import { calculateEconomicOffer, roundMoney, roundPercent } from "./economicEngine.js";
import { evaluatePolicy } from "./policyEngine.js";
import { createAuditEvent, getAuditEventsForAgreement } from "./auditService.js";
import { createApprovalRequest } from "./approvalService.js";
import { getCurrentPolicyForMerchant } from "./policyService.js";

export interface ApproveAgreementResult {
  agreementId: string;
  status: "APPROVED";
  approvedBy: string;
  approvedAt: string;
  paymentReady: boolean;
}

export interface RejectAgreementResult {
  agreementId: string;
  status: "REJECTED";
  reviewer: string;
  reason: string;
  rejectedAt: string;
}

export interface AgreementExplanationResult {
  agreementId: string;
  summary: string;
  financials: {
    originalPrice: number;
    agreedPrice: number;
    discountPercent: number;
    quantity: number;
    orderValue: number;
    marginPercent: number;
  };
  policy: {
    maxDiscountPercent: number;
    minMarginPercent: number;
    autoApprovalLimit: number;
  };
  decision: AgreementStatus;
  approval: string;
  auditTrail: any[];
}

export const createAgreementFromNegotiation = async (
  negotiationId: string
): Promise<IAgreement> => {
  if (!mongoose.Types.ObjectId.isValid(negotiationId)) {
    throw new AppCustomError("NEGOTIATION_NOT_FOUND", "Invalid negotiation ID format", 400);
  }

  const negotiation = await Negotiation.findById(negotiationId);
  if (!negotiation) {
    throw new AppCustomError("NEGOTIATION_NOT_FOUND", "Negotiation not found", 404);
  }

  if (negotiation.status !== "ACCEPTED") {
    throw new AppCustomError(
      "NEGOTIATION_NOT_ACCEPTED",
      "Negotiation is not in ACCEPTED status",
      400
    );
  }

  // Idempotency check: if an agreement already exists for this negotiation
  const existing = await Agreement.findOne({ negotiationId: negotiation._id });
  if (existing) {
    return existing;
  }

  const product = await Product.findById(negotiation.productId);
  if (!product) {
    throw new AppCustomError("INVALID_PRODUCT", "Product not found", 404);
  }

  const policy = await getCurrentPolicyForMerchant(negotiation.merchantId.toString());

  const agreedPrice = negotiation.acceptedPrice ?? negotiation.currentBuyerOffer ?? negotiation.originalUnitPrice;

  console.log("[AGREEMENT_POLICY]", JSON.stringify({
    merchantId: negotiation.merchantId.toString(),
    policyId: policy._id.toString(),
    maxDiscountPercent: policy.maxDiscountPercent,
    minMarginPercent: policy.minMarginPercent,
    autoApprovalLimit: policy.autoApprovalLimit,
    productPrice: product.price,
    costPrice: product.costPrice,
    agreedPrice,
  }));

  // 1. Revalidate Financials with Economic Engine
  const economicResult = calculateEconomicOffer({
    product,
    policy,
    quantity: negotiation.quantity,
    buyerOffer: agreedPrice,
  });

  // 2. Revalidate Policy Rules with Policy Engine
  const policyResult = evaluatePolicy({
    policy,
    product,
    quantity: negotiation.quantity,
    unitPrice: agreedPrice,
    currency: negotiation.currency,
    negotiationRequested: true,
  });

  // Check if current merchant policy invalidates the agreed deal
  if (policyResult.violations.length > 0) {
    await createAuditEvent({
      merchantId: negotiation.merchantId,
      negotiationId: negotiation._id,
      eventType: "AGREEMENT_VALIDATION_FAILED",
      actorType: "SYSTEM",
      description: "Agreement creation failed current merchant policy validation.",
      data: { violations: policyResult.violations },
    });

    throw new AppCustomError(
      "POLICY_VALIDATION_FAILED",
      "Agreement failed current merchant policy validation",
      400
    );
  }

  const originalUnitPrice = product.price;
  const agreedUnitPrice = roundMoney(agreedPrice);
  const quantity = negotiation.quantity;
  const finalOrderValue = roundMoney(agreedUnitPrice * quantity);
  const discountPercent = roundPercent(((originalUnitPrice - agreedUnitPrice) / originalUnitPrice) * 100);
  const marginPercent = roundPercent(((agreedUnitPrice - product.costPrice) / agreedUnitPrice) * 100);

  // Check Auto Approval vs Manual Approval Gate
  const autoApproved = policy.autoApprovalEnabled && finalOrderValue <= policy.autoApprovalLimit;
  const status: AgreementStatus = autoApproved ? "APPROVED" : "PENDING_APPROVAL";

  const agreement = new Agreement({
    negotiationId: negotiation._id,
    merchantId: negotiation.merchantId,
    productId: negotiation.productId,
    policyId: negotiation.policyId,
    status,
    quantity,
    currency: negotiation.currency,
    originalUnitPrice,
    agreedUnitPrice,
    discountPercent,
    finalOrderValue,
    marginPercent,
    approvedAt: autoApproved ? new Date() : undefined,
  });

  const savedAgreement = await agreement.save();

  // Audit Events Logging
  await createAuditEvent({
    merchantId: negotiation.merchantId,
    negotiationId: negotiation._id,
    agreementId: savedAgreement._id,
    eventType: "AGREEMENT_CREATED",
    actorType: "SYSTEM",
    description: `Agreement created for ${quantity} units at ₹${agreedUnitPrice} each.`,
    data: { quantity, agreedUnitPrice, finalOrderValue, currency: negotiation.currency },
  });

  await createAuditEvent({
    merchantId: negotiation.merchantId,
    negotiationId: negotiation._id,
    agreementId: savedAgreement._id,
    eventType: "AGREEMENT_VALIDATED",
    actorType: "SYSTEM",
    description: "Agreement validated against current product economics and merchant policy.",
    data: {
      originalUnitPrice,
      agreedUnitPrice,
      quantity,
      discountPercent,
      marginPercent,
      finalOrderValue,
      minMarginPercent: policy.minMarginPercent,
      maxDiscountPercent: policy.maxDiscountPercent,
      autoApprovalLimit: policy.autoApprovalLimit,
    },
  });

  if (autoApproved) {
    await createAuditEvent({
      merchantId: negotiation.merchantId,
      negotiationId: negotiation._id,
      agreementId: savedAgreement._id,
      eventType: "AGREEMENT_AUTO_APPROVED",
      actorType: "SYSTEM",
      description: `Agreement automatically approved (Order value ₹${finalOrderValue} <= Auto Approval Limit ₹${policy.autoApprovalLimit}).`,
    });

    await createAuditEvent({
      merchantId: negotiation.merchantId,
      negotiationId: negotiation._id,
      agreementId: savedAgreement._id,
      eventType: "PAYMENT_READY",
      actorType: "SYSTEM",
      description: "Agreement is approved and ready for payment processing.",
    });
  } else {
    const approvalReq = await createApprovalRequest(
      savedAgreement._id,
      negotiation.merchantId,
      `Order value ₹${finalOrderValue} exceeds auto approval limit ₹${policy.autoApprovalLimit}.`
    );

    await createAuditEvent({
      merchantId: negotiation.merchantId,
      negotiationId: negotiation._id,
      agreementId: savedAgreement._id,
      approvalId: approvalReq._id,
      eventType: "APPROVAL_REQUESTED",
      actorType: "SYSTEM",
      description: `Merchant approval required as order value (₹${finalOrderValue}) exceeds automatic limit (₹${policy.autoApprovalLimit}).`,
    });
  }

  return savedAgreement;
};

export const approveAgreement = async (
  agreementId: string,
  reviewer: string
): Promise<ApproveAgreementResult> => {
  if (!mongoose.Types.ObjectId.isValid(agreementId)) {
    throw new AppCustomError("AGREEMENT_NOT_FOUND", "Invalid agreement ID format", 400);
  }

  const agreement = await Agreement.findById(agreementId);
  if (!agreement) {
    throw new AppCustomError("AGREEMENT_NOT_FOUND", "Agreement not found", 404);
  }

  if (agreement.status === "APPROVED") {
    throw new AppCustomError("AGREEMENT_ALREADY_APPROVED", "Agreement is already approved", 409);
  }

  if (agreement.status === "REJECTED") {
    throw new AppCustomError("AGREEMENT_ALREADY_REJECTED", "Agreement is already rejected", 409);
  }

  if (agreement.status !== "PENDING_APPROVAL") {
    throw new AppCustomError("APPROVAL_NOT_PENDING", "Agreement is not pending approval", 400);
  }

  // Load current Product and Policy to perform financial revalidation
  const product = await Product.findById(agreement.productId);
  if (!product) {
    throw new AppCustomError("INVALID_PRODUCT", "Product not found", 404);
  }

  const policy = await Policy.findById(agreement.policyId);
  if (!policy) {
    throw new AppCustomError("INVALID_POLICY", "Policy not found", 404);
  }

  // Financial and Policy Revalidation
  const policyResult = evaluatePolicy({
    policy,
    product,
    quantity: agreement.quantity,
    unitPrice: agreement.agreedUnitPrice,
    currency: agreement.currency,
    negotiationRequested: true,
  });

  if (policyResult.violations.length > 0) {
    await createAuditEvent({
      merchantId: agreement.merchantId,
      negotiationId: agreement.negotiationId,
      agreementId: agreement._id,
      eventType: "AGREEMENT_VALIDATION_FAILED",
      actorType: "SYSTEM",
      description: "Agreement is no longer valid under the current merchant policy.",
      data: { violations: policyResult.violations },
    });

    throw new AppCustomError(
      "POLICY_VALIDATION_FAILED",
      "Agreement is no longer valid under the current merchant policy.",
      400
    );
  }

  // Update Approval document
  const approval = await Approval.findOne({ agreementId: agreement._id });
  if (approval) {
    approval.status = "APPROVED";
    approval.reviewer = reviewer;
    approval.reviewedAt = new Date();
    await approval.save();
  }

  // Update Agreement
  agreement.status = "APPROVED";
  agreement.approvedAt = new Date();
  await agreement.save();

  // Log Audit Events
  await createAuditEvent({
    merchantId: agreement.merchantId,
    negotiationId: agreement.negotiationId,
    agreementId: agreement._id,
    approvalId: approval?._id,
    eventType: "AGREEMENT_APPROVED",
    actorType: "MERCHANT",
    actorId: reviewer,
    description: `Agreement approved by merchant reviewer '${reviewer}'.`,
  });

  await createAuditEvent({
    merchantId: agreement.merchantId,
    negotiationId: agreement.negotiationId,
    agreementId: agreement._id,
    approvalId: approval?._id,
    eventType: "PAYMENT_READY",
    actorType: "SYSTEM",
    description: "Agreement is approved and ready for payment processing.",
  });

  return {
    agreementId: agreement._id.toString(),
    status: "APPROVED",
    approvedBy: reviewer,
    approvedAt: agreement.approvedAt.toISOString(),
    paymentReady: true,
  };
};

export const rejectAgreement = async (
  agreementId: string,
  reviewer: string,
  reason?: string
): Promise<RejectAgreementResult> => {
  if (!mongoose.Types.ObjectId.isValid(agreementId)) {
    throw new AppCustomError("AGREEMENT_NOT_FOUND", "Invalid agreement ID format", 400);
  }

  const agreement = await Agreement.findById(agreementId);
  if (!agreement) {
    throw new AppCustomError("AGREEMENT_NOT_FOUND", "Agreement not found", 404);
  }

  if (agreement.status === "APPROVED") {
    throw new AppCustomError("AGREEMENT_ALREADY_APPROVED", "Cannot reject an already approved agreement", 409);
  }

  if (agreement.status === "REJECTED") {
    throw new AppCustomError("AGREEMENT_ALREADY_REJECTED", "Agreement is already rejected", 409);
  }

  if (agreement.status !== "PENDING_APPROVAL") {
    throw new AppCustomError("APPROVAL_NOT_PENDING", "Agreement is not pending approval", 400);
  }

  const rejectReason = reason || "Agreement rejected by merchant reviewer";

  // Update Approval document
  const approval = await Approval.findOne({ agreementId: agreement._id });
  if (approval) {
    approval.status = "REJECTED";
    approval.reviewer = reviewer;
    approval.reason = rejectReason;
    approval.reviewedAt = new Date();
    await approval.save();
  }

  // Update Agreement
  agreement.status = "REJECTED";
  await agreement.save();

  // Log Audit Event
  await createAuditEvent({
    merchantId: agreement.merchantId,
    negotiationId: agreement.negotiationId,
    agreementId: agreement._id,
    approvalId: approval?._id,
    eventType: "AGREEMENT_REJECTED",
    actorType: "MERCHANT",
    actorId: reviewer,
    description: `Agreement rejected by merchant reviewer '${reviewer}'. Reason: ${rejectReason}`,
    data: { reason: rejectReason },
  });

  return {
    agreementId: agreement._id.toString(),
    status: "REJECTED",
    reviewer,
    reason: rejectReason,
    rejectedAt: new Date().toISOString(),
  };
};

export const getAgreementById = async (id: string): Promise<any> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppCustomError("AGREEMENT_NOT_FOUND", "Invalid agreement ID format", 400);
  }

  const agreement = await Agreement.findById(id)
    .populate("merchantId", "name businessName email currency")
    .populate("productId", "name sku price costPrice imageUrl category deliveryDays isNegotiable")
    .populate("policyId", "name maxDiscountPercent minMarginPercent autoApprovalLimit freeShippingThreshold")
    .populate("negotiationId");

  if (!agreement) {
    throw new AppCustomError("AGREEMENT_NOT_FOUND", "Agreement not found", 404);
  }

  const approval = await Approval.findOne({ agreementId: agreement._id });
  const auditEvents = await getAuditEventsForAgreement(id);
  let paymentReady = false;
  try {
    const pr = await isPaymentReady(id);
    paymentReady = pr.paymentReady;
  } catch {
    paymentReady = false;
  }

  const agObj = agreement.toObject ? agreement.toObject() : agreement;

  return {
    ...agObj,
    approval,
    auditEvents,
    paymentReady,
  };
};

export interface GetAgreementsQuery {
  merchantId?: string;
  status?: string;
  search?: string;
  page?: string | number;
  limit?: string | number;
}

export const getAllAgreements = async (query: GetAgreementsQuery = {}) => {
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

  const total = await Agreement.countDocuments(filter);
  const totalPages = Math.ceil(total / limit) || 1;

  const rawAgreements = await Agreement.find(filter)
    .populate("merchantId", "name businessName email currency")
    .populate("productId", "name sku price imageUrl category deliveryDays isNegotiable")
    .populate("policyId", "name maxDiscountPercent minMarginPercent autoApprovalLimit freeShippingThreshold")
    .populate("negotiationId")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const agreementIds = rawAgreements.map((a) => a._id);
  const approvals = await Approval.find({ agreementId: { $in: agreementIds } });
  const approvalMap = new Map(approvals.map((app) => [app.agreementId.toString(), app]));

  const data = rawAgreements.map((ag) => {
    const agObj = ag.toObject ? ag.toObject() : ag;
    const approval = approvalMap.get(ag._id.toString()) || null;
    const paymentReady = ag.status === "APPROVED";
    return {
      ...agObj,
      approval,
      paymentReady,
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

export const getAgreementExplanation = async (
  agreementId: string
): Promise<AgreementExplanationResult> => {
  if (!mongoose.Types.ObjectId.isValid(agreementId)) {
    throw new AppCustomError("AGREEMENT_NOT_FOUND", "Invalid agreement ID format", 400);
  }

  const agreement = await Agreement.findById(agreementId);
  if (!agreement) {
    throw new AppCustomError("AGREEMENT_NOT_FOUND", "Agreement not found", 404);
  }

  const policy = await Policy.findById(agreement.policyId);
  const approval = await Approval.findOne({ agreementId: agreement._id });
  const auditTrail = await getAuditEventsForAgreement(agreementId);

  let approvalExplanation = "";
  if (agreement.status === "APPROVED") {
    approvalExplanation = approval && approval.reviewer
      ? `Approved by merchant reviewer '${approval.reviewer}'.`
      : "Automatically approved based on merchant policy threshold.";
  } else if (agreement.status === "PENDING_APPROVAL") {
    approvalExplanation = `Merchant approval is required because the order value (₹${agreement.finalOrderValue}) exceeds the automatic approval limit (₹${policy?.autoApprovalLimit || 0}).`;
  } else if (agreement.status === "REJECTED") {
    approvalExplanation = approval && approval.reason
      ? `Agreement was rejected. Reason: ${approval.reason}`
      : "Agreement was rejected by merchant.";
  } else {
    approvalExplanation = `Agreement status is ${agreement.status}.`;
  }

  return {
    agreementId: agreement._id.toString(),
    summary: `Buyer and merchant agreed to purchase ${agreement.quantity} units at ₹${agreement.agreedUnitPrice} each.`,
    financials: {
      originalPrice: agreement.originalUnitPrice,
      agreedPrice: agreement.agreedUnitPrice,
      discountPercent: agreement.discountPercent,
      quantity: agreement.quantity,
      orderValue: agreement.finalOrderValue,
      marginPercent: agreement.marginPercent,
    },
    policy: {
      maxDiscountPercent: policy?.maxDiscountPercent || 0,
      minMarginPercent: policy?.minMarginPercent || 0,
      autoApprovalLimit: policy?.autoApprovalLimit || 0,
    },
    decision: agreement.status,
    approval: approvalExplanation,
    auditTrail,
  };
};

export const isPaymentReady = async (
  agreementId: string
): Promise<{ paymentReady: boolean }> => {
  if (!mongoose.Types.ObjectId.isValid(agreementId)) {
    throw new AppCustomError("AGREEMENT_NOT_FOUND", "Invalid agreement ID format", 400);
  }

  const agreement = await Agreement.findById(agreementId);
  if (!agreement) {
    throw new AppCustomError("AGREEMENT_NOT_FOUND", "Agreement not found", 404);
  }

  if (agreement.status !== "APPROVED") {
    throw new AppCustomError(
      "AGREEMENT_NOT_APPROVED",
      "Agreement must be approved before payment.",
      400
    );
  }

  const isValid =
    !!agreement.merchantId &&
    !!agreement.productId &&
    agreement.quantity > 0 &&
    agreement.agreedUnitPrice > 0 &&
    agreement.finalOrderValue > 0 &&
    !!agreement.currency;

  if (!isValid) {
    throw new AppCustomError(
      "AGREEMENT_NOT_APPROVED",
      "Agreement data is incomplete for payment processing",
      400
    );
  }

  // Pre-purchase stock validation: Verify product still has sufficient inventory
  const product = await Product.findById(agreement.productId);
  if (!product || product.inventory < agreement.quantity) {
    return { paymentReady: false };
  }

  return { paymentReady: true };
};
