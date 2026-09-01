import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import Merchant, { type IMerchant } from "../../models/Merchant.js";
import Product, { type IProduct } from "../../models/Product.js";
import Policy, { type IPolicy } from "../../models/Policy.js";
import Negotiation from "../../models/Negotiation.js";
import Agreement from "../../models/Agreement.js";
import Approval from "../../models/Approval.js";
import AuditEvent from "../../models/AuditEvent.js";
import {
  startNegotiation,
  submitBuyerOffer,
  acceptNegotiation as acceptNeg,
  rejectNegotiation as rejectNeg,
  AppCustomError,
} from "../negotiationService.js";
import {
  createAgreementFromNegotiation,
  approveAgreement,
  rejectAgreement,
  getAgreementById,
  getAgreementExplanation,
  isPaymentReady,
} from "../agreementService.js";
import { getAuditEventsForAgreement } from "../auditService.js";

describe("Agreement, Approval & Audit Trail Service Tests", () => {
  let merchant: IMerchant;
  let product: IProduct;
  let policy: IPolicy;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    const merchants = await Merchant.find({ email: /test-agr-.*@example\.com/ }).select("_id");
    const mIds = merchants.map((m) => m._id);
    await Negotiation.deleteMany({ merchantId: { $in: mIds } });
    await Agreement.deleteMany({ merchantId: { $in: mIds } });
    await Approval.deleteMany({ merchantId: { $in: mIds } });
    await AuditEvent.deleteMany({ merchantId: { $in: mIds } });
    await Policy.deleteMany({ name: /Test Agr Policy.*/ });
    await Product.deleteMany({ sku: /SKU-AGR-.*/ });
    await Merchant.deleteMany({ email: /test-agr-.*@example\.com/ });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    const timestamp = Date.now() + "-" + Math.floor(Math.random() * 10000);

    merchant = await Merchant.create({
      name: "Agr Merchant",
      businessName: "Agr Business",
      email: `test-agr-${timestamp}@example.com`,
      currency: "INR",
      status: "active",
      agentEnabled: true,
    });

    product = await Product.create({
      merchantId: merchant._id,
      name: "Agr Test Chair",
      description: "Ergonomic chair",
      category: "Furniture",
      sku: `SKU-AGR-${timestamp}`,
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
      name: `Test Agr Policy ${timestamp}`,
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

  test("TEST 1: Create agreement from accepted negotiation", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 4, // 4 * 9000 = 36000 <= 50000 auto approval limit
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 9000);
    await acceptNeg(neg._id.toString());

    const agreement = await createAgreementFromNegotiation(neg._id.toString());

    assert.equal(agreement.status, "APPROVED"); // Auto-approved
    assert.equal(agreement.agreedUnitPrice, 9000);
    assert.equal(agreement.quantity, 4);
    assert.equal(agreement.finalOrderValue, 36000);
  });

  test("TEST 2: Cannot create agreement from active negotiation", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 4,
      currency: "INR",
    });

    await assert.rejects(
      async () => createAgreementFromNegotiation(neg._id.toString()),
      (err: any) => err instanceof AppCustomError && err.code === "NEGOTIATION_NOT_ACCEPTED"
    );
  });

  test("TEST 3: Cannot create agreement from rejected negotiation", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 4,
      currency: "INR",
    });

    await rejectNeg(neg._id.toString());

    await assert.rejects(
      async () => createAgreementFromNegotiation(neg._id.toString()),
      (err: any) => err instanceof AppCustomError && err.code === "NEGOTIATION_NOT_ACCEPTED"
    );
  });

  test("TEST 4 & 5: Final price and policy revalidated through Economic and Policy Engine", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 4,
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 9000);
    await acceptNeg(neg._id.toString());

    // Now modify policy to be stricter (maxDiscountPercent = 5%)
    policy.maxDiscountPercent = 5;
    await policy.save();

    await assert.rejects(
      async () => createAgreementFromNegotiation(neg._id.toString()),
      (err: any) => err instanceof AppCustomError && err.code === "POLICY_VALIDATION_FAILED"
    );
  });

  test("TEST 6: Agreement automatically approved under auto approval limit", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 4, // Order value 36000 <= auto approval limit 50000
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 9000);
    await acceptNeg(neg._id.toString());
    const agr = await createAgreementFromNegotiation(neg._id.toString());

    assert.equal(agr.status, "APPROVED");
    assert.ok(agr.approvedAt);
  });

  test("TEST 7 & 8: Agreement requires approval above auto approval limit & Approval request created", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10, // Order value 90000 > auto approval limit 50000
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 9000);
    await acceptNeg(neg._id.toString());
    const agr = await createAgreementFromNegotiation(neg._id.toString());

    assert.equal(agr.status, "PENDING_APPROVAL");

    const approval = await Approval.findOne({ agreementId: agr._id });
    assert.ok(approval);
    assert.equal(approval?.status, "PENDING");
  });

  test("TEST 9: Merchant approves pending agreement", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 9000);
    await acceptNeg(neg._id.toString());
    const agr = await createAgreementFromNegotiation(neg._id.toString());

    const result = await approveAgreement(agr._id.toString(), "merchant-admin");

    assert.equal(result.status, "APPROVED");
    assert.equal(result.approvedBy, "merchant-admin");
    assert.equal(result.paymentReady, true);

    const updatedAgr = await Agreement.findById(agr._id);
    assert.equal(updatedAgr?.status, "APPROVED");
  });

  test("TEST 10: Merchant rejects pending agreement", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 9000);
    await acceptNeg(neg._id.toString());
    const agr = await createAgreementFromNegotiation(neg._id.toString());

    const result = await rejectAgreement(
      agr._id.toString(),
      "merchant-admin",
      "Order quantity too high for current stock"
    );

    assert.equal(result.status, "REJECTED");
    assert.equal(result.reviewer, "merchant-admin");
    assert.equal(result.reason, "Order quantity too high for current stock");

    const updatedAgr = await Agreement.findById(agr._id);
    assert.equal(updatedAgr?.status, "REJECTED");
  });

  test("TEST 11: Cannot approve already approved agreement", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 4, // Auto approved
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 9000);
    await acceptNeg(neg._id.toString());
    const agr = await createAgreementFromNegotiation(neg._id.toString());

    await assert.rejects(
      async () => approveAgreement(agr._id.toString(), "merchant-admin"),
      (err: any) => err instanceof AppCustomError && err.code === "AGREEMENT_ALREADY_APPROVED"
    );
  });

  test("TEST 12: Cannot reject already rejected agreement", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 9000);
    await acceptNeg(neg._id.toString());
    const agr = await createAgreementFromNegotiation(neg._id.toString());

    await rejectAgreement(agr._id.toString(), "merchant-admin", "Initial rejection");

    await assert.rejects(
      async () => rejectAgreement(agr._id.toString(), "merchant-admin", "Second rejection"),
      (err: any) => err instanceof AppCustomError && err.code === "AGREEMENT_ALREADY_REJECTED"
    );
  });

  test("TEST 13: Cannot approve agreement with policy violation (Revalidation during approval)", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 9000);
    await acceptNeg(neg._id.toString());
    const agr = await createAgreementFromNegotiation(neg._id.toString()); // Pending approval

    // Merchant changes policy max discount to 5% before approving!
    policy.maxDiscountPercent = 5;
    await policy.save();

    await assert.rejects(
      async () => approveAgreement(agr._id.toString(), "merchant-admin"),
      (err: any) => err instanceof AppCustomError && err.code === "POLICY_VALIDATION_FAILED"
    );
  });

  test("TEST 14 & 15: Payment readiness false before approval & true after approval", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 9000);
    await acceptNeg(neg._id.toString());
    const agr = await createAgreementFromNegotiation(neg._id.toString());

    // Pending approval -> payment ready throws AGREEMENT_NOT_APPROVED
    await assert.rejects(
      async () => isPaymentReady(agr._id.toString()),
      (err: any) => err instanceof AppCustomError && err.code === "AGREEMENT_NOT_APPROVED"
    );

    // After approval
    await approveAgreement(agr._id.toString(), "merchant-admin");
    const statusRes = await isPaymentReady(agr._id.toString());
    assert.equal(statusRes.paymentReady, true);
  });

  test("TEST 16, 17, 18, 19, 20: Audit events created and chronological order verified", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 9000);
    await acceptNeg(neg._id.toString());
    const agr = await createAgreementFromNegotiation(neg._id.toString());
    await approveAgreement(agr._id.toString(), "merchant-admin");

    const auditTrail = await getAuditEventsForAgreement(agr._id.toString());

    assert.ok(auditTrail.length >= 4);

    const eventTypes = auditTrail.map((e) => e.eventType);
    assert.ok(eventTypes.includes("AGREEMENT_CREATED"));
    assert.ok(eventTypes.includes("AGREEMENT_VALIDATED"));
    assert.ok(eventTypes.includes("APPROVAL_REQUESTED"));
    assert.ok(eventTypes.includes("AGREEMENT_APPROVED"));
    assert.ok(eventTypes.includes("PAYMENT_READY"));

    // Verify chronological order
    for (let i = 1; i < auditTrail.length; i++) {
      assert.ok(
        new Date(auditTrail[i].createdAt).getTime() >=
          new Date(auditTrail[i - 1].createdAt).getTime()
      );
    }
  });

  test("TEST 21: Complete End-to-End Service Test Flow (Section 30)", async () => {
    // Step 1 & 2: Product ₹10,000 (Cost ₹7,000), Policy max discount 10%, min margin 20%, auto approval limit 50,000
    // Step 3: Start negotiation
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    // Step 4: Round 1 - Buyer offers ₹8,000 -> Merchant counters ₹9,000
    const step1 = await submitBuyerOffer(neg._id.toString(), 8000);
    assert.equal(step1.decision, "COUNTER_OFFER");
    assert.equal(step1.merchantCounterOffer, 9000);

    // Round 2 - Buyer offers ₹8,500 -> Merchant counters ₹9,000
    const step2 = await submitBuyerOffer(neg._id.toString(), 8500);
    assert.equal(step2.decision, "COUNTER_OFFER");

    // Step 5: Round 3 - Buyer accepts ₹9,000
    const step3 = await submitBuyerOffer(neg._id.toString(), 9000);
    assert.equal(step3.decision, "ACCEPT");
    await acceptNeg(neg._id.toString());

    // Step 6 & 7: Create Agreement
    const agreement = await createAgreementFromNegotiation(neg._id.toString());
    assert.equal(agreement.quantity, 10);
    assert.equal(agreement.agreedUnitPrice, 9000);
    assert.equal(agreement.finalOrderValue, 90000);
    assert.equal(agreement.discountPercent, 10);
    assert.equal(agreement.marginPercent, 22.22);

    // Step 8: Order value 90,000 > 50,000 -> PENDING_APPROVAL
    assert.equal(agreement.status, "PENDING_APPROVAL");

    // Step 9: Merchant approves
    const approvalRes = await approveAgreement(agreement._id.toString(), "merchant-owner");
    assert.equal(approvalRes.status, "APPROVED");

    // Step 10: Payment ready = true
    const pReady = await isPaymentReady(agreement._id.toString());
    assert.equal(pReady.paymentReady, true);

    // Step 11: Structured explanation & audit trail
    const explanation = await getAgreementExplanation(agreement._id.toString());
    assert.equal(explanation.decision, "APPROVED");
    assert.equal(explanation.financials.orderValue, 90000);
    assert.ok(explanation.auditTrail.length > 0);
  });

  test("TEST 22: Graceful Failure Handling (Section 31 - Policy changes before approval)", async () => {
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 10,
      currency: "INR",
    });

    await submitBuyerOffer(neg._id.toString(), 9000);
    await acceptNeg(neg._id.toString());
    const agreement = await createAgreementFromNegotiation(neg._id.toString());

    // Policy change before approval: max discount reduced to 5%
    policy.maxDiscountPercent = 5;
    await policy.save();

    // Merchant attempts to approve -> Revalidation fails gracefully with POLICY_VALIDATION_FAILED
    await assert.rejects(
      async () => approveAgreement(agreement._id.toString(), "merchant-admin"),
      (err: any) => err instanceof AppCustomError && err.code === "POLICY_VALIDATION_FAILED"
    );

    // Verify AGREEMENT_VALIDATION_FAILED audit event was logged
    const events = await getAuditEventsForAgreement(agreement._id.toString());
    assert.ok(events.some((e) => e.eventType === "AGREEMENT_VALIDATION_FAILED"));
  });
});
