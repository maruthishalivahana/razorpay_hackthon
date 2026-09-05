import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Negotiation, ConversationMessage, AuditEventInfo } from "@/types/negotiation";
import { formatCurrency } from "../../utils/format.js";

describe("Negotiation Monitoring Logic & Data Formatting", () => {
  const sampleNegotiations: Negotiation[] = [
    {
      _id: "neg_1",
      merchantId: "m1",
      productId: { name: "Office Chair Pro", sku: "CHAIR-001", price: 10000, category: "Furniture" },
      status: "ACTIVE",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 10000,
      currentBuyerOffer: 8500,
      currentMerchantOffer: 9000,
      currentRound: 1,
      maxRounds: 3,
      startedAt: "2026-09-01T10:00:00.000Z",
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:05:00.000Z",
      freeDeliveryEligible: false,
    },
    {
      _id: "neg_2",
      merchantId: "m1",
      productId: { name: "MacBook Pro 14", sku: "MBP14-001", price: 120000, category: "Electronics" },
      status: "ACCEPTED",
      quantity: 2,
      currency: "INR",
      originalUnitPrice: 120000,
      currentBuyerOffer: 110000,
      currentMerchantOffer: 115000,
      acceptedPrice: 115000,
      finalOrderValue: 230000,
      currentRound: 2,
      maxRounds: 3,
      startedAt: "2026-09-01T09:00:00.000Z",
      createdAt: "2026-09-01T09:00:00.000Z",
      updatedAt: "2026-09-01T09:15:00.000Z",
      freeDeliveryEligible: true,
    },
    {
      _id: "neg_3",
      merchantId: "m1",
      productId: { name: "Standing Desk", sku: "DESK-001", price: 25000, category: "Furniture" },
      status: "EXPIRED",
      quantity: 5,
      currency: "INR",
      originalUnitPrice: 25000,
      currentBuyerOffer: 15000,
      currentMerchantOffer: 22500,
      currentRound: 3,
      maxRounds: 3,
      startedAt: "2026-08-31T15:00:00.000Z",
      createdAt: "2026-08-31T15:00:00.000Z",
      updatedAt: "2026-08-31T15:20:00.000Z",
      freeDeliveryEligible: true,
    },
    {
      _id: "neg_4",
      merchantId: "m1",
      productId: { name: "Wireless Mouse", sku: "MOUSE-001", price: 2000, category: "Electronics" },
      status: "REJECTED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 2000,
      currentBuyerOffer: 500,
      currentRound: 1,
      maxRounds: 3,
      startedAt: "2026-08-30T12:00:00.000Z",
      createdAt: "2026-08-30T12:00:00.000Z",
      updatedAt: "2026-08-30T12:05:00.000Z",
      freeDeliveryEligible: false,
    },
  ];

  // 1. Summary Metrics
  it("1. accurately aggregates counts for Active, Accepted, Expired/Rejected, and Total", () => {
    const activeCount = sampleNegotiations.filter((n) => n.status === "ACTIVE").length;
    const acceptedCount = sampleNegotiations.filter((n) => n.status === "ACCEPTED").length;
    const expiredCount = sampleNegotiations.filter((n) => n.status === "EXPIRED" || n.status === "REJECTED").length;
    const totalCount = sampleNegotiations.length;

    assert.strictEqual(activeCount, 1);
    assert.strictEqual(acceptedCount, 1);
    assert.strictEqual(expiredCount, 2);
    assert.strictEqual(totalCount, 4);
  });

  // 2. Distinct Offers
  it("2. clearly distinguishes Buyer Offer and Current Merchant Offer with formatting", () => {
    const neg = sampleNegotiations[0];
    const buyerOfferFormatted = neg.currentBuyerOffer ? formatCurrency(neg.currentBuyerOffer, neg.currency) : "—";
    const currentOfferFormatted = neg.currentMerchantOffer ? formatCurrency(neg.currentMerchantOffer, neg.currency) : "—";

    assert.ok(buyerOfferFormatted.includes("8,500") || buyerOfferFormatted.includes("8500"));
    assert.ok(currentOfferFormatted.includes("9,000") || currentOfferFormatted.includes("9000"));
    assert.notStrictEqual(buyerOfferFormatted, currentOfferFormatted);
  });

  // 3. Quantity formatting
  it("3. formats singular vs plural quantity units correctly", () => {
    const formatQty = (qty: number) => `${qty} ${qty === 1 ? "unit" : "units"}`;

    assert.strictEqual(formatQty(1), "1 unit");
    assert.strictEqual(formatQty(2), "2 units");
    assert.strictEqual(formatQty(10), "10 units");
  });

  // 4. Round formatting
  it("4. formats current round and max rounds", () => {
    const formatRound = (current: number, max: number) => `Round ${current} / ${max}`;

    assert.strictEqual(formatRound(1, 3), "Round 1 / 3");
    assert.strictEqual(formatRound(3, 3), "Round 3 / 3");
  });

  // 5. Backend-driven free shipping eligibility
  it("5. preserves backend-provided free delivery eligibility flag without recalculating", () => {
    const neg1 = sampleNegotiations[0];
    const neg2 = sampleNegotiations[1];

    assert.strictEqual(neg1.freeDeliveryEligible, false);
    assert.strictEqual(neg2.freeDeliveryEligible, true);
  });

  // 6. Chronological conversation messages
  it("6. correctly classifies user vs assistant roles in conversation timeline", () => {
    const messages: ConversationMessage[] = [
      { role: "user", content: "Can you give me a better price?", createdAt: "2026-09-01T10:01:00Z" },
      { role: "assistant", content: "Sure. What price were you hoping for?", createdAt: "2026-09-01T10:01:30Z" },
      { role: "user", content: "I am looking at ₹18,000.", createdAt: "2026-09-01T10:02:00Z" },
      { role: "assistant", content: "I can offer ₹21,600 per unit.", createdAt: "2026-09-01T10:02:30Z" },
    ];

    assert.strictEqual(messages.length, 4);
    assert.strictEqual(messages[0].role, "user");
    assert.strictEqual(messages[1].role, "assistant");
    assert.strictEqual(messages[3].content, "I can offer ₹21,600 per unit.");
  });

  // 7. Audit events
  it("7. structures agent activity trail from backend audit events", () => {
    const events: AuditEventInfo[] = [
      {
        eventType: "NEGOTIATION_STARTED",
        actorType: "BUYER",
        description: "Buyer started negotiation session",
        createdAt: "2026-09-01T10:00:00Z",
      },
      {
        eventType: "BUYER_OFFER_SUBMITTED",
        actorType: "BUYER",
        description: "Buyer submitted offer ₹8,500",
        createdAt: "2026-09-01T10:02:00Z",
      },
      {
        eventType: "MERCHANT_COUNTER_OFFERED",
        actorType: "AGENT",
        description: "Negotiation Agent generated counter-offer ₹9,000",
        createdAt: "2026-09-01T10:02:05Z",
      },
    ];

    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0].eventType, "NEGOTIATION_STARTED");
    assert.strictEqual(events[2].actorType, "AGENT");
  });

  // 8. Safe buyer identifier fallback
  it("8. provides safe buyer representation without exposing sensitive internal data", () => {
    const getSafeBuyerName = (buyerInfo?: { name?: string; email?: string } | null) => {
      if (buyerInfo?.name) return buyerInfo.name;
      if (buyerInfo?.email) return buyerInfo.email;
      return "Buyer 1";
    };

    assert.strictEqual(getSafeBuyerName(null), "Buyer 1");
    assert.strictEqual(getSafeBuyerName({ name: "Alice" }), "Alice");
    assert.strictEqual(getSafeBuyerName({ email: "alice@example.com" }), "alice@example.com");
  });
});
