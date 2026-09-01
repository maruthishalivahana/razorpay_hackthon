export interface Policy {
  _id?: string;
  id?: string;
  merchantId: string;
  name: string;
  description?: string;
  isActive: boolean;
  negotiationEnabled: boolean;
  maxDiscountPercent: number;
  minMarginPercent: number;
  maxQuantityPerOrder: number;
  minOrderValue: number;
  maxOrderValue: number;
  autoApprovalEnabled: boolean;
  autoApprovalLimit: number;
  freeShippingThreshold: number;
  maxNegotiationRounds: number;
  allowedCurrencies: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PolicyApiResponse {
  success: boolean;
  data: Policy;
  message?: string;
}

export interface PoliciesListApiResponse {
  success: boolean;
  data: Policy[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
