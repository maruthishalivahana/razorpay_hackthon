import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import { env } from "../../config/env.js";
import Merchant, { type IMerchant } from "../../models/Merchant.js";
import Product from "../../models/Product.js";
import Policy from "../../models/Policy.js";
import Negotiation from "../../models/Negotiation.js";
import Agreement, { type IAgreement } from "../../models/Agreement.js";
import Payment from "../../models/Payment.js";
import {
  createPaymentOrder,
  verifyPayment,
  getPaymentStatus,
} from "../paymentService.js";
import { updateProduct } from "../productService.js";

describe("Payment Service Unit Tests", () => {
  let merchant: IMerchant;
  let agreement: IAgreement;

  before(async () => {
    await connectDB();
    process.env.RAZORPAY_KEY_ID = "rzp_test_mockKeyId12345";
    process.env.RAZORPAY_KEY_SECRET = "mockSecretKey67890";
  });

  after(async () => {
    await Merchant.deleteMany({ email: /test-payment-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-PAYMENT-.*/ });
    await Policy.deleteMany({ name: "Payment Policy" });
    await Negotiation.deleteMany({ buyerId: "buyer_payment_test" });
    await Agreement.deleteMany({ currency: "INR" });
    await Payment.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Merchant.deleteMany({ email: /test-payment-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-PAYMENT-.*/ });
    await Payment.deleteMany({});
    const timestamp = Date.now() + "-" + Math.floor(Math.random() * 10000);

    merchant = await Merchant.create({
      name: "Payment Merchant",
      businessName: "Payment Corp",
      email: `test-payment-${timestamp}@example.com`,
      currency: "INR",
      status: "active",
    });

    const policy = await Policy.create({
      merchantId: merchant._id,
      name: "Payment Policy",
      minMarginPercent: 10,
      maxDiscountPercent: 30,
      freeShippingThreshold: 15000,
      maxNegotiationRounds: 5,
      autoApproveThreshold: 50000,
      autoApprovalLimit: 50000,
      autoApprovalEnabled: true,
      negotiationEnabled: true,
      isActive: true,
    });

    const product = await Product.create({
      merchantId: merchant._id,
      name: "Smart Monitor 27-inch",
      description: "4K UHD Ergonomic Monitor",
      category: "Electronics",
      sku: `SKU-PAYMENT-1-${timestamp}`,
      price: 25000,
      costPrice: 18000,
      currency: "INR",
      inventory: 10,
      isNegotiable: true,
      status: "active",
    });

    const negotiation = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      buyerId: "buyer_payment_test",
      status: "ACCEPTED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 25000,
      acceptedPrice: 21600,
      round: 1,
      maxRounds: 5,
    });

    agreement = await Agreement.create({
      negotiationId: negotiation._id,
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "APPROVED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 25000,
      agreedUnitPrice: 21600,
      discountPercent: 13.6,
      finalOrderValue: 21600,
      marginPercent: 16.67,
      approvedAt: new Date(),
    });
  });

  test("1. Approved agreement creates/reuses Razorpay payment order with subunit amount authority", async () => {
    const res = await createPaymentOrder(agreement._id.toString());
    assert.equal(res.success, true);
    assert.equal(res.data.keyId, "rzp_test_mockKeyId12345");
    assert.equal(res.data.amount, 2160000); // 21600 * 100 paise
    assert.equal(res.data.currency, "INR");
    assert.equal(res.data.agreementId, agreement._id.toString());
    assert.ok(res.data.orderId);

    // Idempotency: second call returns same order details without duplicating
    const res2 = await createPaymentOrder(agreement._id.toString());
    assert.equal(res2.data.orderId, res.data.orderId);
  });

  test("2. Unapproved agreement is rejected from order creation", async () => {
    agreement.status = "PENDING_APPROVAL";
    await agreement.save();

    await assert.rejects(
      async () => {
        await createPaymentOrder(agreement._id.toString());
      },
      {
        name: "AppCustomError",
        code: "AGREEMENT_NOT_APPROVED",
        statusCode: 400,
      }
    );
  });

  test("3. Valid HMAC signature verification transitions payment to CAPTURED and agreement to COMPLETED", async () => {
    const orderRes = await createPaymentOrder(agreement._id.toString());
    const razorpayOrderId = orderRes.data.orderId;
    const razorpayPaymentId = "pay_mockTestPaymentId123";

    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const validSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest("hex");

    const verifyRes = await verifyPayment({
      agreementId: agreement._id.toString(),
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature: validSignature,
    });

    assert.equal(verifyRes.success, true);
    assert.equal(verifyRes.data.status, "CAPTURED");

    const updatedAgreement = await Agreement.findById(agreement._id);
    assert.equal(updatedAgreement?.status, "COMPLETED");
  });

  test("4. Invalid signature is rejected with 400 and payment status FAILED", async () => {
    const orderRes = await createPaymentOrder(agreement._id.toString());
    const razorpayOrderId = orderRes.data.orderId;
    const razorpayPaymentId = "pay_mockTestPaymentId123";

    await assert.rejects(
      async () => {
        await verifyPayment({
          agreementId: agreement._id.toString(),
          razorpayPaymentId,
          razorpayOrderId,
          razorpaySignature: "invalid_tampered_signature_string",
        });
      },
      {
        name: "AppCustomError",
        code: "INVALID_SIGNATURE",
        statusCode: 400,
      }
    );

    const payment = await Payment.findOne({ agreementId: agreement._id });
    assert.equal(payment?.status, "FAILED");
  });

  test("5. Mismatched razorpay_order_id from browser is rejected", async () => {
    await createPaymentOrder(agreement._id.toString());

    await assert.rejects(
      async () => {
        await verifyPayment({
          agreementId: agreement._id.toString(),
          razorpayPaymentId: "pay_123",
          razorpayOrderId: "order_differentOrder890",
          razorpaySignature: "dummy_sig",
        });
      },
      {
        name: "AppCustomError",
        code: "ORDER_ID_MISMATCH",
        statusCode: 400,
      }
    );
  });

  test("6. Fail-fast error returned when environment credentials are missing", async () => {
    const origId = process.env.RAZORPAY_KEY_ID;
    const origEnvId = env.RAZORPAY_KEY_ID;
    process.env.RAZORPAY_KEY_ID = "";
    (env as any).RAZORPAY_KEY_ID = "";

    await assert.rejects(
      async () => {
        await createPaymentOrder(agreement._id.toString());
      },
      {
        name: "AppCustomError",
        code: "PAYMENT_NOT_CONFIGURED",
      }
    );

    process.env.RAZORPAY_KEY_ID = origId;
    (env as any).RAZORPAY_KEY_ID = origEnvId;
  });

  test("7. Get payment status endpoint returns full backend state", async () => {
    await createPaymentOrder(agreement._id.toString());
    const statusRes = await getPaymentStatus(agreement._id.toString());
    assert.equal(statusRes.agreementId, agreement._id.toString());
    assert.equal(statusRes.amount, 2160000);
    assert.equal(statusRes.status, "RAZORPAY_ORDER_CREATED");
  });

  test("8. Buyer purchases quantity 1: Inventory decrements from 20 to 19 after payment capture", async () => {
    const timestamp = Date.now();
    const product = await Product.create({
      merchantId: merchant._id,
      name: "Apple MacBook Air M3 13-inch",
      description: "MacBook Air M3 with 16GB RAM and 512GB SSD",
      category: "Electronics",
      sku: `SKU-MACBOOK-M3-${timestamp}`,
      price: 114900,
      costPrice: 85000,
      currency: "INR",
      inventory: 20,
      isNegotiable: true,
      status: "active",
    });

    const policy = await Policy.findOne({ merchantId: merchant._id });
    const negotiation = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy!._id,
      buyerId: "buyer_payment_test",
      status: "ACCEPTED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 114900,
      acceptedPrice: 114900,
      round: 1,
      maxRounds: 5,
    });

    const macAgreement = await Agreement.create({
      negotiationId: negotiation._id,
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy!._id,
      status: "APPROVED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 114900,
      agreedUnitPrice: 114900,
      discountPercent: 0,
      finalOrderValue: 114900,
      marginPercent: 26,
      approvedAt: new Date(),
    });

    // Step 1: Pre-purchase order created - stock must still be 20
    const orderRes = await createPaymentOrder(macAgreement._id.toString());
    assert.equal(orderRes.success, true);
    const midCheck = await Product.findById(product._id);
    assert.equal(midCheck?.inventory, 20);

    // Step 2: Payment verified and captured
    const keySecret = process.env.RAZORPAY_KEY_SECRET!;
    const paymentId = `pay_mock_${Date.now()}`;
    const orderId = orderRes.data.orderId;
    const signature = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    const verifyRes = await verifyPayment({
      agreementId: macAgreement._id.toString(),
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      razorpaySignature: signature,
    });

    assert.equal(verifyRes.success, true);
    assert.equal(verifyRes.data.status, "CAPTURED");
    assert.equal(verifyRes.data.product?.inventory, 19);

    // Step 3: MongoDB document inspection - inventory is 19
    const finalProduct = await Product.findById(product._id);
    assert.equal(finalProduct?.inventory, 19);
    assert.equal(finalProduct?.status, "active");
  });

  test("9. Buyer purchases quantity 3: Inventory decrements from 20 to 17", async () => {
    const timestamp = Date.now() + 1;
    const product = await Product.create({
      merchantId: merchant._id,
      name: "Apple MacBook Air M3 13-inch",
      description: "MacBook Air M3 bulk purchase",
      category: "Electronics",
      sku: `SKU-MACBOOK-QTY3-${timestamp}`,
      price: 114900,
      costPrice: 85000,
      currency: "INR",
      inventory: 20,
      isNegotiable: true,
      status: "active",
    });

    const policy = await Policy.findOne({ merchantId: merchant._id });
    const negotiation = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy!._id,
      buyerId: "buyer_payment_test",
      status: "ACCEPTED",
      quantity: 3,
      currency: "INR",
      originalUnitPrice: 114900,
      acceptedPrice: 114900,
      round: 1,
      maxRounds: 5,
    });

    const bulkAgreement = await Agreement.create({
      negotiationId: negotiation._id,
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy!._id,
      status: "APPROVED",
      quantity: 3,
      currency: "INR",
      originalUnitPrice: 114900,
      agreedUnitPrice: 114900,
      discountPercent: 0,
      finalOrderValue: 114900 * 3,
      marginPercent: 26,
      approvedAt: new Date(),
    });

    const orderRes = await createPaymentOrder(bulkAgreement._id.toString());
    const keySecret = process.env.RAZORPAY_KEY_SECRET!;
    const paymentId = `pay_mock_${Date.now()}`;
    const orderId = orderRes.data.orderId;
    const signature = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    const verifyRes = await verifyPayment({
      agreementId: bulkAgreement._id.toString(),
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      razorpaySignature: signature,
    });

    assert.equal(verifyRes.success, true);
    assert.equal(verifyRes.data.product?.inventory, 17);

    const finalProduct = await Product.findById(product._id);
    assert.equal(finalProduct?.inventory, 17);
  });

  test("10. Stock depletion to 0 automatically updates status to out_of_stock", async () => {
    const timestamp = Date.now() + 2;
    const product = await Product.create({
      merchantId: merchant._id,
      name: "Last MacBook Unit",
      description: "Last remaining stock",
      category: "Electronics",
      sku: `SKU-MACBOOK-LAST-${timestamp}`,
      price: 114900,
      costPrice: 85000,
      currency: "INR",
      inventory: 1,
      isNegotiable: true,
      status: "active",
    });

    const policy = await Policy.findOne({ merchantId: merchant._id });
    const negotiation = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy!._id,
      buyerId: "buyer_payment_test",
      status: "ACCEPTED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 114900,
      acceptedPrice: 114900,
      round: 1,
      maxRounds: 5,
    });

    const singleAgreement = await Agreement.create({
      negotiationId: negotiation._id,
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy!._id,
      status: "APPROVED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 114900,
      agreedUnitPrice: 114900,
      discountPercent: 0,
      finalOrderValue: 114900,
      marginPercent: 26,
      approvedAt: new Date(),
    });

    const orderRes = await createPaymentOrder(singleAgreement._id.toString());
    const keySecret = process.env.RAZORPAY_KEY_SECRET!;
    const paymentId = `pay_mock_${Date.now()}`;
    const orderId = orderRes.data.orderId;
    const signature = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    const verifyRes = await verifyPayment({
      agreementId: singleAgreement._id.toString(),
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      razorpaySignature: signature,
    });

    assert.equal(verifyRes.success, true);
    assert.equal(verifyRes.data.product?.inventory, 0);

    const finalProduct = await Product.findById(product._id);
    assert.equal(finalProduct?.inventory, 0);
    assert.equal(finalProduct?.status, "out_of_stock");
  });

  test("11. Idempotent payment verification: Duplicate calls do not double-decrement stock", async () => {
    const timestamp = Date.now() + 3;
    const product = await Product.create({
      merchantId: merchant._id,
      name: "MacBook Idempotency Test",
      description: "Verify no double decrementing",
      category: "Electronics",
      sku: `SKU-MACBOOK-IDEM-${timestamp}`,
      price: 114900,
      costPrice: 85000,
      currency: "INR",
      inventory: 20,
      isNegotiable: true,
      status: "active",
    });

    const policy = await Policy.findOne({ merchantId: merchant._id });
    const negotiation = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy!._id,
      buyerId: "buyer_payment_test",
      status: "ACCEPTED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 114900,
      acceptedPrice: 114900,
      round: 1,
      maxRounds: 5,
    });

    const idemAgreement = await Agreement.create({
      negotiationId: negotiation._id,
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy!._id,
      status: "APPROVED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 114900,
      agreedUnitPrice: 114900,
      discountPercent: 0,
      finalOrderValue: 114900,
      marginPercent: 26,
      approvedAt: new Date(),
    });

    const orderRes = await createPaymentOrder(idemAgreement._id.toString());
    const keySecret = process.env.RAZORPAY_KEY_SECRET!;
    const paymentId = `pay_mock_${Date.now()}`;
    const orderId = orderRes.data.orderId;
    const signature = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    // Call 1
    const res1 = await verifyPayment({
      agreementId: idemAgreement._id.toString(),
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      razorpaySignature: signature,
    });
    assert.equal(res1.data.product?.inventory, 19);

    // Call 2 (duplicate/retry)
    const res2 = await verifyPayment({
      agreementId: idemAgreement._id.toString(),
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      razorpaySignature: signature,
    });
    assert.equal(res2.success, true);
    assert.equal(res2.data.product?.inventory, 19);

    // Call 3
    const res3 = await verifyPayment({
      agreementId: idemAgreement._id.toString(),
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      razorpaySignature: signature,
    });
    assert.equal(res3.success, true);
    assert.equal(res3.data.product?.inventory, 19);

    const finalProduct = await Product.findById(product._id);
    assert.equal(finalProduct?.inventory, 19);
  });

  test("12. Insufficient stock (0 inventory) rejects createPaymentOrder with 400", async () => {
    const timestamp = Date.now() + 4;
    const product = await Product.create({
      merchantId: merchant._id,
      name: "Out of Stock MacBook",
      description: "Zero units left",
      category: "Electronics",
      sku: `SKU-MACBOOK-OOS-${timestamp}`,
      price: 114900,
      costPrice: 85000,
      currency: "INR",
      inventory: 0,
      isNegotiable: true,
      status: "out_of_stock",
    });

    const policy = await Policy.findOne({ merchantId: merchant._id });
    const negotiation = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy!._id,
      buyerId: "buyer_payment_test",
      status: "ACCEPTED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 114900,
      acceptedPrice: 114900,
      round: 1,
      maxRounds: 5,
    });

    const oosAgreement = await Agreement.create({
      negotiationId: negotiation._id,
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy!._id,
      status: "APPROVED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 114900,
      agreedUnitPrice: 114900,
      discountPercent: 0,
      finalOrderValue: 114900,
      marginPercent: 26,
      approvedAt: new Date(),
    });

    await assert.rejects(
      async () => {
        await createPaymentOrder(oosAgreement._id.toString());
      },
      {
        name: "AppCustomError",
        message: /Insufficient product stock/,
      }
    );
  });

  test("13. Failed payment signature does NOT decrement stock", async () => {
    const timestamp = Date.now() + 5;
    const product = await Product.create({
      merchantId: merchant._id,
      name: "MacBook Failed Payment Test",
      description: "Stock must remain intact",
      category: "Electronics",
      sku: `SKU-MACBOOK-FAIL-${timestamp}`,
      price: 114900,
      costPrice: 85000,
      currency: "INR",
      inventory: 20,
      isNegotiable: true,
      status: "active",
    });

    const policy = await Policy.findOne({ merchantId: merchant._id });
    const negotiation = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy!._id,
      buyerId: "buyer_payment_test",
      status: "ACCEPTED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 114900,
      acceptedPrice: 114900,
      round: 1,
      maxRounds: 5,
    });

    const failAgreement = await Agreement.create({
      negotiationId: negotiation._id,
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy!._id,
      status: "APPROVED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 114900,
      agreedUnitPrice: 114900,
      discountPercent: 0,
      finalOrderValue: 114900,
      marginPercent: 26,
      approvedAt: new Date(),
    });

    const orderRes = await createPaymentOrder(failAgreement._id.toString());

    await assert.rejects(
      async () => {
        await verifyPayment({
          agreementId: failAgreement._id.toString(),
          razorpayPaymentId: "pay_tampered_123",
          razorpayOrderId: orderRes.data.orderId,
          razorpaySignature: "invalid_hmac_signature",
        });
      },
      {
        name: "AppCustomError",
        message: "Payment signature verification failed.",
      }
    );

    const checkProduct = await Product.findById(product._id);
    assert.equal(checkProduct?.inventory, 20);

    const checkPayment = await Payment.findOne({ agreementId: failAgreement._id });
    assert.equal(checkPayment?.status, "FAILED");
    assert.equal(checkPayment?.inventoryAdjusted, false);
  });

  test("14. Product edit without inventory dirty preserves decremented stock (19)", async () => {
    const timestamp = Date.now() + 6;
    const product = await Product.create({
      merchantId: merchant._id,
      name: "Apple MacBook Air M3",
      description: "Original Description",
      category: "Electronics",
      sku: `SKU-MACBOOK-EDIT-${timestamp}`,
      price: 114900,
      costPrice: 85000,
      currency: "INR",
      inventory: 20,
      isNegotiable: true,
      status: "active",
    });

    const policy = await Policy.findOne({ merchantId: merchant._id });
    const negotiation = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy!._id,
      buyerId: "buyer_payment_test",
      status: "ACCEPTED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 114900,
      acceptedPrice: 114900,
      round: 1,
      maxRounds: 5,
    });

    const editAgreement = await Agreement.create({
      negotiationId: negotiation._id,
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy!._id,
      status: "APPROVED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 114900,
      agreedUnitPrice: 114900,
      discountPercent: 0,
      finalOrderValue: 114900,
      marginPercent: 26,
      approvedAt: new Date(),
    });

    const orderRes = await createPaymentOrder(editAgreement._id.toString());
    const keySecret = process.env.RAZORPAY_KEY_SECRET!;
    const paymentId = `pay_mock_${Date.now()}`;
    const signature = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderRes.data.orderId}|${paymentId}`)
      .digest("hex");

    await verifyPayment({
      agreementId: editAgreement._id.toString(),
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderRes.data.orderId,
      razorpaySignature: signature,
    });

    // Product stock is now 19
    const midProduct = await Product.findById(product._id);
    assert.equal(midProduct?.inventory, 19);

    // Merchant edits product price and title WITHOUT passing inventory field
    const updatedProduct = await updateProduct(product._id.toString(), {
      price: 119900,
      description: "Updated Specs & Features",
    });

    assert.equal(updatedProduct.price, 119900);
    assert.equal(updatedProduct.inventory, 19);

    const fromDb = await Product.findById(product._id);
    assert.equal(fromDb?.inventory, 19);
  });
});
