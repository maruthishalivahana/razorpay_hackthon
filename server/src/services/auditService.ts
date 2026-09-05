import mongoose from "mongoose";
import AuditEvent, {
  type IAuditEvent,
  type AuditActorType,
  type AuditEventType,
} from "../models/AuditEvent.js";

export interface CreateAuditEventInput {
  merchantId: string | mongoose.Types.ObjectId;
  negotiationId?: string | mongoose.Types.ObjectId;
  agreementId?: string | mongoose.Types.ObjectId;
  approvalId?: string | mongoose.Types.ObjectId;
  orderId?: string;
  paymentId?: string;
  productId?: string | mongoose.Types.ObjectId;
  eventType: AuditEventType | string;
  actorType: AuditActorType;
  actorId?: string;
  description: string;
  data?: Record<string, any>;
}

export const createAuditEvent = async (
  input: CreateAuditEventInput
): Promise<IAuditEvent> => {
  const auditEvent = new AuditEvent({
    merchantId: input.merchantId,
    negotiationId: input.negotiationId,
    agreementId: input.agreementId,
    approvalId: input.approvalId,
    orderId: input.orderId,
    paymentId: input.paymentId,
    productId: input.productId,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId,
    description: input.description,
    data: input.data,
    createdAt: new Date(),
  });

  return await auditEvent.save();
};

export interface AuditEventQuery {
  merchantId: string;
  eventType?: string;
  category?: string;
  productId?: string;
  negotiationId?: string;
  agreementId?: string;
  orderId?: string;
  paymentId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: string | number;
  pageSize?: string | number;
}

const categoryEventTypes: Record<string, string[]> = {
  negotiation: [
    "NEGOTIATION_STARTED", "BUYER_OFFER_SUBMITTED", "MERCHANT_COUNTER_OFFERED",
    "NEGOTIATION_ACCEPTED", "NEGOTIATION_REJECTED", "NEGOTIATION_EXPIRED",
    "NEGOTIATION_FAILED",
  ],
  policy: ["POLICY_EVALUATED", "POLICY_AUTO_APPROVED", "POLICY_BLOCKED", "AGREEMENT_VALIDATION_FAILED"],
  order: ["ORDER_PLACED", "AGREEMENT_CREATED", "AGREEMENT_APPROVED", "AGREEMENT_REJECTED", "AGREEMENT_EXPIRED"],
  payment: ["PAYMENT_READY", "PAYMENT_ORDER_CREATED", "PAYMENT_VERIFICATION_STARTED", "PAYMENT_VERIFIED", "PAYMENT_CAPTURED", "PAYMENT_FAILED"],
  inventory: ["INVENTORY_CHECKED", "INVENTORY_DEDUCTED", "INVENTORY_UNAVAILABLE"],
  errors: ["NEGOTIATION_FAILED", "POLICY_BLOCKED", "AGREEMENT_VALIDATION_FAILED", "ORDER_FAILED", "PAYMENT_FAILED", "INVENTORY_UNAVAILABLE"],
};

export const getMerchantAuditEvents = async (query: AuditEventQuery) => {
  if (!mongoose.Types.ObjectId.isValid(query.merchantId)) {
    throw new Error("Invalid merchant ID format");
  }

  const filter: Record<string, unknown> = { merchantId: query.merchantId };
  const eventTypes = query.category ? categoryEventTypes[query.category.toLowerCase()] : undefined;
  if (query.eventType) filter.eventType = query.eventType;
  else if (eventTypes) filter.eventType = { $in: eventTypes };

  for (const field of ["productId", "negotiationId", "agreementId"] as const) {
    const value = query[field];
    if (value) {
      if (!mongoose.Types.ObjectId.isValid(value)) return { items: [], page: 1, pageSize: 25, total: 0, hasMore: false };
      filter[field] = value;
    }
  }
  if (query.orderId) filter.orderId = query.orderId;
  if (query.paymentId) filter.paymentId = query.paymentId;

  if (query.dateFrom || query.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (query.dateFrom) createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo) createdAt.$lte = new Date(query.dateTo);
    filter.createdAt = createdAt;
  }
  if (query.search?.trim()) {
    const search = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { eventType: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { actorType: { $regex: search, $options: "i" } },
    ];
  }

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const [items, total] = await Promise.all([
    AuditEvent.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    AuditEvent.countDocuments(filter),
  ]);

  return { items, page, pageSize, total, hasMore: page * pageSize < total };
};

export const getAuditEventsForAgreement = async (
  agreementId: string,
  merchantId?: string
): Promise<IAuditEvent[]> => {
  if (!mongoose.Types.ObjectId.isValid(agreementId)) {
    return [];
  }
  return await AuditEvent.find({ agreementId, ...(merchantId ? { merchantId } : {}) }).sort({ createdAt: 1 });
};

export const getAuditEventsForNegotiation = async (
  negotiationId: string,
  merchantId?: string
): Promise<IAuditEvent[]> => {
  if (!mongoose.Types.ObjectId.isValid(negotiationId)) {
    return [];
  }
  return await AuditEvent.find({ negotiationId, ...(merchantId ? { merchantId } : {}) }).sort({ createdAt: 1 });
};
