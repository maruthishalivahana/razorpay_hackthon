/**
 * buyerState.test.ts
 *
 * 30 tests for BuyerState mergeIntent logic.
 * These are pure unit tests — no DB, no Gemini calls required.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyState,
  mergeIntent,
  deriveSearchParams,
  type BuyerState,
  type BuyerIntent,
} from "../buyerState.js";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const makeIntent = (
  type: BuyerIntent["type"],
  updates: BuyerIntent["updates"] = {},
  extra: Partial<BuyerIntent> = {}
): BuyerIntent => ({ type, updates, clearFields: [], ...extra });

const stateWith = (overrides: Partial<BuyerState>): BuyerState => ({
  ...createEmptyState(),
  ...overrides,
});

// ─────────────────────────────────────────────────────────
// Group 1: createEmptyState
// ─────────────────────────────────────────────────────────

describe("createEmptyState", () => {
  test("TEST-STATE-01: creates state with all nulls and defaults", () => {
    const s = createEmptyState();
    assert.equal(s.topic, null);
    assert.equal(s.category, null);
    assert.equal(s.minPrice, null);
    assert.equal(s.maxPrice, null);
    assert.equal(s.quantity, null);
    assert.equal(s.sortBy, "relevance");
    assert.deepEqual(s.requirements, {});
    assert.deepEqual(s.lastProducts, []);
    assert.equal(s.lastQuery, null);
    assert.equal(s.turnCount, 0);
  });
});

// ─────────────────────────────────────────────────────────
// Group 2: NEW_SEARCH — resets state
// ─────────────────────────────────────────────────────────

describe("mergeIntent — NEW_SEARCH", () => {
  test("TEST-STATE-02: NEW_SEARCH sets topic and resets everything else", () => {
    const current = stateWith({
      topic: "laptop",
      maxPrice: 50000,
      quantity: 5,
      requirements: { ram: "16GB" },
      turnCount: 3,
    });
    const intent = makeIntent("NEW_SEARCH", { topic: "office chair" });
    const next = mergeIntent(current, intent);

    assert.equal(next.topic, "office chair");
    assert.equal(next.maxPrice, null);
    assert.equal(next.quantity, null);
    assert.deepEqual(next.requirements, {});
    assert.equal(next.turnCount, 4);
  });

  test("TEST-STATE-03: NEW_SEARCH with price sets the new price", () => {
    const current = stateWith({ topic: "laptop", maxPrice: 50000 });
    const intent = makeIntent("NEW_SEARCH", { topic: "desk", maxPrice: 20000 });
    const next = mergeIntent(current, intent);

    assert.equal(next.topic, "desk");
    assert.equal(next.maxPrice, 20000);
  });

  test("TEST-STATE-04: NEW_SEARCH clears lastProducts", () => {
    const current = stateWith({ topic: "laptop", lastProducts: [{ id: "1" } as any] });
    const intent = makeIntent("NEW_SEARCH", { topic: "chair" });
    const next = mergeIntent(current, intent);

    assert.deepEqual(next.lastProducts, []);
  });

  test("TEST-STATE-05: NEW_SEARCH without a topic leaves topic null", () => {
    const current = stateWith({ topic: "laptop" });
    const intent = makeIntent("NEW_SEARCH", {});
    const next = mergeIntent(current, intent);

    assert.equal(next.topic, null);
  });
});

// ─────────────────────────────────────────────────────────
// Group 3: UPDATE_SEARCH — merges fields
// ─────────────────────────────────────────────────────────

describe("mergeIntent — UPDATE_SEARCH", () => {
  test("TEST-STATE-06: UPDATE_SEARCH adds maxPrice to existing topic", () => {
    const current = stateWith({ topic: "office chair" });
    const intent = makeIntent("UPDATE_SEARCH", { maxPrice: 8000 });
    const next = mergeIntent(current, intent);

    assert.equal(next.topic, "office chair"); // preserved
    assert.equal(next.maxPrice, 8000);        // added
  });

  test("TEST-STATE-07: UPDATE_SEARCH adds quantity to existing topic", () => {
    const current = stateWith({ topic: "laptop", maxPrice: 50000 });
    const intent = makeIntent("UPDATE_SEARCH", { quantity: 5 });
    const next = mergeIntent(current, intent);

    assert.equal(next.topic, "laptop");
    assert.equal(next.maxPrice, 50000); // preserved
    assert.equal(next.quantity, 5);
  });

  test("TEST-STATE-08: UPDATE_SEARCH merges requirements additively", () => {
    const current = stateWith({
      topic: "laptop",
      requirements: { ram: "16GB" },
    });
    const intent = makeIntent("UPDATE_SEARCH", {
      requirements: { storage: "512GB SSD" },
    });
    const next = mergeIntent(current, intent);

    assert.equal(next.requirements.ram, "16GB");
    assert.equal(next.requirements.storage, "512GB SSD");
  });

  test("TEST-STATE-09: UPDATE_SEARCH can change sortBy", () => {
    const current = stateWith({ topic: "laptop" });
    const intent = makeIntent("UPDATE_SEARCH", { sortBy: "price_asc" });
    const next = mergeIntent(current, intent);

    assert.equal(next.sortBy, "price_asc");
  });

  test("TEST-STATE-10: UPDATE_SEARCH does not clear minPrice when only maxPrice is updated", () => {
    const current = stateWith({ topic: "laptop", minPrice: 30000, maxPrice: 60000 });
    const intent = makeIntent("UPDATE_SEARCH", { maxPrice: 55000 });
    const next = mergeIntent(current, intent);

    assert.equal(next.minPrice, 30000); // preserved
    assert.equal(next.maxPrice, 55000); // updated
  });

  test("TEST-STATE-11: UPDATE_SEARCH increments turnCount", () => {
    const current = stateWith({ topic: "laptop", turnCount: 2 });
    const intent = makeIntent("UPDATE_SEARCH", { maxPrice: 40000 });
    const next = mergeIntent(current, intent);

    assert.equal(next.turnCount, 3);
  });

  test("TEST-STATE-12: UPDATE_SEARCH with null value in update does NOT clear field", () => {
    // null in updates should NOT overwrite existing value (use clearFields for that)
    const current = stateWith({ topic: "laptop", maxPrice: 50000 });
    const intent = makeIntent("UPDATE_SEARCH", { maxPrice: null as any });
    const next = mergeIntent(current, intent);

    assert.equal(next.maxPrice, 50000); // preserved because null updates are ignored
  });
});

// ─────────────────────────────────────────────────────────
// Group 4: clearFields
// ─────────────────────────────────────────────────────────

describe("mergeIntent — clearFields", () => {
  test("TEST-STATE-13: clearFields removes maxPrice", () => {
    const current = stateWith({ topic: "laptop", maxPrice: 50000 });
    const intent: BuyerIntent = {
      type: "UPDATE_SEARCH",
      updates: {},
      clearFields: ["maxPrice"],
    };
    const next = mergeIntent(current, intent);

    assert.equal(next.maxPrice, null);
    assert.equal(next.topic, "laptop"); // preserved
  });

  test("TEST-STATE-14: clearFields clears requirements", () => {
    const current = stateWith({
      topic: "laptop",
      requirements: { ram: "16GB", storage: "512GB" },
    });
    const intent: BuyerIntent = {
      type: "UPDATE_SEARCH",
      updates: {},
      clearFields: ["requirements"],
    };
    const next = mergeIntent(current, intent);

    assert.deepEqual(next.requirements, {});
  });

  test("TEST-STATE-15: clearFields clears both minPrice and maxPrice", () => {
    const current = stateWith({ topic: "desk", minPrice: 5000, maxPrice: 20000 });
    const intent: BuyerIntent = {
      type: "UPDATE_SEARCH",
      updates: {},
      clearFields: ["minPrice", "maxPrice"],
    };
    const next = mergeIntent(current, intent);

    assert.equal(next.minPrice, null);
    assert.equal(next.maxPrice, null);
    assert.equal(next.topic, "desk");
  });

  test("TEST-STATE-16: clearFields resets sortBy to relevance", () => {
    const current = stateWith({ topic: "laptop", sortBy: "price_asc" });
    const intent: BuyerIntent = {
      type: "UPDATE_SEARCH",
      updates: {},
      clearFields: ["sortBy"],
    };
    const next = mergeIntent(current, intent);

    assert.equal(next.sortBy, "relevance");
  });
});

// ─────────────────────────────────────────────────────────
// Group 5: CLARIFICATION_REQUIRED and OUT_OF_SCOPE
// ─────────────────────────────────────────────────────────

describe("mergeIntent — CLARIFICATION_REQUIRED and OUT_OF_SCOPE", () => {
  test("TEST-STATE-17: CLARIFICATION_REQUIRED does not change topic or prices", () => {
    const current = stateWith({ topic: "laptop", maxPrice: 50000 });
    const intent = makeIntent("CLARIFICATION_REQUIRED", {}, {
      clarificationQuestion: "Do you want gaming or office laptops?",
    });
    const next = mergeIntent(current, intent);

    assert.equal(next.topic, "laptop");
    assert.equal(next.maxPrice, 50000);
    assert.equal(next.turnCount, current.turnCount + 1);
  });

  test("TEST-STATE-18: OUT_OF_SCOPE does not change commerce state", () => {
    const current = stateWith({ topic: "chair", quantity: 10 });
    const intent = makeIntent("OUT_OF_SCOPE", {}, {
      outOfScopeMessage: "I'm here to help you shop for products.",
    });
    const next = mergeIntent(current, intent);

    assert.equal(next.topic, "chair");
    assert.equal(next.quantity, 10);
    assert.equal(next.turnCount, current.turnCount + 1);
  });
});

// ─────────────────────────────────────────────────────────
// Group 6: deriveSearchParams
// ─────────────────────────────────────────────────────────

describe("deriveSearchParams", () => {
  test("TEST-STATE-19: derives query from topic", () => {
    const state = stateWith({ topic: "office chair" });
    const params = deriveSearchParams(state);

    assert.equal(params.query, "office chair");
  });

  test("TEST-STATE-20: omits null fields from params", () => {
    const state = stateWith({ topic: "laptop", maxPrice: null });
    const params = deriveSearchParams(state);

    assert.ok(!("maxPrice" in params));
  });

  test("TEST-STATE-21: includes all non-null fields", () => {
    const state = stateWith({
      topic: "laptop",
      category: "Laptop",
      minPrice: 30000,
      maxPrice: 60000,
      quantity: 2,
      sortBy: "price_asc",
      requirements: { ram: "16GB" },
    });
    const params = deriveSearchParams(state);

    assert.equal(params.query, "laptop");
    assert.equal(params.category, "Laptop");
    assert.equal(params.minPrice, 30000);
    assert.equal(params.maxPrice, 60000);
    assert.equal(params.quantity, 2);
    assert.equal(params.sortBy, "price_asc");
    assert.deepEqual(params.requirements, { ram: "16GB" });
  });

  test("TEST-STATE-22: empty requirements are not included", () => {
    const state = stateWith({ topic: "laptop", requirements: {} });
    const params = deriveSearchParams(state);

    assert.ok(!("requirements" in params));
  });

  test("TEST-STATE-23: returns sortBy always (default relevance)", () => {
    const state = createEmptyState();
    const params = deriveSearchParams(state);

    assert.equal(params.sortBy, "relevance");
  });
});

// ─────────────────────────────────────────────────────────
// Group 7: Multi-turn simulation sequences
// ─────────────────────────────────────────────────────────

describe("Multi-turn state simulation", () => {
  test("TEST-STATE-24: office chair → under 8k (classic follow-up)", () => {
    let state = createEmptyState();

    // Turn 1: "I want an office chair"
    state = mergeIntent(state, makeIntent("NEW_SEARCH", { topic: "office chair" }));
    assert.equal(state.topic, "office chair");
    assert.equal(state.maxPrice, null);

    // Turn 2: "Under ₹8,000"
    state = mergeIntent(state, makeIntent("UPDATE_SEARCH", { maxPrice: 8000 }));
    assert.equal(state.topic, "office chair"); // preserved
    assert.equal(state.maxPrice, 8000);        // added
  });

  test("TEST-STATE-25: laptop → 16GB RAM → under 50k → cheapest (chained refinements)", () => {
    let state = createEmptyState();

    state = mergeIntent(state, makeIntent("NEW_SEARCH", { topic: "laptop" }));
    state = mergeIntent(state, makeIntent("UPDATE_SEARCH", { requirements: { ram: "16GB" } }));
    state = mergeIntent(state, makeIntent("UPDATE_SEARCH", { maxPrice: 50000 }));
    state = mergeIntent(state, makeIntent("UPDATE_SEARCH", { sortBy: "price_asc" }));

    assert.equal(state.topic, "laptop");
    assert.equal(state.requirements.ram, "16GB");
    assert.equal(state.maxPrice, 50000);
    assert.equal(state.sortBy, "price_asc");
    assert.equal(state.turnCount, 4);
  });

  test("TEST-STATE-26: topic switch from laptop to desk resets constraints", () => {
    let state = createEmptyState();

    state = mergeIntent(state, makeIntent("NEW_SEARCH", { topic: "laptop", maxPrice: 50000 }));
    state = mergeIntent(state, makeIntent("UPDATE_SEARCH", { quantity: 5 }));

    // User now switches topic
    state = mergeIntent(state, makeIntent("NEW_SEARCH", { topic: "standing desk" }));

    assert.equal(state.topic, "standing desk");
    assert.equal(state.maxPrice, null); // cleared by NEW_SEARCH
    assert.equal(state.quantity, null); // cleared by NEW_SEARCH
    assert.equal(state.turnCount, 3);
  });

  test("TEST-STATE-27: explicit correction — quantity update overwrites previous", () => {
    let state = createEmptyState();

    state = mergeIntent(state, makeIntent("NEW_SEARCH", { topic: "chair", quantity: 10 }));
    state = mergeIntent(state, makeIntent("UPDATE_SEARCH", { quantity: 5 }));

    assert.equal(state.quantity, 5); // corrected
  });

  test("TEST-STATE-28: zero-result scenario preserves state (no auto-clear)", () => {
    let state = createEmptyState();
    state = mergeIntent(state, makeIntent("NEW_SEARCH", { topic: "laptop", maxPrice: 50000 }));

    // Simulating zero results: state should NOT be cleared
    // (In real flow, we just don't call mergeIntent with a reset)
    // The state remains intact for next refinement
    assert.equal(state.topic, "laptop");
    assert.equal(state.maxPrice, 50000);
  });

  test("TEST-STATE-29: pronoun follow-up (UPDATE_SEARCH with no topic change) preserves topic", () => {
    let state = createEmptyState();
    state = mergeIntent(state, makeIntent("NEW_SEARCH", { topic: "monitor" }));

    // "Show me the cheapest one" → UPDATE_SEARCH sortBy price_asc, no topic change
    state = mergeIntent(state, makeIntent("UPDATE_SEARCH", { sortBy: "price_asc" }));

    assert.equal(state.topic, "monitor"); // preserved
    assert.equal(state.sortBy, "price_asc");
  });

  test("TEST-STATE-30: multi-field update in a single turn", () => {
    let state = createEmptyState();
    state = mergeIntent(state, makeIntent("NEW_SEARCH", { topic: "laptop" }));
    state = mergeIntent(
      state,
      makeIntent("UPDATE_SEARCH", {
        minPrice: 40000,
        maxPrice: 70000,
        quantity: 3,
        sortBy: "price_desc",
        requirements: { display: "4K" },
      })
    );

    assert.equal(state.topic, "laptop");
    assert.equal(state.minPrice, 40000);
    assert.equal(state.maxPrice, 70000);
    assert.equal(state.quantity, 3);
    assert.equal(state.sortBy, "price_desc");
    assert.equal(state.requirements.display, "4K");
  });
});
