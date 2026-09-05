import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import Merchant, { type IMerchant } from "../../models/Merchant.js";
import Product from "../../models/Product.js";
import Policy from "../../models/Policy.js";
import Negotiation from "../../models/Negotiation.js";
import Conversation from "../../models/Conversation.js";
import { localFallbackIntent, parseBuyerOffer, parseIndianPrice, isFreeDeliveryRequest } from "../intentNormalizer.js";
import { runBuyerAgent } from "../buyerAgent.js";
import { createEmptyState, type BuyerState } from "../buyerState.js";

describe("Semantic Natural Language Variations Test Suite", () => {
  let merchant: IMerchant;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    await Merchant.deleteMany({ email: /test-semantic-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-SEMANTIC-.*/ });
    await Policy.deleteMany({ merchantId: { $in: [merchant?._id] } });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Merchant.deleteMany({ email: /test-semantic-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-SEMANTIC-.*/ });
    const timestamp = Date.now() + "-" + Math.floor(Math.random() * 10000);

    merchant = await Merchant.create({
      name: "Semantic Merchant",
      businessName: "Semantic Business",
      email: `test-semantic-${timestamp}@example.com`,
      currency: "INR",
      status: "active",
    });

    await Policy.create({
      merchantId: merchant._id,
      name: "Default Policy",
      minMarginPercent: 10,
      maxDiscountPercent: 30,
      freeShippingThreshold: 15000,
      maxNegotiationRounds: 5,
      autoApproveThreshold: 20000,
      negotiationEnabled: true,
      isActive: true,
    });

    await Product.create([
      {
        merchantId: merchant._id,
        name: "Apple MacBook Air M2",
        description: "13-inch laptop 8GB RAM 256GB SSD",
        category: "Electronics",
        sku: `SKU-SEMANTIC-1-${timestamp}`,
        price: 90000,
        costPrice: 70000,
        currency: "INR",
        inventory: 10,
        isNegotiable: true,
        status: "active",
      },
      {
        merchantId: merchant._id,
        name: "Ergonomic Office Chair",
        description: "High back mesh office chair with lumbar support",
        category: "Furniture",
        sku: `SKU-SEMANTIC-2-${timestamp}`,
        price: 20000,
        costPrice: 12000,
        currency: "INR",
        inventory: 15,
        isNegotiable: true,
        status: "active",
      },
      {
        merchantId: merchant._id,
        name: "Running Shoes",
        description: "Lightweight cushioned running shoes size 9",
        category: "Fashion",
        sku: `SKU-SEMANTIC-3-${timestamp}`,
        price: 5000,
        costPrice: 3000,
        currency: "INR",
        inventory: 20,
        isNegotiable: true,
        status: "active",
      },
    ]);
  });

  // ── GROUP 1: FREE DELIVERY VARIATIONS (10+ Sentences) ──
  test("GROUP 1: Free delivery semantic variations map to REQUEST_FREE_DELIVERY", () => {
    const state: BuyerState = {
      ...createEmptyState(),
      selectedProductId: "mock-id-1",
      selectedProductName: "Ergonomic Office Chair",
      negotiationId: "mock-neg-1",
      negotiationStatus: "ACTIVE",
    };

    const freeDeliveryPhrases = [
      "Can you include free shipping?",
      "Could you waive the delivery fee?",
      "Can you cover shipping?",
      "Can you throw in delivery?",
      "I'd like free delivery.",
      "Would you include shipping at no extra cost?",
      "Can you make delivery free?",
      "Can you absorb the shipping cost?",
      "can u do free delivery",
      "free delivery possible?",
      "shipping free?",
      "can you waive shipping",
    ];

    for (const phrase of freeDeliveryPhrases) {
      const intent = localFallbackIntent(phrase, state);
      assert.equal(
        intent.type,
        "REQUEST_FREE_DELIVERY",
        `Failed for phrase: "${phrase}" (got type ${intent.type})`
      );
      assert.equal(
        intent.updates.requestedFreeDelivery,
        true,
        `Failed requestedFreeDelivery for phrase: "${phrase}"`
      );
    }
  });

  // ── GROUP 2: PRICE / DISCOUNT VARIATIONS (10+ Sentences) ──
  test("GROUP 2: Price / Discount semantic variations map correctly", () => {
    const state: BuyerState = {
      ...createEmptyState(),
      selectedProductId: "mock-id-1",
      selectedProductName: "Ergonomic Office Chair",
      negotiationId: "mock-neg-1",
      negotiationStatus: "ACTIVE",
    };

    const numericOfferPhrases: Array<[string, number]> = [
      ["Would you take ₹18,000?", 18000],
      ["I can do ₹18,000.", 18000],
      ["I'm around ₹18k.", 18000],
      ["How about eighteen thousand?", 18000],
      ["Can we meet around ₹18,000?", 18000],
      ["18k works for me", 18000],
      ["18 K", 18000],
      ["18 grand", 18000],
      ["INR 18,000", 18000],
      ["18,000 rupees", 18000],
    ];

    for (const [phrase, expectedAmount] of numericOfferPhrases) {
      const intent = localFallbackIntent(phrase, state);
      assert.equal(
        intent.type,
        "BUYER_OFFER",
        `Failed type for phrase: "${phrase}" (got ${intent.type})`
      );
      assert.equal(
        intent.updates.buyerOffer,
        expectedAmount,
        `Failed buyerOffer for phrase: "${phrase}" (got ${intent.updates.buyerOffer})`
      );
    }
  });

  // ── GROUP 3: PRODUCT SELECTION VARIATIONS (10+ Sentences) ──
  test("GROUP 3: Product selection semantic variations map to SELECT_PRODUCT", () => {
    const state: BuyerState = {
      ...createEmptyState(),
      searchResults: ["prod-1", "prod-2", "prod-3"],
      topic: "chair",
    };

    const indexTwoPhrases = [
      "I'll take the second one.",
      "The second option looks good.",
      "I want option two.",
      "I'll go with the second product.",
      "Let's go with option 2.",
      "second one",
    ];

    for (const phrase of indexTwoPhrases) {
      const intent = localFallbackIntent(phrase, state);
      assert.equal(
        intent.type,
        "SELECT_PRODUCT",
        `Failed type for phrase: "${phrase}"`
      );
      assert.equal(
        intent.updates.selectedProductIndex,
        2,
        `Failed selectedProductIndex for phrase: "${phrase}"`
      );
    }

    const demonstrativePhrases = ["That one.", "yeah lets go with that"];
    for (const phrase of demonstrativePhrases) {
      const intent = localFallbackIntent(phrase, state);
      assert.equal(
        intent.type,
        "SELECT_PRODUCT",
        `Failed type for phrase: "${phrase}"`
      );
    }
  });

  // ── GROUP 4: ORDER PLACEMENT VARIATIONS (10+ Sentences) ──
  test("GROUP 4: Order placement variations map to PLACE_ORDER when negotiation accepted", () => {
    const acceptedState: BuyerState = {
      ...createEmptyState(),
      negotiationId: "mock-neg-accepted",
      negotiationStatus: "ACCEPTED",
    };

    const orderPhrases = [
      "Please order it.",
      "Go ahead.",
      "Let's buy it.",
      "I'll take it.",
      "Complete the order.",
      "Let's proceed.",
      "Place the order for me.",
      "Okay, place the order.",
      "I want to place the order.",
      "Proceed with purchase.",
    ];

    for (const phrase of orderPhrases) {
      const intent = localFallbackIntent(phrase, acceptedState);
      assert.equal(
        intent.type,
        "PLACE_ORDER",
        `Failed type for phrase: "${phrase}" (got ${intent.type})`
      );
    }
  });

  // ── GROUP 5: DELIVERY QUERY (READ) VARIATIONS (10+ Sentences) ──
  test("GROUP 5: Delivery question variations map to COMMERCE_QUERY (SHIPPING_AVAILABILITY)", () => {
    const state = createEmptyState();

    const queryPhrases = [
      "Does shipping come free?",
      "Is delivery included?",
      "Is shipping included in this price?",
      "Does this offer include delivery?",
      "Do I have to pay for shipping?",
      "Does the current price include delivery?",
      "Is shipping free?",
      "Is delivery free for this item?",
    ];

    for (const phrase of queryPhrases) {
      const intent = localFallbackIntent(phrase, state);
      assert.equal(
        intent.type,
        "COMMERCE_QUERY",
        `Failed type for phrase: "${phrase}" (got ${intent.type})`
      );
      assert.equal(
        intent.updates.query?.kind,
        "SHIPPING_AVAILABILITY",
        `Failed query kind for phrase: "${phrase}"`
      );
    }
  });

  // ── GROUP 6: NEGOTIATION CONTINUATION VARIATIONS (10+ Sentences) ──
  test("GROUP 6: Negotiation continuation variations map to CONTINUE_NEGOTIATION", () => {
    const state: BuyerState = {
      ...createEmptyState(),
      selectedProductId: "mock-id-1",
      negotiationId: "mock-neg-1",
      negotiationStatus: "ACTIVE",
    };

    const continuationPhrases = [
      "Can we negotiate a little more?",
      "Can you come down a bit?",
      "Can you improve that offer?",
      "Can you do any better?",
      "Is that the best you can do?",
      "Can we keep negotiating?",
      "Can you offer something better?",
      "Can you do better?",
    ];

    for (const phrase of continuationPhrases) {
      const intent = localFallbackIntent(phrase, state);
      assert.equal(
        intent.type,
        "CONTINUE_NEGOTIATION",
        `Failed type for phrase: "${phrase}" (got ${intent.type})`
      );
    }
  });

  // ── GROUP 7: COMBINED COMMERCIAL TERMS VARIATIONS (10+ Sentences) ──
  test("GROUP 7: Combined commercial terms preserve BOTH price offer and free delivery", () => {
    const state: BuyerState = {
      ...createEmptyState(),
      selectedProductId: "mock-id-1",
      negotiationId: "mock-neg-1",
      negotiationStatus: "ACTIVE",
    };

    const combinedPhrases: Array<[string, number]> = [
      ["I can do ₹18,000 with free delivery.", 18000],
      ["I'll pay ₹18,000 if you include free delivery.", 18000],
      ["18k if you include free shipping", 18000],
      ["₹18,000 with free shipping", 18000],
      ["I can pay 18k with delivery included", 18000],
      ["How about 18,000 and free delivery?", 18000],
      ["Can you do 18000 and cover shipping?", 18000],
      ["18000 rupees with free shipping", 18000],
    ];

    for (const [phrase, expectedAmount] of combinedPhrases) {
      const intent = localFallbackIntent(phrase, state);
      assert.equal(
        intent.type,
        "BUYER_OFFER",
        `Failed type for combined phrase: "${phrase}" (got ${intent.type})`
      );
      assert.equal(
        intent.updates.buyerOffer,
        expectedAmount,
        `Failed buyerOffer for phrase: "${phrase}"`
      );
      assert.equal(
        intent.updates.requestedFreeDelivery,
        true,
        `Failed requestedFreeDelivery for phrase: "${phrase}"`
      );
    }
  });

  // ── GROUP 8: NUMERIC FORM PARSING TESTS ──
  test("GROUP 8: Numeric offer extraction handles all currency formats without selecting product 8500", () => {
    assert.equal(parseIndianPrice("₹18,000"), 18000);
    assert.equal(parseIndianPrice("₹18000"), 18000);
    assert.equal(parseIndianPrice("18,000"), 18000);
    assert.equal(parseIndianPrice("18000"), 18000);
    assert.equal(parseIndianPrice("18k"), 18000);
    assert.equal(parseIndianPrice("18 K"), 18000);
    assert.equal(parseIndianPrice("18 grand"), 18000);
    assert.equal(parseIndianPrice("eighteen thousand"), 18000);
    assert.equal(parseIndianPrice("INR 18,000"), 18000);
    assert.equal(parseIndianPrice("18,000 rupees"), 18000);

    const offer = parseBuyerOffer("I can pay 8500");
    assert.equal(offer, 8500);
  });

  // ── GROUP 9: CONTEXTUAL CONFIRMATIONS (pendingAction) ──
  test("GROUP 9: Contextual confirmation ('yes') interprets based on pendingAction", () => {
    const placeOrderState: BuyerState = {
      ...createEmptyState(),
      negotiationId: "neg-1",
      negotiationStatus: "ACCEPTED",
      pendingAction: "PLACE_ORDER",
    };

    const intentOrder = localFallbackIntent("Yes.", placeOrderState);
    assert.equal(intentOrder.type, "PLACE_ORDER");

    const continueNegState: BuyerState = {
      ...createEmptyState(),
      negotiationId: "neg-1",
      negotiationStatus: "ACTIVE",
      pendingAction: "CONTINUE_NEGOTIATION",
    };

    const intentContinue = localFallbackIntent("Yes.", continueNegState);
    assert.equal(intentContinue.type, "CONTINUE_NEGOTIATION");
  });

  // ── GROUP 10: REAL AGENT EXECUTION FLOWS ──
  test("GROUP 10: End-to-end agent execution with natural language variations", async () => {
    // 1. "Could you waive the delivery charge?" when active negotiation exists
    const chair = await Product.findOne({ name: "Ergonomic Office Chair" });
    assert.ok(chair);

    const startRes = await runBuyerAgent({
      message: "I want an Ergonomic Office Chair",
      provider: {
        name: "test-mock-provider",
        generateIntent: async () => ({ type: "NEW_SEARCH", updates: { topic: "office chair" } }),
        generateResponse: async () => "Here is the Ergonomic Office Chair.",
      },
    });
    assert.ok(startRes.conversationId);
    assert.ok(startRes.products.length > 0);

    // Select second product or first product
    const selectRes = await runBuyerAgent({
      conversationId: startRes.conversationId,
      message: "The second option looks good.",
      provider: {
        name: "test-mock-provider",
        generateIntent: async () => ({ type: "SELECT_PRODUCT", updates: { selectedProductIndex: 1 } }),
        generateResponse: async () => "You selected Ergonomic Office Chair.",
      },
    });
    assert.equal(selectRes.selectedProduct?.name, "Ergonomic Office Chair");

    // Initiate negotiation via natural language: "Can we improve that offer?"
    const negRes = await runBuyerAgent({
      conversationId: startRes.conversationId,
      message: "Can we improve that offer?",
      provider: {
        name: "test-mock-provider",
        generateIntent: async () => ({ type: "START_NEGOTIATION", updates: {} }),
        generateResponse: async () => "Sure, what price were you hoping for?",
      },
    });
    assert.ok(negRes.searchState.negotiationId);

    // Propose combined terms: "I can do 18k if you include free delivery."
    const combinedRes = await runBuyerAgent({
      conversationId: startRes.conversationId,
      message: "I can do 18k if you include free delivery.",
      provider: {
        name: "test-mock-provider",
        generateIntent: async () => ({
          type: "BUYER_OFFER",
          updates: { buyerOffer: 18000, requestedFreeDelivery: true },
        }),
        generateResponse: async () => "₹18,000 works and free delivery is included. Would you like to accept?",
      },
    });
    assert.equal(combinedRes.searchState.buyerOffer, 18000);
    assert.equal(combinedRes.searchState.requestedFreeDelivery, true);

    // Read query: "Does the current price include delivery?"
    const queryRes = await runBuyerAgent({
      conversationId: startRes.conversationId,
      message: "Does the current price include delivery?",
      provider: {
        name: "test-mock-provider",
        generateIntent: async () => ({
          type: "COMMERCE_QUERY",
          updates: { query: { kind: "SHIPPING_AVAILABILITY" } },
        }),
        generateResponse: async () => "Yes, free delivery is included.",
      },
    });
    assert.ok(queryRes.commerceQuery);

    // Accept negotiation: "Yeah, let's do it."
    const acceptRes = await runBuyerAgent({
      conversationId: startRes.conversationId,
      message: "Yeah, let's do it.",
      provider: {
        name: "test-mock-provider",
        generateIntent: async () => ({
          type: "ACCEPT_NEGOTIATION",
          updates: {},
        }),
        generateResponse: async () => "Accepted!",
      },
    });
    assert.equal(acceptRes.searchState.negotiationStatus, "ACCEPTED");

    // Order placement: "Please place the order for me."
    const orderRes = await runBuyerAgent({
      conversationId: startRes.conversationId,
      message: "Please place the order for me.",
      provider: {
        name: "test-mock-provider",
        generateIntent: async () => ({
          type: "PLACE_ORDER",
          updates: {},
        }),
        generateResponse: async () => "Order placed!",
      },
    });
    assert.ok(orderRes.agreement);
  });
});
