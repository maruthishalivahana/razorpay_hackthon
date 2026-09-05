import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import Merchant, { type IMerchant } from "../../models/Merchant.js";
import Product from "../../models/Product.js";
import Policy from "../../models/Policy.js";
import Conversation from "../../models/Conversation.js";
import { runBuyerAgent } from "../buyerAgent.js";
import {
  searchProducts,
  validateCatalogRequirements,
  getCatalogCapabilities,
  getDynamicSupportedKeys,
} from "../../services/productService.js";
import { storedStateToBuyerState, getConversation } from "../../services/conversationService.js";
import { mergeIntent, createEmptyState } from "../buyerState.js";
import { sanitizeIntent, localFallbackIntent } from "../intentNormalizer.js";
import type { LLMProvider } from "../../llm/llmProvider.js";

const testMockProvider: LLMProvider = {
  name: "test-mock-provider",
  async generateIntent({ message, currentState }) {
    return localFallbackIntent(message, currentState);
  },
  async generateResponse({ products, buyerState }) {
    if (products.length === 0) {
      return "No matching products were found for your request.";
    }
    const topicStr = buyerState.topic ? ` matching "${buyerState.topic}"` : "";
    const listStr = products
      .slice(0, 3)
      .map((p, i) => `${i + 1}. ${p.name} — ₹${p.price.toLocaleString("en-IN")}`)
      .join("\n");
    return `Found ${products.length} product(s)${topicStr}:\n${listStr}`;
  },
};

describe("Catalog-Aware Requirements & Soft Preferences Tests", () => {
  let merchant: IMerchant;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    await Merchant.deleteMany({ email: /test-catreq-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-CATREQ-.*/ });
    await Policy.deleteMany({ merchantId: { $in: await Merchant.find({ email: /test-catreq-.*@example\.com/ }).distinct("_id") } });
    await Conversation.deleteMany({ conversationId: /^conv_catreq_/ });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Merchant.deleteMany({ email: /test-catreq-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-CATREQ-.*/ });
    await Policy.deleteMany({ merchantId: { $in: await Merchant.find({ email: /test-catreq-.*@example\.com/ }).distinct("_id") } });
    await Conversation.deleteMany({ conversationId: /^conv_catreq_/ });

    const timestamp = Date.now() + "-" + Math.floor(Math.random() * 10000);

    merchant = await Merchant.create({
      name: "Catalog Merchant",
      businessName: "Catalog Business",
      email: `test-catreq-${timestamp}@example.com`,
      currency: "INR",
      status: "active",
    });

    await Policy.create({
      merchantId: merchant._id,
      name: "Catalog Policy",
      maxDiscountPercent: 20,
      minMarginPercent: 10,
      maxNegotiationRounds: 3,
    });

    await Product.create([
      {
        merchantId: merchant._id,
        name: "Ergonomic Office Chair Pro",
        description: "Ergonomic office chair with adjustable height and lumbar support",
        category: "Office Furniture",
        sku: `SKU-CATREQ-CHAIR1-${timestamp}`,
        price: 15000,
        costPrice: 10000,
        currency: "INR",
        inventory: 10,
        status: "active",
        tags: ["office", "chair", "ergonomic", "adjustable"],
        // Structured specifications — generic, furniture-category agnostic
        specifications: new Map<string, any>([
          ["ergonomic", true],
          ["adjustableHeight", true],
          ["lumbarSupport", true],
          ["comfortable", true],
          ["material", "mesh"],
          ["useCase", "working from home"],
        ]),
      },
      {
        merchantId: merchant._id,
        name: "DevBook Pro Laptop 16GB",
        description: "Intel Core i7, 16GB RAM, 512GB SSD storage, lightweight for coding",
        category: "Laptop",
        sku: `SKU-CATREQ-LAP1-${timestamp}`,
        price: 55000,
        costPrice: 40000,
        currency: "INR",
        inventory: 8,
        status: "active",
        tags: ["laptop", "16gb", "512gb", "coding"],
        // Structured specifications — generic, electronics-category agnostic
        specifications: new Map<string, any>([
          ["ram", "16GB"],
          ["storage", "512GB"],
          ["brand", "DevBook"],
          ["lightweight", true],
        ]),
      },
      {
        merchantId: merchant._id,
        name: "Pro Runner Shoes Size 9",
        description: "Running shoes size 9 in black color",
        category: "Shoes",
        sku: `SKU-CATREQ-SHOE1-${timestamp}`,
        price: 4500,
        costPrice: 3000,
        currency: "INR",
        inventory: 12,
        status: "active",
        tags: ["shoes", "running", "size 9", "black"],
        // Structured specifications — generic, fashion-category agnostic
        specifications: new Map<string, any>([
          ["size", "9"],
          ["color", "black"],
          ["brand", "ProRunner"],
        ]),
      },
      {
        merchantId: merchant._id,
        name: "Smartphone X 256GB",
        description: "256GB storage smartphone with high quality camera",
        category: "Phone",
        sku: `SKU-CATREQ-PHONE1-${timestamp}`,
        price: 35000,
        costPrice: 25000,
        currency: "INR",
        inventory: 5,
        status: "active",
        tags: ["phone", "256gb", "camera"],
        // Structured specifications — generic, electronics-category agnostic
        specifications: new Map<string, any>([
          ["storage", "256GB"],
          ["brand", "SmartX"],
          ["cameraQuality", true],
        ]),
      },
    ]);
  });

  // 1. Supported hard requirement (utility function test)
  test("1. Supported hard requirement is catalog-validated as hard (utility)", () => {
    const validated = validateCatalogRequirements({ ram: "16GB" }, {});
    assert.equal(validated.hardRequirements.ram, "16GB");
    assert.equal(validated.softPreferences.ram, undefined);
  });

  // 2. Unsupported preference (utility function test)
  test("2. Unsupported preference is classified as soft preference (utility)", () => {
    const validated = validateCatalogRequirements({ comfortable: true }, {});
    assert.equal(validated.hardRequirements.comfortable, undefined);
    assert.equal(validated.softPreferences.comfortable, true);
  });

  // 3. Explicit "must have"
  test("3. Explicit 'must have' for supported key produces hard requirement", () => {
    const intent = localFallbackIntent("I must have an ergonomic chair", createEmptyState());
    assert.equal(intent.updates.hardRequirements?.ergonomic, true);
  });

  // 4. Explicit "preferably"
  test("4. Explicit 'preferably' for unsupported key produces soft preference", () => {
    const intent = localFallbackIntent("I prefer something comfortable", createEmptyState());
    assert.equal(intent.updates.softPreferences?.comfortable, true);
    assert.equal(intent.updates.hardRequirements?.comfortable, undefined);
  });

  // 5. Mixed hard + soft request
  test("5. Mixed hard + soft request correctly separates requirements and preferences", () => {
    const intent = localFallbackIntent(
      "I need an ergonomic chair with adjustable height for working from home all day",
      createEmptyState()
    );
    assert.equal(intent.updates.hardRequirements?.ergonomic, true);
    assert.equal(intent.updates.hardRequirements?.adjustableHeight, true);
    assert.equal(intent.updates.softPreferences?.useCase, "working from home");
    assert.equal(intent.updates.softPreferences?.useDuration, "all day");
  });

  // 6. Price + requirements + preferences
  test("6. Price remains hard constraint alongside requirements and preferences", () => {
    const intent = localFallbackIntent(
      "I need an ergonomic chair under 20000, preferably comfortable",
      createEmptyState()
    );
    assert.equal(intent.updates.maxPrice, 20000);
    assert.equal(intent.updates.hardRequirements?.ergonomic, true);
    assert.equal(intent.updates.softPreferences?.comfortable, true);
  });

  // 7. Quantity + requirements + preferences
  test("7. Quantity remains hard constraint alongside requirements and preferences", () => {
    const intent = localFallbackIntent(
      "I need 5 ergonomic chairs, preferably black",
      createEmptyState()
    );
    assert.equal(intent.updates.quantity, 5);
    assert.equal(intent.updates.hardRequirements?.ergonomic, true);
    assert.equal(intent.updates.softPreferences?.color, "black");
  });

  // 8. Existing topic + soft preference follow-up
  test("8. Existing topic + soft preference follow-up updates softPreferences", () => {
    const initial = localFallbackIntent("I want an office chair", createEmptyState());
    const state1 = mergeIntent(createEmptyState(), initial);
    const followUp = localFallbackIntent("I'd prefer something comfortable", state1);
    const state2 = mergeIntent(state1, followUp);

    assert.equal(state2.topic, "office chair");
    assert.equal(state2.softPreferences.comfortable, true);
  });

  // 9. Existing topic + hard requirement follow-up
  test("9. Existing topic + hard requirement follow-up updates hardRequirements", () => {
    const initial = localFallbackIntent("I want an office chair", createEmptyState());
    const state1 = mergeIntent(createEmptyState(), initial);
    const followUp = localFallbackIntent("Must have adjustable height", state1);
    const state2 = mergeIntent(state1, followUp);

    assert.equal(state2.topic, "office chair");
    assert.equal(state2.hardRequirements.adjustableHeight, true);
  });

  // 10. Preference upgraded to hard
  test("10. Soft preference upgraded to hard requirement when explicitly required", () => {
    const state1 = mergeIntent(createEmptyState(), {
      type: "NEW_SEARCH",
      updates: { topic: "shoes", softPreferences: { color: "black" } },
    });
    assert.equal(state1.softPreferences.color, "black");

    const upgrade = localFallbackIntent("Actually black is required", state1);
    const state2 = mergeIntent(state1, upgrade);

    assert.equal(state2.hardRequirements.color, "black");
    assert.equal(state2.softPreferences.color, undefined);
  });

  // 11. Hard downgraded to soft
  test("11. Hard requirement downgraded to soft preference when specified as preferred", () => {
    const state1 = mergeIntent(createEmptyState(), {
      type: "NEW_SEARCH",
      updates: { topic: "shoes", hardRequirements: { color: "black" } },
    });
    assert.equal(state1.hardRequirements.color, "black");

    const downgrade = localFallbackIntent("Black is preferred, but not required", state1);
    const state2 = mergeIntent(state1, downgrade);

    assert.equal(state2.softPreferences.color, "black");
    assert.equal(state2.hardRequirements.color, undefined);
  });

  // 12. Hard requirement + soft preference search
  test("12. Supported hard requirement + soft preference returns correct products", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "office chair",
      hardRequirements: { ergonomic: true },
      softPreferences: { comfortable: true, useCase: "working from home" },
    });
    assert.ok(res.returned > 0);
    // All returned products must have ergonomic=true in specs
    assert.ok(res.products.every(p => p.specifications?.ergonomic === true));
  });

  // 13. Zero results caused by hard requirement mismatch
  test("13. Hard requirement causes zero results if catalog has no matching spec value", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "office chair",
      hardRequirements: { ram: "128GB" }, // Laptop-spec on a chair — not in chair's specs
    });
    assert.equal(res.returned, 0);
  });

  // 14. Soft preference alone does not produce zero results
  test("14. Soft preference alone does not filter out products", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "office chair",
      softPreferences: { nonExistentAttribute: true },
    });
    assert.ok(res.returned > 0);
  });

  // 15. Dynamic catalog capability detection — no static allowlist
  test("15. getDynamicSupportedKeys detects spec keys from actual catalog (no static list)", async () => {
    const keys = await getDynamicSupportedKeys(merchant._id.toString());
    // Keys present because the test fixture products have these in their specifications
    assert.ok(keys.has("ram"));         // DevBook Pro Laptop specs
    assert.ok(keys.has("size"));        // Pro Runner Shoes specs
    assert.ok(keys.has("ergonomic"));   // Ergonomic Office Chair specs
    assert.ok(keys.has("storage"));     // Smartphone X and DevBook specs
    assert.ok(keys.has("color"));       // Pro Runner Shoes specs
    assert.ok(keys.has("brand"));       // Multiple products
    // Keys NOT present confirm the catalog is truly dynamic (no static additions)
    assert.ok(!keys.has("flyingCapability"));
    assert.ok(!keys.has("invisibilityCloak"));
  });

  // 16. Laptop example regression — generic spec matching
  test("16. Laptop example: 16GB RAM is hard, coding & lightweight are soft", () => {
    const intent = localFallbackIntent("I need a laptop for coding, 16GB RAM, preferably lightweight, under 60000", createEmptyState());
    assert.equal(intent.updates.topic, "laptop");
    assert.equal(intent.updates.maxPrice, 60000);
    assert.equal(intent.updates.hardRequirements?.ram, "16GB");
    assert.equal(intent.updates.softPreferences?.useCase, "coding");
    assert.equal(intent.updates.softPreferences?.lightweight, true);
  });

  // 17. Shoes example regression — generic spec matching
  test("17. Shoes example: size 9 is hard, black is soft", () => {
    const intent = localFallbackIntent("Running shoes size 9, black if possible, below 5000", createEmptyState());
    assert.equal(intent.updates.topic, "running shoe");
    assert.equal(intent.updates.maxPrice, 5000);
    assert.equal(intent.updates.hardRequirements?.size, "9");
    assert.equal(intent.updates.softPreferences?.color, "black");
  });

  // 18. Phone example regression — generic spec matching
  test("18. Phone example: 256GB storage is hard, good camera is soft", () => {
    const intent = localFallbackIntent("Give me a phone with 256GB storage, good camera would be nice", createEmptyState());
    assert.equal(intent.updates.topic, "phone");
    assert.equal(intent.updates.hardRequirements?.storage, "256GB");
    assert.equal(intent.updates.softPreferences?.cameraQuality, true);
  });

  // 19. Conversation persistence
  test("19. Hard requirements and soft preferences persist in MongoDB", async () => {
    const res = await runBuyerAgent({
      message: "I need an ergonomic chair with adjustable height for working from home",
      provider: testMockProvider,
    });

    const doc = await getConversation(res.conversationId);
    assert.ok(doc);
    const hardReqs = (doc.buyerState.hardRequirements as any)?.get
      ? (doc.buyerState.hardRequirements as any).get("ergonomic")
      : (doc.buyerState.hardRequirements as any)?.ergonomic;
    const softPrefs = (doc.buyerState.softPreferences as any)?.get
      ? (doc.buyerState.softPreferences as any).get("useCase")
      : (doc.buyerState.softPreferences as any)?.useCase;
    assert.equal(hardReqs, true);
    assert.equal(softPrefs, "working from home");
  });

  // 20. Server restart persistence
  test("20. Server restart simulation restores both hardRequirements and softPreferences from stored state", async () => {
    const res1 = await runBuyerAgent({
      message: "I need a laptop with 16GB RAM, preferably lightweight",
      provider: testMockProvider,
    });

    const doc = await getConversation(res1.conversationId);
    assert.ok(doc);
    const restoredState = storedStateToBuyerState(doc.buyerState, doc.searchResultProductIds);

    assert.equal(restoredState.hardRequirements.ram, "16GB");
    assert.equal(restoredState.softPreferences.lightweight, true);
  });

  // 21. Selection preserves preferences
  test("21. Selecting a product preserves hardRequirements and softPreferences", async () => {
    const res1 = await runBuyerAgent({
      message: "I need an ergonomic office chair",
      provider: testMockProvider,
    });

    const res2 = await runBuyerAgent({
      message: "I want the first one",
      conversationId: res1.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res2.selectedProduct);
    assert.equal(res2.searchState.hardRequirements.ergonomic, true);
  });

  // 22. Negotiation preserves preferences
  test("22. Negotiation flow preserves hardRequirements and softPreferences", async () => {
    const res1 = await runBuyerAgent({
      message: "I need an ergonomic office chair",
      provider: testMockProvider,
    });

    await runBuyerAgent({
      message: "I want the first one",
      conversationId: res1.conversationId,
      provider: testMockProvider,
    });

    const negRes = await runBuyerAgent({
      message: "Can you give me a better price?",
      conversationId: res1.conversationId,
      provider: testMockProvider,
    });

    assert.equal(negRes.searchState.hardRequirements.ergonomic, true);
  });

  // 23. No product topic requires clarification
  test("23. Request with soft preferences but no product topic prompts for clarification", async () => {
    const res = await runBuyerAgent({
      message: "I want something comfortable under 10000",
      provider: testMockProvider,
    });

    assert.ok(res.message.includes("What product are you looking for?"));
  });

  // 24. No fabricated catalog attributes
  test("24. System does not fabricate unsupported attributes into hard MongoDB filters (utility)", () => {
    const validated = validateCatalogRequirements({ comfortLevel: 10, luxuryFeeling: "high" });
    assert.equal(validated.hardRequirements.comfortLevel, undefined);
    assert.equal(validated.hardRequirements.luxuryFeeling, undefined);
    assert.equal(validated.softPreferences.comfortLevel, 10);
    assert.equal(validated.softPreferences.luxuryFeeling, "high");
  });

  // 25. Hard requirements pass through — dynamic catalog evaluation at search time
  test("25. Hard requirements pass through sanitizeIntent for dynamic catalog evaluation at search time", () => {
    const sanitized = sanitizeIntent({
      type: "NEW_SEARCH",
      updates: {
        topic: "office chair",
        hardRequirements: {
          ergonomic: true,
          fakeLLMField: "unsupportedValue",
        },
      },
    });

    assert.ok(sanitized);
    assert.equal(sanitized.updates.hardRequirements?.ergonomic, true);
    // With dynamic capabilities, hard requirements are NOT downgraded by a static list.
    // The search engine evaluates them against actual catalog specs at query time.
    // fakeLLMField will simply find no matching products (no spec, no text match → excluded).
    assert.equal(sanitized.updates.hardRequirements?.fakeLLMField, "unsupportedValue");
    assert.equal(sanitized.updates.softPreferences?.fakeLLMField, undefined);
  });
});
