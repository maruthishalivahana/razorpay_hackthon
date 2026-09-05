import type { PopulatedProduct, PopulatedMerchant, PopulatedPolicy, AuditEventInfo } from "./negotiation";

export type { PopulatedProduct, PopulatedMerchant, PopulatedPolicy, AuditEventInfo };

export type AgreementStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "COMPLETED";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ApprovalInfo {
  _id?: string;
  id?: string;
  agreementId: string;
  merchantId: string;
  status: ApprovalStatus;
  reason?: string;
  reviewer?: string;
  requestedAt: string;
  reviewedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PopulatedNegotiation {
  _id?: string;
  id?: string;
  currentRound?: number;
  maxRounds?: number;
  currentBuyerOffer?: number;
  currentMerchantOffer?: number;
  acceptedPrice?: number;
  status?: string;
}

export interface Agreement {
  _id?: string;
  id?: string;
  negotiationId: string | PopulatedNegotiation;
  merchantId: string | PopulatedMerchant;
  productId: string | PopulatedProduct;
  policyId?: string | PopulatedPolicy;
  status: AgreementStatus;
  quantity: number;
  currency: string;
  originalUnitPrice: number;
  agreedUnitPrice: number;
  discountPercent: number;
  finalOrderValue: number;
  marginPercent: number;
  approval?: ApprovalInfo | null;
  paymentReady?: boolean;
  auditEvents?: AuditEventInfo[];
  expiresAt?: string;
  approvedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgreementPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AgreementsListApiResponse {
  success: boolean;
  data: Agreement[];
  pagination?: AgreementPagination;
}

export interface SingleAgreementApiResponse {
  success: boolean;
  data: Agreement;
}

export interface PaymentReadyApiResponse {
  success: boolean;
  data: {
    paymentReady: boolean;
  };
}

export interface ApproveAgreementResult {
  success: boolean;
  data: {
    agreementId: string;
    status: "APPROVED";
    approvedBy: string;
    approvedAt: string;
    paymentReady: boolean;
  };
}

export interface RejectAgreementResult {
  success: boolean;
  data: {
    agreementId: string;
    status: "REJECTED";
    reviewer: string;
    reason: string;
    rejectedAt: string;
  };
}
