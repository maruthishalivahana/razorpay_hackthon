export interface ProductInput {
  price: number;
  costPrice: number;
}

export interface PolicyInput {
  maxDiscountPercent: number;
  minMarginPercent: number;
  maxQuantityPerOrder: number;
  minOrderValue: number;
  maxOrderValue: number;
}

export interface EconomicCalculationInput {
  product: ProductInput;
  policy: PolicyInput;
  quantity: number;
  buyerOffer?: number;
  buyerDiscountPercent?: number;
}

export interface EconomicCalculationResult {
  accepted: boolean;
  reason: string;
  baseUnitPrice: number;
  quantity: number;
  baseOrderValue: number;
  buyerRequestedDiscountPercent?: number;
  buyerRequestedUnitPrice?: number;
  buyerRequestedOrderValue?: number;
  policyMaxDiscountPercent: number;
  marginBasedMaxDiscountPercent: number;
  effectiveMaxDiscountPercent: number;
  minimumSafeUnitPrice: number;
  minimumAllowedUnitPrice: number;
  recommendedCounterOfferUnitPrice: number;
  recommendedOrderValue: number;
  discountAmount: number;
  estimatedProfit: number;
  estimatedMarginPercent: number;
}

export class EconomicEngineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EconomicEngineValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Rounds monetary amounts to 2 decimal places.
 */
export const roundMoney = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

/**
 * Rounds percentage values to 2 decimal places.
 */
export const roundPercent = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

/**
 * Performs deterministic financial calculations for AI Commerce negotiations.
 */
export const calculateEconomicOffer = (
  input: EconomicCalculationInput
): EconomicCalculationResult => {
  const { product, policy, quantity, buyerOffer, buyerDiscountPercent } = input;

  // 1. Input Validation
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new EconomicEngineValidationError(
      "Quantity must be a positive integer >= 1"
    );
  }

  if (typeof product.price !== "number" || product.price <= 0) {
    throw new EconomicEngineValidationError("Product price must be > 0");
  }

  if (typeof product.costPrice !== "number" || product.costPrice < 0) {
    throw new EconomicEngineValidationError("Product cost price must be >= 0");
  }

  if (product.costPrice >= product.price) {
    throw new EconomicEngineValidationError(
      "Cost price must be strictly less than selling price"
    );
  }

  if (
    typeof policy.maxDiscountPercent !== "number" ||
    policy.maxDiscountPercent < 0 ||
    policy.maxDiscountPercent > 100
  ) {
    throw new EconomicEngineValidationError(
      "maxDiscountPercent must be between 0 and 100"
    );
  }

  if (
    typeof policy.minMarginPercent !== "number" ||
    policy.minMarginPercent < 0 ||
    policy.minMarginPercent >= 100
  ) {
    throw new EconomicEngineValidationError(
      "minMarginPercent must be between 0 and less than 100"
    );
  }

  if (buyerOffer !== undefined && (typeof buyerOffer !== "number" || buyerOffer <= 0)) {
    throw new EconomicEngineValidationError("buyerOffer must be > 0");
  }

  if (
    buyerDiscountPercent !== undefined &&
    (typeof buyerDiscountPercent !== "number" ||
      buyerDiscountPercent < 0 ||
      buyerDiscountPercent > 100)
  ) {
    throw new EconomicEngineValidationError(
      "buyerDiscountPercent must be between 0 and 100"
    );
  }

  // 2. Base Order Values
  const baseUnitPrice = roundMoney(product.price);
  const baseOrderValue = roundMoney(baseUnitPrice * quantity);

  // 3. Minimum Safe Unit Price based on Merchant's Minimum Margin
  // Formula: minimumSafeUnitPrice = costPrice / (1 - minMarginPercent / 100)
  const marginDecimal = policy.minMarginPercent / 100;
  const rawMinimumSafeUnitPrice = product.costPrice / (1 - marginDecimal);
  const minimumSafeUnitPrice = roundMoney(rawMinimumSafeUnitPrice);

  // 4. Margin-Based Maximum Discount Percent
  // Formula: ((product.price - minimumSafeUnitPrice) / product.price) * 100
  let marginBasedMaxDiscountPercent = 0;
  if (product.price > minimumSafeUnitPrice) {
    marginBasedMaxDiscountPercent = roundPercent(
      ((product.price - minimumSafeUnitPrice) / product.price) * 100
    );
  }

  // 5. Effective Maximum Discount Percent
  const effectiveMaxDiscountPercent = roundPercent(
    Math.max(
      0,
      Math.min(policy.maxDiscountPercent, marginBasedMaxDiscountPercent)
    )
  );

  // 6. Allowed Minimum Unit Price & Recommended Counter Offer
  const minimumAllowedUnitPrice = roundMoney(
    product.price * (1 - effectiveMaxDiscountPercent / 100)
  );
  const recommendedCounterOfferUnitPrice = minimumAllowedUnitPrice;
  const recommendedOrderValue = roundMoney(
    recommendedCounterOfferUnitPrice * quantity
  );

  // 7. Handle Buyer Offer / Discount Request
  let buyerRequestedDiscountPercent: number | undefined;
  let buyerRequestedUnitPrice: number | undefined;
  let buyerRequestedOrderValue: number | undefined;

  if (buyerDiscountPercent !== undefined) {
    buyerRequestedDiscountPercent = roundPercent(buyerDiscountPercent);
    buyerRequestedUnitPrice = roundMoney(
      product.price * (1 - buyerRequestedDiscountPercent / 100)
    );
    buyerRequestedOrderValue = roundMoney(
      buyerRequestedUnitPrice * quantity
    );
  } else if (buyerOffer !== undefined) {
    buyerRequestedUnitPrice = roundMoney(buyerOffer);
    buyerRequestedDiscountPercent = roundPercent(
      ((product.price - buyerRequestedUnitPrice) / product.price) * 100
    );
    buyerRequestedOrderValue = roundMoney(
      buyerRequestedUnitPrice * quantity
    );
  }

  // 8. Determine Acceptance & Reason
  let accepted = true;
  let reason = "Buyer offer is within the merchant's allowed discount and margin limits.";

  // Rule A: Quantity Limit
  if (quantity > policy.maxQuantityPerOrder) {
    accepted = false;
    reason = `Order quantity of ${quantity} exceeds the merchant's maximum quantity of ${policy.maxQuantityPerOrder}.`;
  }
  // Rule B: Discount / Price Request Check
  else if (buyerRequestedDiscountPercent !== undefined && buyerDiscountPercent !== undefined) {
    if (buyerRequestedDiscountPercent > effectiveMaxDiscountPercent) {
      accepted = false;
      reason = `Requested ${buyerRequestedDiscountPercent}% discount exceeds the merchant's maximum allowed discount of ${effectiveMaxDiscountPercent}%.`;
    }
  } else if (buyerRequestedUnitPrice !== undefined && buyerOffer !== undefined) {
    if (buyerRequestedUnitPrice < minimumAllowedUnitPrice) {
      accepted = false;
      reason = `Buyer price of ₹${buyerRequestedUnitPrice} is below the minimum allowed price of ₹${minimumAllowedUnitPrice}.`;
    }
  }

  // Rule C: Order Value Limits
  if (accepted && buyerRequestedOrderValue !== undefined) {
    if (buyerRequestedOrderValue < policy.minOrderValue) {
      accepted = false;
      reason = `Order value is below the merchant's minimum order value of ₹${policy.minOrderValue}.`;
    } else if (buyerRequestedOrderValue > policy.maxOrderValue) {
      accepted = false;
      reason = `Order value exceeds the merchant's maximum order value of ₹${policy.maxOrderValue}.`;
    }
  }

  // 9. Financial Metrics for Output (using final effective transaction price)
  const finalUnitPrice = accepted && buyerRequestedUnitPrice !== undefined
    ? buyerRequestedUnitPrice
    : recommendedCounterOfferUnitPrice;

  const discountAmount = roundMoney(baseOrderValue - roundMoney(finalUnitPrice * quantity));
  const estimatedProfit = roundMoney((finalUnitPrice - product.costPrice) * quantity);
  const estimatedMarginPercent = finalUnitPrice > 0
    ? roundPercent(((finalUnitPrice - product.costPrice) / finalUnitPrice) * 100)
    : 0;

  return {
    accepted,
    reason,
    baseUnitPrice,
    quantity,
    baseOrderValue,
    buyerRequestedDiscountPercent,
    buyerRequestedUnitPrice,
    buyerRequestedOrderValue,
    policyMaxDiscountPercent: policy.maxDiscountPercent,
    marginBasedMaxDiscountPercent,
    effectiveMaxDiscountPercent,
    minimumSafeUnitPrice,
    minimumAllowedUnitPrice,
    recommendedCounterOfferUnitPrice,
    recommendedOrderValue,
    discountAmount,
    estimatedProfit,
    estimatedMarginPercent,
  };
};
