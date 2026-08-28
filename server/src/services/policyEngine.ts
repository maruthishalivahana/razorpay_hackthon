export interface ProductPolicyInput {
  price: number;
  costPrice: number;
}

export interface PolicyInput {
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
}

export interface PolicyEvaluationInput {
  policy: PolicyInput;
  product: ProductPolicyInput;
  quantity: number;
  unitPrice: number;
  currency: string;
  discountPercent?: number;
  orderValue?: number;
  negotiationRequested?: boolean;
  autoApprovalRequested?: boolean;
}

export type PolicyDecision = "ALLOW" | "REJECT" | "APPROVAL_REQUIRED";

export interface PolicyChecksStatus {
  policyActive: boolean;
  negotiationAllowed: boolean;
  discountAllowed: boolean;
  marginAllowed: boolean;
  quantityAllowed: boolean;
  orderValueAllowed: boolean;
  currencyAllowed: boolean;
  approvalAllowed: boolean;
}

export interface EvaluatedValues {
  quantity: number;
  unitPrice: number;
  orderValue: number;
  discountPercent?: number;
  marginPercent: number;
  currency: string;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  allowed: boolean;
  approvalRequired: boolean;
  reasons: string[];
  violations: string[];
  checks: PolicyChecksStatus;
  evaluatedValues: EvaluatedValues;
}

export class PolicyEngineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyEngineValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Rounds money amounts to 2 decimal places.
 */
const roundMoney = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

/**
 * Rounds percentage values to 2 decimal places.
 */
const roundPercent = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

/**
 * Evaluates whether a proposed commerce action is authorized by the merchant's policy rules.
 */
export const evaluatePolicy = (
  input: PolicyEvaluationInput
): PolicyEvaluationResult => {
  const {
    policy,
    product,
    quantity,
    unitPrice,
    currency,
    discountPercent: rawDiscountPercent,
    orderValue: rawOrderValue,
    negotiationRequested,
  } = input;

  // 1. Input Safety Validations
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new PolicyEngineValidationError(
      "Quantity must be a positive integer >= 1"
    );
  }

  if (typeof unitPrice !== "number" || unitPrice <= 0) {
    throw new PolicyEngineValidationError("Unit price must be > 0");
  }

  if (typeof product.price !== "number" || product.price <= 0) {
    throw new PolicyEngineValidationError("Product base price must be > 0");
  }

  if (typeof product.costPrice !== "number" || product.costPrice < 0) {
    throw new PolicyEngineValidationError("Product cost price must be >= 0");
  }

  if (!currency || typeof currency !== "string" || currency.trim().length === 0) {
    throw new PolicyEngineValidationError("Currency must be a valid non-empty string");
  }

  // Calculate derived evaluated values
  const normalizedCurrency = currency.trim().toUpperCase();
  const calculatedOrderValue = roundMoney(
    rawOrderValue !== undefined ? rawOrderValue : unitPrice * quantity
  );

  if (calculatedOrderValue < 0) {
    throw new PolicyEngineValidationError("Order value cannot be negative");
  }

  const calculatedDiscountPercent = roundPercent(
    rawDiscountPercent !== undefined
      ? rawDiscountPercent
      : ((product.price - unitPrice) / product.price) * 100
  );

  const calculatedMarginPercent = roundPercent(
    ((unitPrice - product.costPrice) / unitPrice) * 100
  );

  const checks: PolicyChecksStatus = {
    policyActive: true,
    negotiationAllowed: true,
    discountAllowed: true,
    marginAllowed: true,
    quantityAllowed: true,
    orderValueAllowed: true,
    currencyAllowed: true,
    approvalAllowed: true,
  };

  const violations: string[] = [];

  // Check 1: Policy Active
  if (!policy.isActive) {
    checks.policyActive = false;
    violations.push("Merchant policy is inactive.");
  }

  // Check 2: Currency Allowed (case-insensitive)
  const allowedUpperCurrencies = (policy.allowedCurrencies || []).map((c) =>
    c.toUpperCase()
  );
  if (!allowedUpperCurrencies.includes(normalizedCurrency)) {
    checks.currencyAllowed = false;
    violations.push(
      `Currency ${normalizedCurrency} is not allowed by merchant policy.`
    );
  }

  // Check 3: Quantity Limit
  if (quantity < 1 || quantity > policy.maxQuantityPerOrder) {
    checks.quantityAllowed = false;
    violations.push(
      `Quantity exceeds merchant policy limit of ${policy.maxQuantityPerOrder}.`
    );
  }

  // Check 4: Order Value Limits
  if (calculatedOrderValue < policy.minOrderValue) {
    checks.orderValueAllowed = false;
    violations.push(
      `Order value is below merchant minimum order value of ${policy.minOrderValue}.`
    );
  } else if (calculatedOrderValue > policy.maxOrderValue) {
    checks.orderValueAllowed = false;
    violations.push(
      `Order value exceeds merchant maximum order value of ${policy.maxOrderValue}.`
    );
  }

  // Check 5: Discount Percent
  if (calculatedDiscountPercent < 0 || calculatedDiscountPercent > policy.maxDiscountPercent) {
    checks.discountAllowed = false;
    violations.push(
      `Requested discount of ${calculatedDiscountPercent}% exceeds merchant policy limit of ${policy.maxDiscountPercent}%.`
    );
  }

  // Check 6: Minimum Margin Requirement
  if (calculatedMarginPercent < policy.minMarginPercent) {
    checks.marginAllowed = false;
    violations.push(
      `Proposed price results in a ${calculatedMarginPercent}% margin, below the required minimum margin of ${policy.minMarginPercent}%.`
    );
  }

  // Check 7: Negotiation Request
  if (negotiationRequested && !policy.negotiationEnabled) {
    checks.negotiationAllowed = false;
    violations.push("Negotiation is disabled for this merchant.");
  }

  // Check 8: Automatic Approval Limit
  if (!policy.autoApprovalEnabled || calculatedOrderValue > policy.autoApprovalLimit) {
    checks.approvalAllowed = false;
  }

  // Determine Final Decision and Reasons
  let decision: PolicyDecision;
  let allowed: boolean;
  let approvalRequired: boolean;
  const reasons: string[] = [];

  if (violations.length > 0) {
    decision = "REJECT";
    allowed = false;
    approvalRequired = false;
    reasons.push("Transaction violates merchant policy.", ...violations);
  } else if (!checks.approvalAllowed) {
    decision = "APPROVAL_REQUIRED";
    allowed = false;
    approvalRequired = true;
    reasons.push(
      "Transaction satisfies merchant policy but exceeds the automatic approval limit."
    );
  } else {
    decision = "ALLOW";
    allowed = true;
    approvalRequired = false;
    reasons.push("Transaction satisfies all merchant policy constraints.");
  }

  return {
    decision,
    allowed,
    approvalRequired,
    reasons,
    violations,
    checks,
    evaluatedValues: {
      quantity,
      unitPrice,
      orderValue: calculatedOrderValue,
      discountPercent: calculatedDiscountPercent,
      marginPercent: calculatedMarginPercent,
      currency: normalizedCurrency,
    },
  };
};
