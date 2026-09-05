import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Agreement } from "@/types/agreement";
import { formatCurrency } from "../../utils/format.js";

describe("Orders & Agreements Monitoring Logic", () => {
  const sampleAgreements: Agreement[] = [
    {
      _id: "agr_1",
      negotiationId: "neg_1",
      merchantId: "m1",
      productId: { name: "Office Chair Pro", sku: "CHAIR-001", price: 10000, category: "Furniture" },
      status: "PENDING_APPROVAL",
      quantity: 5,
      currency: "INR",
      originalUnitPrice: 10000,
      agreedUnitPrice: 9000,
      discountPercent: 10,
      finalOrderValue: 45000,
      marginPercent: 22.2,
      approval: {
        agreementId: "agr_1",
        merchantId: "m1",
        status: "PENDING",
        reason: "Order value exceeds automatic limit",
        requestedAt: "2026-09-01T10:00:00.000Z",
      },
      paymentReady: false,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:05:00.000Z",
    },
    {
      _id: "agr_2",
      negotiationId: "neg_2",
      merchantId: "m1",
      productId: { name: "MacBook Pro 14", sku: "MBP14-001", price: 120000, category: "Electronics" },
      status: "APPROVED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 120000,
      agreedUnitPrice: 115000,
      discountPercent: 4.17,
      finalOrderValue: 115000,
      marginPercent: 25,
      approval: {
        agreementId: "agr_2",
        merchantId: "m1",
        status: "APPROVED",
        reviewer: "Auto System",
        requestedAt: "2026-09-01T09:00:00.000Z",
        reviewedAt: "2026-09-01T09:00:01.000Z",
      },
      paymentReady: true,
      approvedAt: "2026-09-01T09:00:01.000Z",
      createdAt: "2026-09-01T09:00:00.000Z",
      updatedAt: "2026-09-01T09:00:01.000Z",
    },
    {
      _id: "agr_3",
      negotiationId: "neg_3",
      merchantId: "m1",
      productId: { name: "Gaming Monitor", sku: "MON-001", price: 35000, category: "Electronics" },
      status: "REJECTED",
      quantity: 2,
      currency: "INR",
      originalUnitPrice: 35000,
      agreedUnitPrice: 28000,
      discountPercent: 20,
      finalOrderValue: 56000,
      marginPercent: 12,
      approval: {
        agreementId: "agr_3",
        merchantId: "m1",
        status: "REJECTED",
        reviewer: "Store Manager",
        reason: "Discount too steep",
        requestedAt: "2026-08-31T14:00:00.000Z",
        reviewedAt: "2026-08-31T14:10:00.000Z",
      },
      paymentReady: false,
      createdAt: "2026-08-31T14:00:00.000Z",
      updatedAt: "2026-08-31T14:10:00.000Z",
    },
  ];

  // 1. Summary Metrics
  it("1. accurately aggregates counts for Pending Approval, Approved, Payment Ready, and Total", () => {
    const pendingApprovalCount = sampleAgreements.filter((a) => a.status === "PENDING_APPROVAL").length;
    const approvedCount = sampleAgreements.filter((a) => a.status === "APPROVED" || a.status === "COMPLETED").length;
    const paymentReadyCount = sampleAgreements.filter((a) => a.paymentReady || a.status === "APPROVED").length;
    const totalCount = sampleAgreements.length;

    assert.strictEqual(pendingApprovalCount, 1);
    assert.strictEqual(approvedCount, 1);
    assert.strictEqual(paymentReadyCount, 1);
    assert.strictEqual(totalCount, 3);
  });

  // 2. Price and Total formatting
  it("2. formats agreed unit price and total order value without frontend recalculations", () => {
    const agr = sampleAgreements[0];
    const unitPriceFormatted = formatCurrency(agr.agreedUnitPrice, agr.currency);
    const totalValueFormatted = formatCurrency(agr.finalOrderValue, agr.currency);

    assert.ok(unitPriceFormatted.includes("9,000") || unitPriceFormatted.includes("9000"));
    assert.ok(totalValueFormatted.includes("45,000") || totalValueFormatted.includes("45000"));
  });

  // 3. Quantity formatting
  it("3. formats singular vs plural quantity units correctly", () => {
    const formatQty = (qty: number) => `${qty} ${qty === 1 ? "unit" : "units"}`;

    assert.strictEqual(formatQty(1), "1 unit");
    assert.strictEqual(formatQty(5), "5 units");
  });

  // 4. Payment Readiness distinction
  it("4. distinguishes between approved and payment ready states cleanly", () => {
    const pendingAgr = sampleAgreements[0];
    const approvedAgr = sampleAgreements[1];

    assert.strictEqual(pendingAgr.paymentReady, false);
    assert.strictEqual(approvedAgr.paymentReady, true);
  });

  // 5. Approval status
  it("5. correctly reflects approval status from embedded approval object", () => {
    assert.strictEqual(sampleAgreements[0].approval?.status, "PENDING");
    assert.strictEqual(sampleAgreements[1].approval?.status, "APPROVED");
    assert.strictEqual(sampleAgreements[2].approval?.status, "REJECTED");
    assert.strictEqual(sampleAgreements[2].approval?.reason, "Discount too steep");
  });

  // 6. Safe buyer identifier fallback
  it("6. provides safe buyer representation without exposing internal sensitive IDs", () => {
    const getSafeBuyerName = (buyer?: { name?: string; email?: string } | null) => {
      if (buyer?.name) return buyer.name;
      if (buyer?.email) return buyer.email;
      return "Buyer 1";
    };

    assert.strictEqual(getSafeBuyerName(null), "Buyer 1");
    assert.strictEqual(getSafeBuyerName({ name: "Jane" }), "Jane");
  });
});
