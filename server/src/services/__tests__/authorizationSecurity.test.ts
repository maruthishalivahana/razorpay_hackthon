import test, { describe } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import { registerMerchant, registerBuyer } from "../authService.js";
import { createProduct, getProductById, updateProduct } from "../productService.js";
import { createPolicy, getPolicyByMerchantId } from "../policyService.js";
import { createAgreementFromNegotiation } from "../agreementService.js";
import { startNegotiation, acceptNegotiation } from "../negotiationService.js";
import { createConversation, getConversation } from "../conversationService.js";
import { requireRole } from "../../middleware/auth.js";

describe("Cross-Tenant Resource Isolation & Authorization Security Tests", () => {
  let ctx: any = null;

  async function getTestContext() {
    if (ctx) return ctx;

    try {
      await connectDB();

      const timestamp = Date.now();

      const merchantA = await registerMerchant({
        name: "Merchant Owner A",
        businessName: "Store A",
        email: `merchant_a_${timestamp}@example.com`,
        password: "password123",
      });

      const merchantB = await registerMerchant({
        name: "Merchant Owner B",
        businessName: "Store B",
        email: `merchant_b_${timestamp}@example.com`,
        password: "password123",
      });

      const buyerA = await registerBuyer({
        name: "Buyer Customer A",
        email: `buyer_a_${timestamp}@example.com`,
        password: "password123",
      });

      const buyerB = await registerBuyer({
        name: "Buyer Customer B",
        email: `buyer_b_${timestamp}@example.com`,
        password: "password123",
      });

      const productA = await createProduct({
        merchantId: merchantA.user.merchantId,
        sku: `SKU-A-${timestamp}`,
        name: "Product Store A",
        description: "Item from Store A",
        category: "Electronics",
        price: 5000,
        costPrice: 3000,
        inventory: 10,
        minPrice: 4000,
      });

      const productB = await createProduct({
        merchantId: merchantB.user.merchantId,
        sku: `SKU-B-${timestamp}`,
        name: "Product Store B",
        description: "Item from Store B",
        category: "Furniture",
        price: 12000,
        costPrice: 8000,
        inventory: 5,
        minPrice: 10000,
      });

      const policyA = await createPolicy({
        merchantId: merchantA.user.merchantId,
        name: "Policy Store A",
        maxDiscountPercent: 15,
        minMarginPercent: 20,
        maxQuantityPerOrder: 5,
        minOrderValue: 1000,
        maxOrderValue: 50000,
        autoApprovalEnabled: true,
        autoApprovalLimit: 20000,
        freeShippingThreshold: 5000,
        maxNegotiationRounds: 3,
        allowedCurrencies: ["INR"],
        isActive: true,
      });

      const policyB = await createPolicy({
        merchantId: merchantB.user.merchantId,
        name: "Policy Store B",
        maxDiscountPercent: 10,
        minMarginPercent: 25,
        maxQuantityPerOrder: 2,
        minOrderValue: 2000,
        maxOrderValue: 100000,
        autoApprovalEnabled: false,
        autoApprovalLimit: 0,
        freeShippingThreshold: 10000,
        maxNegotiationRounds: 5,
        allowedCurrencies: ["INR"],
        isActive: true,
      });

      const negA = await startNegotiation({
        merchantId: merchantA.user.merchantId,
        productId: productA._id.toString(),
        policyId: policyA._id.toString(),
        quantity: 1,
      });
      const acceptedNegA = await acceptNegotiation(negA._id.toString(), 4500);
      const agreementA = await createAgreementFromNegotiation(acceptedNegA._id.toString());

      const negB = await startNegotiation({
        merchantId: merchantB.user.merchantId,
        productId: productB._id.toString(),
        policyId: policyB._id.toString(),
        quantity: 1,
      });
      const acceptedNegB = await acceptNegotiation(negB._id.toString(), 11000);
      const agreementB = await createAgreementFromNegotiation(acceptedNegB._id.toString());

      const conversationA = await createConversation({}, `conv_buyer_a_${timestamp}`);
      conversationA.buyerId = new mongoose.Types.ObjectId(buyerA.user.buyerId);
      await conversationA.save();

      const conversationB = await createConversation({}, `conv_buyer_b_${timestamp}`);
      conversationB.buyerId = new mongoose.Types.ObjectId(buyerB.user.buyerId);
      await conversationB.save();

      ctx = {
        merchantA,
        merchantB,
        buyerA,
        buyerB,
        productA,
        productB,
        policyA,
        policyB,
        agreementA,
        agreementB,
        conversationA,
        conversationB,
      };

      return ctx;
    } catch (err) {
      console.error("SETUP ERROR IN getTestContext:", err);
      throw err;
    }
  }

  test("1. Merchant A can access Product A, but cannot access Product B (Cross-merchant product isolation)", async () => {
    const c = await getTestContext();
    assert.equal(c.productA.merchantId.toString(), c.merchantA.user.merchantId);
    assert.equal(c.productB.merchantId.toString(), c.merchantB.user.merchantId);

    const loadedA = await getProductById(c.productA._id.toString());
    const loadedAMerchantId =
      typeof loadedA.merchantId === "object" && loadedA.merchantId !== null
        ? loadedA.merchantId._id?.toString?.() ?? loadedA.merchantId.toString()
        : loadedA.merchantId.toString();

    assert.equal(loadedAMerchantId, c.merchantA.user.merchantId);
    assert.notEqual(c.productB.merchantId.toString(), c.merchantA.user.merchantId);
  });

  test("2. Product updates cannot change merchant ownership even if payload tries to override merchantId", async () => {
    const c = await getTestContext();

    const updated = await updateProduct(c.productA._id.toString(), {
      merchantId: c.merchantB.user.merchantId,
      name: "HACKED PRODUCT NAME",
    } as any);

    assert.equal(updated.merchantId.toString(), c.merchantA.user.merchantId);
    assert.equal(updated.name, "HACKED PRODUCT NAME");
  });

  test("3. Merchant A policy is distinct from Merchant B policy (Cross-merchant policy isolation)", async () => {
    const c = await getTestContext();
    const fetchedPolicyA = await getPolicyByMerchantId(c.merchantA.user.merchantId);
    const fetchedPolicyB = await getPolicyByMerchantId(c.merchantB.user.merchantId);

    assert.equal(fetchedPolicyA.merchantId.toString(), c.merchantA.user.merchantId);
    assert.equal(fetchedPolicyB.merchantId.toString(), c.merchantB.user.merchantId);
    assert.notEqual(fetchedPolicyA.merchantId.toString(), c.merchantB.user.merchantId);
  });

  test("3. Agreement A belongs to Merchant A, Agreement B belongs to Merchant B (Cross-merchant agreement isolation)", async () => {
    const c = await getTestContext();
    assert.equal(c.agreementA.merchantId.toString(), c.merchantA.user.merchantId);
    assert.equal(c.agreementB.merchantId.toString(), c.merchantB.user.merchantId);
    assert.notEqual(c.agreementB.merchantId.toString(), c.merchantA.user.merchantId);
  });

  test("4. Conversation A belongs to Buyer A, Conversation B belongs to Buyer B (Cross-buyer conversation isolation)", async () => {
    const c = await getTestContext();
    const convADoc = await getConversation(c.conversationA.conversationId);
    const convBDoc = await getConversation(c.conversationB.conversationId);

    assert.equal(convADoc?.buyerId?.toString(), c.buyerA.user.buyerId);
    assert.equal(convBDoc?.buyerId?.toString(), c.buyerB.user.buyerId);
    assert.notEqual(convBDoc?.buyerId?.toString(), c.buyerA.user.buyerId);
  });

  test("5. Role middleware rejects non-matching roles with 403 Forbidden", async () => {
    const checkMerchantRole = requireRole("MERCHANT");
    const fakeBuyerReq: any = { user: { role: "BUYER" } };
    let capturedError: any = null;

    checkMerchantRole(fakeBuyerReq, {} as any, (err?: any) => {
      capturedError = err;
    });

    assert.ok(capturedError);
    assert.equal(capturedError.statusCode, 403);
    assert.equal(capturedError.code, "FORBIDDEN");
  });
});
