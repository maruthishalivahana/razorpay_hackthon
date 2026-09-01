import test from "node:test";
import assert from "node:assert/strict";
import { localFallbackIntent, parseIndianPrice, normalizeTopic } from "../intentNormalizer.js";
import { createEmptyState } from "../buyerState.js";

test("parseIndianPrice handles Indian currency shorthand", () => {
    assert.equal(parseIndianPrice("8k"), 8000);
    assert.equal(parseIndianPrice("10k"), 10000);
    assert.equal(parseIndianPrice("1.5k"), 1500);
    assert.equal(parseIndianPrice("₹8,000"), 8000);
    assert.equal(parseIndianPrice("50 thousand"), 50000);
    assert.equal(parseIndianPrice("1 lakh"), 100000);
    assert.equal(parseIndianPrice("1.5 lakh"), 150000);
    assert.equal(parseIndianPrice("2 crore"), 20000000);
});

test("local fallback preserves topic and adds budget when Gemini fails", () => {
    const state = { ...createEmptyState(), topic: "office chair" };
    const intent = localFallbackIntent("Under ₹8k", state);
    assert.equal(intent.type, "UPDATE_SEARCH");
    assert.equal(intent.updates.topic, undefined);
    assert.equal(intent.updates.maxPrice, 8000);
});

test("topic normalization trims articles and plural variations", () => {
    assert.equal(normalizeTopic("office chairs"), "office chair");
    assert.equal(normalizeTopic("laptops"), "laptop");
    assert.equal(normalizeTopic("I want an office chair"), "office chair");
    assert.equal(normalizeTopic("glass"), "glass");
});
