import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calculateEconomicOffer,
  EconomicEngineValidationError,
  type ProductInput,
  type PolicyInput,
} from "../economicEngine.js";

describe("Economic Engine Service Tests", () => {
  const defaultProduct: ProductInput = {
    price: 10000,
    costPrice: 7000,
  };

  const defaultPolicy: PolicyInput = {
    maxDiscountPercent: 10,
    minMarginPercent: 20,
    maxQuantityPerOrder: 50,
    minOrderValue: 0,
    maxOrderValue: 100000,
  };

  test("TEST 1: Normal accepted buyer discount", () => {
    const result = calculateEconomicOffer({
      product: defaultProduct,
      policy: defaultPolicy,
      quantity: 10,
      buyerDiscountPercent: 5,
    });

    assert.equal(result.accepted, true);
    assert.equal(result.buyerRequestedDiscountPercent, 5);
    assert.equal(result.buyerRequestedUnitPrice, 9500);
    assert.equal(result.buyerRequestedOrderValue, 95000);
    assert.equal(result.estimatedProfit, 25000);
    assert.equal(result.estimatedMarginPercent, 26.32);
  });

  test("TEST 2: Buyer requests discount above policy maximum", () => {
    const result = calculateEconomicOffer({
      product: defaultProduct,
      policy: defaultPolicy,
      quantity: 10,
      buyerDiscountPercent: 15,
    });

    assert.equal(result.accepted, false);
    assert.equal(result.effectiveMaxDiscountPercent, 10);
    assert.equal(result.recommendedCounterOfferUnitPrice, 9000);
    assert.equal(result.recommendedOrderValue, 90000);
    assert.equal(result.estimatedProfit, 20000);
    assert.equal(result.estimatedMarginPercent, 22.22);
    assert.ok(result.reason.includes("exceeds the merchant's maximum allowed discount"));
  });

  test("TEST 3: Buyer price below minimum margin price", () => {
    const highCostProduct: ProductInput = {
      price: 10000,
      costPrice: 8500,
    };
    const policy: PolicyInput = {
      ...defaultPolicy,
      maxDiscountPercent: 20,
      minMarginPercent: 20, // Requires min price = 8500 / 0.8 = 10625 (above base price!)
      maxOrderValue: 200000,
    };

    const result = calculateEconomicOffer({
      product: highCostProduct,
      policy,
      quantity: 10,
      buyerDiscountPercent: 5,
    });

    assert.equal(result.accepted, false);
    assert.equal(result.marginBasedMaxDiscountPercent, 0);
    assert.equal(result.effectiveMaxDiscountPercent, 0);
    assert.equal(result.recommendedCounterOfferUnitPrice, 10000);
  });

  test("TEST 4: Margin calculation verification", () => {
    const result = calculateEconomicOffer({
      product: defaultProduct,
      policy: defaultPolicy,
      quantity: 1,
      buyerDiscountPercent: 10, // Selling at 9000, Cost 7000
    });

    // Profit = 2000, Margin = (2000 / 9000) * 100 = 22.22%
    assert.equal(result.estimatedProfit, 2000);
    assert.equal(result.estimatedMarginPercent, 22.22);
  });

  test("TEST 5: Policy max discount vs margin-based discount comparison", () => {
    // Case A: Margin allows 12.5%, Policy caps at 10% -> Effective = 10%
    const resA = calculateEconomicOffer({
      product: { price: 10000, costPrice: 7000 },
      policy: { ...defaultPolicy, maxDiscountPercent: 10, minMarginPercent: 20 },
      quantity: 1,
    });
    assert.equal(resA.marginBasedMaxDiscountPercent, 12.5);
    assert.equal(resA.effectiveMaxDiscountPercent, 10);

    // Case B: Margin allows 5%, Policy allows 10% -> Effective = 5%
    const resB = calculateEconomicOffer({
      product: { price: 10000, costPrice: 7600 }, // min safe price = 7600/0.8 = 9500 -> 5% discount max
      policy: { ...defaultPolicy, maxDiscountPercent: 10, minMarginPercent: 20 },
      quantity: 1,
    });
    assert.equal(resB.marginBasedMaxDiscountPercent, 5);
    assert.equal(resB.effectiveMaxDiscountPercent, 5);
  });

  test("TEST 6: Quantity exceeds policy maximum", () => {
    const result = calculateEconomicOffer({
      product: defaultProduct,
      policy: defaultPolicy,
      quantity: 75,
      buyerDiscountPercent: 5,
    });

    assert.equal(result.accepted, false);
    assert.ok(result.reason.includes("exceeds the merchant's maximum quantity"));
  });

  test("TEST 7: Order value exceeds policy maximum", () => {
    const policy: PolicyInput = {
      ...defaultPolicy,
      maxOrderValue: 50000,
    };

    const result = calculateEconomicOffer({
      product: defaultProduct,
      policy,
      quantity: 10, // Base order value = 100,000, requested at 5% = 95,000 > 50,000
      buyerDiscountPercent: 5,
    });

    assert.equal(result.accepted, false);
    assert.ok(result.reason.includes("exceeds the merchant's maximum order value"));
  });

  test("TEST 8: Order value below policy minimum", () => {
    const policy: PolicyInput = {
      ...defaultPolicy,
      minOrderValue: 20000,
    };

    const result = calculateEconomicOffer({
      product: defaultProduct,
      policy,
      quantity: 1, // Order value = 9,500 < 20,000
      buyerDiscountPercent: 5,
    });

    assert.equal(result.accepted, false);
    assert.ok(result.reason.includes("is below the merchant's minimum order value"));
  });

  test("TEST 9: Invalid quantity", () => {
    assert.throws(
      () =>
        calculateEconomicOffer({
          product: defaultProduct,
          policy: defaultPolicy,
          quantity: 0,
        }),
      EconomicEngineValidationError
    );

    assert.throws(
      () =>
        calculateEconomicOffer({
          product: defaultProduct,
          policy: defaultPolicy,
          quantity: -5,
        }),
      EconomicEngineValidationError
    );
  });

  test("TEST 10: Invalid product price", () => {
    assert.throws(
      () =>
        calculateEconomicOffer({
          product: { price: 0, costPrice: 100 },
          policy: defaultPolicy,
          quantity: 1,
        }),
      EconomicEngineValidationError
    );
  });

  test("TEST 11: Cost price greater than or equal to selling price", () => {
    assert.throws(
      () =>
        calculateEconomicOffer({
          product: { price: 5000, costPrice: 6000 },
          policy: defaultPolicy,
          quantity: 1,
        }),
      EconomicEngineValidationError
    );
  });

  test("TEST 12: Buyer price offer is accepted", () => {
    const result = calculateEconomicOffer({
      product: defaultProduct,
      policy: defaultPolicy,
      quantity: 5,
      buyerOffer: 9200,
    });

    assert.equal(result.accepted, true);
    assert.equal(result.buyerRequestedUnitPrice, 9200);
    assert.equal(result.buyerRequestedOrderValue, 46000);
  });

  test("TEST 13: Buyer price offer is rejected", () => {
    const result = calculateEconomicOffer({
      product: defaultProduct,
      policy: defaultPolicy,
      quantity: 5,
      buyerOffer: 8500,
    });

    assert.equal(result.accepted, false);
    assert.equal(result.recommendedCounterOfferUnitPrice, 9000);
    assert.ok(result.reason.includes("is below the minimum allowed price"));
  });

  test("TEST 14: Minimum margin of 100% is rejected safely", () => {
    assert.throws(
      () =>
        calculateEconomicOffer({
          product: defaultProduct,
          policy: { ...defaultPolicy, minMarginPercent: 100 },
          quantity: 1,
        }),
      EconomicEngineValidationError
    );
  });
});
