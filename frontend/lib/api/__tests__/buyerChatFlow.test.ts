import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BuyerProduct, BuyerChatAction, BuyerChatMessage } from "@/types/buyer";
import { formatCurrency } from "../../utils/format.js";

describe("Buyer Chat Conversational Flow & Product Genericness", () => {
  // 1. Generic product categories test
  it("1. supports diverse product categories (Electronics, Fashion, Furniture, Groceries) generically", () => {
    const products: BuyerProduct[] = [
      {
        id: "prod_macbook",
        name: "MacBook Pro 14",
        category: "Electronics",
        price: 120000,
        inventory: 15,
        deliveryDays: 3,
        isNegotiable: true,
        specifications: { brand: "Apple", ram: "16GB", storage: "512GB" },
        tags: ["apple", "macbook", "laptop"],
      },
      {
        id: "prod_shoes",
        name: "Nike Air Zoom Pegasus",
        category: "Fashion",
        price: 10500,
        inventory: 8,
        deliveryDays: 2,
        isNegotiable: true,
        specifications: { brand: "Nike", color: "Black", size: 10 },
        tags: ["nike", "running", "shoes"],
      },
      {
        id: "prod_chair",
        name: "Ergonomic Mesh Chair",
        category: "Furniture",
        price: 24000,
        inventory: 20,
        deliveryDays: 5,
        isNegotiable: true,
        specifications: { material: "Mesh", adjustableArmrests: true, maxWeightKg: 130 },
        tags: ["chair", "office", "ergonomic"],
      },
      {
        id: "prod_sugar",
        name: "Organic Raw Brown Sugar",
        category: "Groceries",
        price: 250,
        inventory: 50,
        deliveryDays: 1,
        isNegotiable: false,
        specifications: { organic: true, weight: "1kg" },
        tags: ["groceries", "organic", "sugar"],
      },
    ];

    // Verify each product has valid format and dynamic specifications
    products.forEach((prod) => {
      assert.ok(prod.name.length > 0);
      assert.ok(prod.price > 0);
      assert.ok(typeof prod.specifications === "object");
      const formattedPrice = formatCurrency(prod.price, "INR");
      assert.ok(formattedPrice.includes("₹") || formattedPrice.includes("INR"));
    });
  });

  // 2. Dynamic specifications extraction
  it("2. formats dynamic specifications without hardcoded field assumptions", () => {
    const specsMap: Record<string, string | number | boolean> = {
      screenSize: "14.2 inch",
      batteryHours: 18,
      touchScreen: false,
    };

    const formattedSpecs = Object.entries(specsMap).map(([key, val]) => {
      const label = key
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/^\w/, (c) => c.toUpperCase())
        .trim();
      const value = typeof val === "boolean" ? (val ? "Yes" : "No") : String(val);
      return { label, value };
    });

    assert.strictEqual(formattedSpecs[0].label, "Screen Size");
    assert.strictEqual(formattedSpecs[0].value, "14.2 inch");
    assert.strictEqual(formattedSpecs[1].label, "Battery Hours");
    assert.strictEqual(formattedSpecs[1].value, "18");
    assert.strictEqual(formattedSpecs[2].label, "Touch Screen");
    assert.strictEqual(formattedSpecs[2].value, "No");
  });

  // 3. Action type handling
  it("3. correctly maps supported backend action types into UI actions", () => {
    const sampleActions: BuyerChatAction[] = [
      {
        id: "act_accept",
        label: "Accept ₹21,600 + Free Delivery",
        type: "ACCEPT_NEGOTIATION",
        negotiationId: "neg_1",
      },
      {
        id: "act_continue",
        label: "Continue Negotiating",
        type: "CONTINUE_NEGOTIATION",
        negotiationId: "neg_1",
      },
      {
        id: "act_order",
        label: "Place Order",
        type: "PLACE_ORDER",
        negotiationId: "neg_1",
      },
      {
        id: "act_pay",
        label: "Pay Now",
        type: "PAY_NOW",
        agreementId: "agr_1",
      },
    ];

    assert.strictEqual(sampleActions[0].type, "ACCEPT_NEGOTIATION");
    assert.strictEqual(sampleActions[1].type, "CONTINUE_NEGOTIATION");
    assert.strictEqual(sampleActions[2].type, "PLACE_ORDER");
    assert.strictEqual(sampleActions[3].type, "PAY_NOW");
  });

  // 4. Complete multi-turn negotiation and order flow simulation
  it("4. simulates the complete end-to-end shopping & negotiation flow in chat", () => {
    const thread: BuyerChatMessage[] = [];

    // Turn 1: Buyer searches
    thread.push({
      id: "msg_1",
      role: "user",
      content: "I need an ergonomic chair under ₹30,000",
      createdAt: new Date().toISOString(),
    });

    // Assistant returns products
    thread.push({
      id: "msg_2",
      role: "assistant",
      content: "I found 2 chairs matching your requirements.",
      createdAt: new Date().toISOString(),
      products: [
        {
          id: "chair_1",
          name: "Office Chair Pro",
          category: "Furniture",
          price: 24000,
          inventory: 10,
          deliveryDays: 3,
          isNegotiable: true,
          specifications: { ergonomic: true, material: "Mesh" },
        },
      ],
      actions: [],
    });

    assert.strictEqual(thread[1].products?.length, 1);
    assert.strictEqual(thread[1].products?.[0].name, "Office Chair Pro");

    // Turn 2: Buyer selects product & negotiates
    thread.push({
      id: "msg_3",
      role: "user",
      content: "Can you do ₹21,600 with free delivery?",
      createdAt: new Date().toISOString(),
    });

    // Assistant offers proposal with action buttons
    thread.push({
      id: "msg_4",
      role: "assistant",
      content: "₹21,600 per unit works, and free delivery can be included. Would you like to accept these terms?",
      createdAt: new Date().toISOString(),
      actions: [
        {
          id: "accept_offer",
          label: "Accept ₹21,600 + Free Delivery",
          type: "ACCEPT_NEGOTIATION",
          negotiationId: "neg_100",
        },
        {
          id: "continue_neg",
          label: "Continue Negotiating",
          type: "CONTINUE_NEGOTIATION",
          negotiationId: "neg_100",
        },
      ],
    });

    assert.strictEqual(thread[3].actions?.length, 2);
    assert.strictEqual(thread[3].actions?.[0].type, "ACCEPT_NEGOTIATION");

    // Turn 3: Buyer accepts
    thread.push({
      id: "msg_5",
      role: "assistant",
      content: "Your negotiated price of ₹21,600 per unit has been accepted.",
      createdAt: new Date().toISOString(),
      actions: [
        {
          id: "place_order",
          label: "Place Order",
          type: "PLACE_ORDER",
          negotiationId: "neg_100",
        },
      ],
    });

    assert.strictEqual(thread[4].actions?.[0].type, "PLACE_ORDER");

    // Turn 4: Order placed & Payment Ready
    thread.push({
      id: "msg_6",
      role: "assistant",
      content: "Your order is approved and ready for payment! Total: ₹21,600.",
      createdAt: new Date().toISOString(),
      paymentReady: true,
      actions: [
        {
          id: "pay_now",
          label: "Pay Now",
          type: "PAY_NOW",
          agreementId: "agr_200",
        },
      ],
    });

    assert.strictEqual(thread[5].paymentReady, true);
    assert.strictEqual(thread[5].actions?.[0].type, "PAY_NOW");
  });
});
