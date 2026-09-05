import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import Merchant, { type IMerchant } from "../../models/Merchant.js";
import Product, { type IProduct } from "../../models/Product.js";
import Policy, { type IPolicy } from "../../models/Policy.js";
import Negotiation from "../../models/Negotiation.js";
import {
  startNegotiation,
  submitBuyerOffer,
  acceptNegotiation,
  rejectNegotiation,
  getNegotiationById,
  AppCustomError,
} from "../negotiationService.js";
import { createAgreementFromNegotiation } from "../agreementService.js";

describe("Negotiation Engine Service Tests", () => {
  let merchant: IMerchant;
  let product: IProduct;
  let policy: IPolicy;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    const merchants = await Merchant.find({ email: /test-neg-.*@example\.com/ }).select("_id");
    const mIds = merchants.map((m) => m._id);
    await Negotiation.deleteMany({ merchantId: { $in: mIds } });
    await Policy.deleteMany({ name: /Test Neg Policy.*/ });
    await Product.deleteMany({ sku: /SKU-NEG-.*/ });
    await Merchant.deleteMany({ email: /test-neg-.*@example\.com/ });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Create fresh test fixtures for each test
    const timestamp = Date.now() + "-" + Math.floor(Math.random() * 10000);

    merchant = await Merchant.create({
      name: "Test Merchant",
      businessName: "Test Merchant Business",
      email: `test-neg-${timestamp}@example.com`,
      currency: "INR",
      status: "active",
      agentEnabled: true,
    });

    product = await Product.create({
      merchantId: merchant._id,
      name: "Test Negotiation Chair",
      description: "Ergonomic test chair",
      category: "Furniture",
      sku: `SKU-NEG-${timestamp}`,
      price: 10000,
      costPrice: 7000,
      currency: "INR",
      inventory: 100,
      lowStockThreshold: 10,
      deliveryDays: 3,
      isNegotiable: true,
    });

    policy = await Policy.create({
      merchantId: merchant._id,
      name: `Test Neg Policy ${timestamp}`,
      isActive: true,
      negotiationEnabled: true,
      maxDiscountPercent: 10,
      minMarginPercent: 20,
      maxQuantityPerOrder: 50,
      minOrderValue: 5000,
      maxOrderValue: 100000,
      autoApprovalEnabled: true,
      autoApprovalLimit: 50000,
      maxNegotiationRounds: 3,
      allowedCurrencies: ["INR"],
    });
  });

  test("TEST 1: Start valid negotiation", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    assert.equal(neg.status, "ACTIVE");
    assert.equal(neg.currentRound, 1);
    assert.equal(neg.maxRounds, 3);
    assert.equal(neg.originalUnitPrice, 10000);
    assert.equal(neg.quantity, 10);
    assert.equal(neg.currency, "INR");
  });

  test("TEST 2: Invalid merchant ID", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await assert.rejects(
      async () =>
        startNegotiation({
          merchantId: fakeId,
          productId: product._id.toString(),
          policyId: policy._id.toString(),
          quantity: 10,
          currency: "INR",
        }),
      (err: any) => err instanceof AppCustomError && err.code === "INVALID_MERCHANT"
    );
  });

  test("TEST 3: Invalid product ID", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await assert.rejects(
      async () =>
        startNegotiation({
          merchantId: merchant._id.toString(),
          productId: fakeId,
          policyId: policy._id.toString(),
          quantity: 10,
          currency: "INR",
        }),
      (err: any) => err instanceof AppCustomError && err.code === "INVALID_PRODUCT"
    );
  });

  test("TEST 4: Invalid policy ID", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await assert.rejects(
      async () =>
        startNegotiation({
          merchantId: merchant._id.toString(),
          productId: product._id.toString(),
          policyId: fakeId,
          quantity: 10,
          currency: "INR",
        }),
      (err: any) => err instanceof AppCustomError && err.code === "INVALID_POLICY"
    );
  });

  test("TEST 5: Quantity exceeds policy", async () => {
    await assert.rejects(
      async () =>
        startNegotiation({
          merchantId: merchant._id.toString(),
          productId: product._id.toString(),
          policyId: policy._id.toString(),
          quantity: 75, // Policy max is 50
          currency: "INR",
        }),
      (err: any) => err instanceof AppCustomError && err.code === "POLICY_VIOLATION"
    );
  });

  test("TEST 6: Currency not allowed", async () => {
    await assert.rejects(
      async () =>
        startNegotiation({
          merchantId: merchant._id.toString(),
          productId: product._id.toString(),
          policyId: policy._id.toString(),
          quantity: 10,
          currency: "EUR",
        }),
      (err: any) => err instanceof AppCustomError && err.code === "POLICY_VIOLATION"
    );
  });

  test("TEST 7: Negotiation disabled", async () => {
    policy.negotiationEnabled = false;
    await policy.save();

    await assert.rejects(
      async () =>
        startNegotiation({
          merchantId: merchant._id.toString(),
          productId: product._id.toString(),
          policyId: policy._id.toString(),
          quantity: 10,
          currency: "INR",
        }),
      (err: any) => err instanceof AppCustomError && err.code === "NEGOTIATION_DISABLED"
    );
  });

  test("TEST 8: Valid buyer offer accepted", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 5,
      currency: "INR",
    });

    const res = await submitBuyerOffer(neg._id.toString(), 9200);

    assert.equal(res.decision, "ACCEPT");
    assert.equal(res.status, "ACTIVE");
    const accepted = await acceptNegotiation(neg._id.toString());
    assert.equal(accepted.status, "ACCEPTED");
    assert.equal(accepted.acceptedPrice, 9200);
    assert.equal(accepted.finalOrderValue, 46000);
  });

  test("TEST 9: Buyer offer rejected and counter-offer generated", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    const res = await submitBuyerOffer(neg._id.toString(), 8500);

    assert.equal(res.decision, "COUNTER_OFFER");
    assert.equal(res.status, "ACTIVE");
    assert.equal(res.buyerOffer, 8500);
    assert.equal(res.merchantCounterOffer, 9000);
    assert.equal(res.round, 1);
    assert.equal(res.remainingRounds, 2);
  });

  test("TEST 10: Counter-offer comes from Economic Engine", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    const res = await submitBuyerOffer(neg._id.toString(), 8000);
    // Product price 10000, Policy max discount 10% -> Counter-offer = 9000
    assert.equal(res.merchantCounterOffer, 9000);
  });

  test("TEST 11: Policy Engine validates counter-offer", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    const res = await submitBuyerOffer(neg._id.toString(), 8000);
    assert.equal(res.discountPercent, 10); // 10% discount on 9000 counter offer
    assert.equal(res.marginPercent, 22.22); // (9000 - 7000) / 9000 * 100 = 22.22%
  });

  test("TEST 12: Round increments correctly", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 8000);
    const updated = await Negotiation.findById(neg._id);
    assert.equal(updated?.currentRound, 2);
  });

  test("TEST 13: Remaining rounds calculated correctly", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    const res1 = await submitBuyerOffer(neg._id.toString(), 8000);
    assert.equal(res1.remainingRounds, 2);

    const res2 = await submitBuyerOffer(neg._id.toString(), 8500);
    assert.equal(res2.remainingRounds, 1);
  });

  test("TEST 14: Maximum rounds reached & TEST 15: Negotiation expires", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 8000); // Round 1
    await submitBuyerOffer(neg._id.toString(), 8500); // Round 2
    const res3 = await submitBuyerOffer(neg._id.toString(), 8700); // Round 3 (Max)

    assert.equal(res3.decision, "EXPIRED");
    assert.equal(res3.status, "EXPIRED");
    assert.equal(res3.remainingRounds, 0);
  });

  test("TEST 16: Offer after expiration rejected", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 8000);
    await submitBuyerOffer(neg._id.toString(), 8500);
    await submitBuyerOffer(neg._id.toString(), 8700); // Expired

    await assert.rejects(
      async () => submitBuyerOffer(neg._id.toString(), 8900),
      (err: any) => err instanceof AppCustomError && err.code === "NEGOTIATION_NOT_ACTIVE"
    );
  });

  test("TEST 17: Offer after acceptance rejected", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 5,
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 9500); // Accepted
    await acceptNegotiation(neg._id.toString());

    await assert.rejects(
      async () => submitBuyerOffer(neg._id.toString(), 9000),
      (err: any) => err instanceof AppCustomError && err.code === "NEGOTIATION_NOT_ACTIVE"
    );
  });

  test("TEST 18: Offer after rejection rejected", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 5,
      currency: "INR",
    });

    await rejectNegotiation(neg._id.toString());

    await assert.rejects(
      async () => submitBuyerOffer(neg._id.toString(), 9500),
      (err: any) => err instanceof AppCustomError && err.code === "NEGOTIATION_NOT_ACTIVE"
    );
  });

  test("TEST 19: Multiple buyer offers preserved in history & TEST 20: Merchant counter-offers preserved", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 8000);
    await submitBuyerOffer(neg._id.toString(), 8500);

    const doc = await Negotiation.findById(neg._id);
    assert.equal(doc?.history.length, 4); // 2 buyer offers + 2 merchant counter offers
    assert.equal(doc?.history[0].actor, "BUYER");
    assert.equal(doc?.history[0].offer, 8000);
    assert.equal(doc?.history[1].actor, "MERCHANT");
    assert.equal(doc?.history[1].offer, 9000);
    assert.equal(doc?.history[2].actor, "BUYER");
    assert.equal(doc?.history[2].offer, 8500);
    assert.equal(doc?.history[3].actor, "MERCHANT");
    assert.equal(doc?.history[3].offer, 9000);
  });

  test("TEST 21: Final accepted price stored & TEST 22: Final order value calculated correctly", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    const updated = await acceptNegotiation(neg._id.toString(), 9000);

    assert.equal(updated.status, "ACCEPTED");
    assert.equal(updated.acceptedPrice, 9000);
    assert.equal(updated.finalOrderValue, 90000);
  });

  test("TEST 23: Invalid buyer offer rejected", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    await assert.rejects(
      async () => submitBuyerOffer(neg._id.toString(), -500),
      (err: any) => err instanceof AppCustomError && err.code === "INVALID_OFFER"
    );
  });

  test("TEST 24: Final price revalidated before acceptance", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    // Attempting to accept at ₹7,000 (which violates minimum margin / policy discount)
    await assert.rejects(
      async () => acceptNegotiation(neg._id.toString(), 7000),
      (err: any) => err instanceof AppCustomError && err.code === "POLICY_VIOLATION"
    );
  });

  test("TEST 25 & 26: Complete negotiation lifecycle integration test", async () => {
    // Product: ₹10,000, Cost: ₹7,000, Quantity: 10
    // Policy: max discount = 10%, min margin = 20%, max rounds = 3
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    // Round 1: Buyer offers ₹8,000
    const step1 = await submitBuyerOffer(neg._id.toString(), 8000);
    assert.equal(step1.decision, "COUNTER_OFFER");
    assert.equal(step1.merchantCounterOffer, 9000);
    assert.equal(step1.round, 1);
    assert.equal(step1.remainingRounds, 2);

    // Round 2: Buyer offers ₹8,500
    const step2 = await submitBuyerOffer(neg._id.toString(), 8500);
    assert.equal(step2.decision, "COUNTER_OFFER");
    assert.equal(step2.merchantCounterOffer, 9000);
    assert.equal(step2.round, 2);
    assert.equal(step2.remainingRounds, 1);

    // Round 3: Buyer offers ₹9,000 (Matches merchant counter-offer)
    const step3 = await submitBuyerOffer(neg._id.toString(), 9000);
    assert.equal(step3.decision, "ACCEPT");
    assert.equal(step3.status, "ACTIVE");

    const accepted = await acceptNegotiation(neg._id.toString());
    assert.equal(accepted.status, "ACCEPTED");
    assert.equal(accepted.acceptedPrice, 9000);
    assert.equal(accepted.finalOrderValue, 90000);

    // Check saved state in DB
    const finalDoc = await getNegotiationById(neg._id.toString());
    assert.equal(finalDoc.status, "ACCEPTED");
    assert.equal(finalDoc.acceptedPrice, 9000);
    assert.equal(finalDoc.finalOrderValue, 90000);
  });

  test("TEST 27: Updated merchant policy is used for an existing negotiation", async () => {
    await Product.findByIdAndUpdate(product._id, {
      price: 42999,
      costPrice: 35000,
    });

    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 1,
      currency: "INR",
    });

    await Policy.findByIdAndUpdate(policy._id, {
      maxDiscountPercent: 20,
      minMarginPercent: 1,
      autoApprovalLimit: 50000,
    });

    const requestedPrice = 36549.15;
    const offer = await submitBuyerOffer(neg._id.toString(), requestedPrice);

    assert.equal(offer.decision, "ACCEPT");
    assert.equal(offer.discountPercent, 15);
    assert.equal(offer.marginPercent, 4.24);

    const accepted = await acceptNegotiation(neg._id.toString());
    const agreement = await createAgreementFromNegotiation(accepted._id.toString());

    assert.equal(agreement.status, "APPROVED");
    assert.equal(agreement.finalOrderValue, 36549.15);
    assert.equal(agreement.discountPercent, 15);
    assert.equal(agreement.marginPercent, 4.24);
  });
});
