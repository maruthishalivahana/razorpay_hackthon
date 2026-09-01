import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatCurrency } from "../format.js";

describe("formatCurrency", () => {
  it("formats INR currency correctly", () => {
    assert.equal(formatCurrency(24000, "INR"), "₹24,000");
    assert.equal(formatCurrency(55000), "₹55,000");
    assert.equal(formatCurrency(0), "₹0");
  });

  it("formats foreign currency correctly", () => {
    const formattedUsd = formatCurrency(1000, "USD");
    assert.ok(formattedUsd.includes("1,000"));
  });
});
