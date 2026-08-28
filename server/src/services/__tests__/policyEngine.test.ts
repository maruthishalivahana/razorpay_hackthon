import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePolicy,
  PolicyEngineValidationError,
  type ProductPolicyInput,
  type PolicyInput,
} from "../policyEngine.js";

describe("Policy Engine Service Tests", () => {
  const defaultProduct: ProductPolicyInput = {
    price: 10000,
    costPrice: 7000,
  };

  const defaultPolicy: PolicyInput = {
    isActive: true,
    negotiationEnabled: true,
    maxDiscountPercent: 10,
    minMarginPercent: 20,
    maxQuantityPerOrder: 50,
    minOrderValue: 5000,
    maxOrderValue: 100000,
    autoApprovalEnabled: true,
    autoApprovalLimit: 50000,
    freeShippingThreshold: 5000,
    maxNegotiationRounds: 3,
    allowedCurrencies: ["INR"],
  };

  test("TEST 1: Valid transaction -> ALLOW", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 3,
      unitPrice: 9500,
      orderValue: 28500,
      discountPercent: 5,
      currency: "INR",
    });

    assert.equal(result.decision, "ALLOW");
    assert.equal(result.allowed, true);
    assert.equal(result.approvalRequired, false);
    assert.equal(result.violations.length, 0);
  });

  test("TEST 2: Inactive policy -> REJECT", () => {
    const result = evaluatePolicy({
      policy: { ...defaultPolicy, isActive: false },
      product: defaultProduct,
      quantity: 3,
      unitPrice: 9500,
      currency: "INR",
    });

    assert.equal(result.decision, "REJECT");
    assert.equal(result.allowed, false);
    assert.ok(result.violations.includes("Merchant policy is inactive."));
  });

  test("TEST 3: Discount within limit -> ALLOW", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 2,
      unitPrice: 9200, // 8% discount
      discountPercent: 8,
      currency: "INR",
    });

    assert.equal(result.decision, "ALLOW");
    assert.equal(result.checks.discountAllowed, true);
  });

  test("TEST 4: Discount exactly at maximum -> ALLOW", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 2,
      unitPrice: 9000, // exactly 10% discount
      discountPercent: 10,
      currency: "INR",
    });

    assert.equal(result.decision, "ALLOW");
    assert.equal(result.checks.discountAllowed, true);
  });

  test("TEST 5: Discount exceeds maximum -> REJECT", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 2,
      unitPrice: 8500, // 15% discount
      discountPercent: 15,
      currency: "INR",
    });

    assert.equal(result.decision, "REJECT");
    assert.equal(result.checks.discountAllowed, false);
    assert.ok(
      result.violations.some((v) => v.includes("exceeds merchant policy limit of 10%"))
    );
  });

  test("TEST 6: Quantity within limit -> ALLOW", () => {
    const lowPriceResult = evaluatePolicy({
      policy: { ...defaultPolicy, maxOrderValue: 500000 },
      product: defaultProduct,
      quantity: 40,
      unitPrice: 9500,
      currency: "INR",
    });

    assert.equal(lowPriceResult.checks.quantityAllowed, true);
  });

  test("TEST 7: Quantity exceeds limit -> REJECT", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 75,
      unitPrice: 10000,
      currency: "INR",
    });

    assert.equal(result.decision, "REJECT");
    assert.equal(result.checks.quantityAllowed, false);
    assert.ok(
      result.violations.some((v) => v.includes("Quantity exceeds merchant policy limit of 50"))
    );
  });

  test("TEST 8: Order value within limits -> ALLOW", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 3,
      unitPrice: 10000,
      orderValue: 30000,
      currency: "INR",
    });

    assert.equal(result.decision, "ALLOW");
    assert.equal(result.checks.orderValueAllowed, true);
  });

  test("TEST 9: Order value exceeds maximum -> REJECT", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 20,
      unitPrice: 10000,
      orderValue: 200000,
      currency: "INR",
    });

    assert.equal(result.decision, "REJECT");
    assert.equal(result.checks.orderValueAllowed, false);
    assert.ok(
      result.violations.some((v) => v.includes("exceeds merchant maximum order value"))
    );
  });

  test("TEST 10: Order value below minimum -> REJECT", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 1,
      unitPrice: 3000,
      orderValue: 3000, // min is 5000
      currency: "INR",
    });

    assert.equal(result.decision, "REJECT");
    assert.equal(result.checks.orderValueAllowed, false);
    assert.ok(
      result.violations.some((v) => v.includes("below merchant minimum order value"))
    );
  });

  test("TEST 11: Currency allowed -> ALLOW", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 2,
      unitPrice: 9500,
      currency: "inr", // Case-insensitive
    });

    assert.equal(result.checks.currencyAllowed, true);
    assert.equal(result.evaluatedValues.currency, "INR");
  });

  test("TEST 12: Currency not allowed -> REJECT", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 2,
      unitPrice: 9500,
      currency: "EUR",
    });

    assert.equal(result.decision, "REJECT");
    assert.equal(result.checks.currencyAllowed, false);
    assert.ok(
      result.violations.some((v) => v.includes("Currency EUR is not allowed"))
    );
  });

  test("TEST 13: Margin above minimum -> ALLOW", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct, // cost 7000
      quantity: 2,
      unitPrice: 9000, // margin = (2000/9000)*100 = 22.22% >= min 20%
      currency: "INR",
    });

    assert.equal(result.checks.marginAllowed, true);
    assert.equal(result.evaluatedValues.marginPercent, 22.22);
  });

  test("TEST 14: Margin below minimum -> REJECT", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct, // cost 7000
      quantity: 2,
      unitPrice: 8000, // margin = (1000/8000)*100 = 12.5% < min 20%
      currency: "INR",
    });

    assert.equal(result.decision, "REJECT");
    assert.equal(result.checks.marginAllowed, false);
    assert.ok(
      result.violations.some((v) => v.includes("below the required minimum margin"))
    );
  });

  test("TEST 15: Negotiation enabled -> ALLOW", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 2,
      unitPrice: 9500,
      currency: "INR",
      negotiationRequested: true,
    });

    assert.equal(result.checks.negotiationAllowed, true);
  });

  test("TEST 16: Negotiation disabled -> REJECT", () => {
    const result = evaluatePolicy({
      policy: { ...defaultPolicy, negotiationEnabled: false },
      product: defaultProduct,
      quantity: 2,
      unitPrice: 9500,
      currency: "INR",
      negotiationRequested: true,
    });

    assert.equal(result.decision, "REJECT");
    assert.equal(result.checks.negotiationAllowed, false);
    assert.ok(
      result.violations.includes("Negotiation is disabled for this merchant.")
    );
  });

  test("TEST 17: Order below auto approval limit -> ALLOW", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 3,
      unitPrice: 9500, // orderValue = 28,500 <= limit 50,000
      currency: "INR",
    });

    assert.equal(result.decision, "ALLOW");
    assert.equal(result.allowed, true);
    assert.equal(result.approvalRequired, false);
  });

  test("TEST 18: Order above auto approval limit -> APPROVAL_REQUIRED", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 10,
      unitPrice: 9000, // orderValue = 90,000 > limit 50,000 but <= maxOrderValue 100,000
      currency: "INR",
    });

    assert.equal(result.decision, "APPROVAL_REQUIRED");
    assert.equal(result.allowed, false);
    assert.equal(result.approvalRequired, true);
    assert.equal(result.violations.length, 0);
    assert.ok(
      result.reasons.some((r) => r.includes("exceeds the automatic approval limit"))
    );
  });

  test("TEST 19: Multiple policy violations -> all violations returned", () => {
    const result = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 75, // violation 1: quantity > 50
      unitPrice: 8000, // violation 2: discount 20% > 10%, violation 3: margin 12.5% < 20%
      currency: "EUR", // violation 4: EUR not allowed
      negotiationRequested: true,
    });

    assert.equal(result.decision, "REJECT");
    assert.ok(result.violations.length >= 4);
    assert.ok(result.violations.some((v) => v.includes("Quantity exceeds")));
    assert.ok(result.violations.some((v) => v.includes("Requested discount")));
    assert.ok(result.violations.some((v) => v.includes("below the required minimum margin")));
    assert.ok(result.violations.some((v) => v.includes("Currency EUR")));
  });

  test("TEST 20: Boundary values -> correctly accepted", () => {
    const boundaryResult = evaluatePolicy({
      policy: defaultPolicy,
      product: defaultProduct,
      quantity: 50, // exactly maxQuantityPerOrder
      unitPrice: 9000,
      orderValue: 100000, // exactly maxOrderValue
      discountPercent: 10, // exactly maxDiscountPercent
      currency: "INR",
    });

    assert.equal(boundaryResult.checks.quantityAllowed, true);
    assert.equal(boundaryResult.checks.discountAllowed, true);
    assert.equal(boundaryResult.checks.orderValueAllowed, true);
  });

  test("TEST 21: Validation Error handling for invalid inputs", () => {
    assert.throws(
      () =>
        evaluatePolicy({
          policy: defaultPolicy,
          product: defaultProduct,
          quantity: 0,
          unitPrice: 1000,
          currency: "INR",
        }),
      PolicyEngineValidationError
    );

    assert.throws(
      () =>
        evaluatePolicy({
          policy: defaultPolicy,
          product: defaultProduct,
          quantity: 5,
          unitPrice: -500,
          currency: "INR",
        }),
      PolicyEngineValidationError
    );
  });
});
