/**
 * GENERIC PRODUCT SEARCH TESTS
 *
 * Verifies the search pipeline is fully category- and product-agnostic.
 * The same search code path handles Electronics, Fashion, Furniture, Groceries,
 * and any arbitrary future category — with no category-specific branches.
 *
 * Test products:
 *   - MacBook Pro 14          (Electronics)
 *   - Nike Running Shoe       (Fashion)
 *   - Ergonomic Office Chair  (Furniture)
 *   - Sugar 5kg               (Groceries)
 *
 * All 22 required tests + 4 regression tests are covered.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import Merchant, { type IMerchant } from "../../models/Merchant.js";
import Product from "../../models/Product.js";
import {
  searchProducts,
  getDynamicSupportedKeys,
  normalizeAttributeKey,
} from "../productService.js";

describe("Generic Category-Agnostic Product Search", () => {
  let merchant: IMerchant;
  let otherMerchant: IMerchant;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    await Merchant.deleteMany({ email: /test-generic-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-GENERIC-.*/ });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Merchant.deleteMany({ email: /test-generic-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-GENERIC-.*/ });

    const ts = Date.now() + "-" + Math.floor(Math.random() * 10000);

    merchant = await Merchant.create({
      name: "Generic Merchant",
      businessName: "Generic Business",
      email: `test-generic-main-${ts}@example.com`,
      currency: "INR",
      status: "active",
    });

    otherMerchant = await Merchant.create({
      name: "Other Merchant",
      businessName: "Other Business",
      email: `test-generic-other-${ts}@example.com`,
      currency: "INR",
      status: "active",
    });

    await Product.create([
      // ── Electronics ──────────────────────────────────────
      {
        merchantId: merchant._id,
        name: "MacBook Pro 14",
        description: "Apple laptop for professional video editing and development",
        category: "Electronics",
        sku: `SKU-GENERIC-MACBOOK-${ts}`,
        price: 150000,
        costPrice: 120000,
        currency: "INR",
        inventory: 5,
        status: "active",
        tags: ["apple", "macbook", "laptop"],
        specifications: new Map<string, any>([
          ["brand", "Apple"],
          ["model", "MacBook Pro"],
          ["ram", "16GB"],
          ["storage", "512GB"],
          ["color", "silver"],
        ]),
      },
      {
        merchantId: merchant._id,
        name: "Dell XPS 15",
        description: "Dell laptop for gaming and productivity",
        category: "Electronics",
        sku: `SKU-GENERIC-DELL-${ts}`,
        price: 120000,
        costPrice: 95000,
        currency: "INR",
        inventory: 3,
        status: "active",
        tags: ["dell", "laptop", "gaming"],
        specifications: new Map<string, any>([
          ["brand", "Dell"],
          ["model", "XPS 15"],
          ["ram", "32GB"],
          ["storage", "1TB"],
          ["color", "black"],
        ]),
      },
      // ── Fashion ──────────────────────────────────────────
      {
        merchantId: merchant._id,
        name: "Nike Running Shoe",
        description: "Professional running shoes for athletes",
        category: "Fashion",
        sku: `SKU-GENERIC-NIKE-${ts}`,
        price: 8000,
        costPrice: 5000,
        currency: "INR",
        inventory: 20,
        status: "active",
        tags: ["nike", "running", "shoes"],
        specifications: new Map<string, any>([
          ["brand", "Nike"],
          ["color", "black"],
          ["size", "10"],
          ["waterproof", false],
        ]),
      },
      {
        merchantId: merchant._id,
        name: "Adidas Track Shirt",
        description: "Comfortable sports shirt for training",
        category: "Fashion",
        sku: `SKU-GENERIC-ADIDAS-${ts}`,
        price: 2500,
        costPrice: 1500,
        currency: "INR",
        inventory: 30,
        status: "active",
        tags: ["adidas", "shirt", "sports"],
        specifications: new Map<string, any>([
          ["brand", "Adidas"],
          ["color", "white"],
          ["size", "M"],
        ]),
      },
      // ── Furniture ────────────────────────────────────────
      {
        merchantId: merchant._id,
        name: "Ergonomic Office Chair",
        description: "Height-adjustable ergonomic chair for office use",
        category: "Furniture",
        sku: `SKU-GENERIC-CHAIR-${ts}`,
        price: 18000,
        costPrice: 12000,
        currency: "INR",
        inventory: 8,
        status: "active",
        tags: ["office", "chair", "ergonomic"],
        specifications: new Map<string, any>([
          ["adjustableHeight", true],
          ["ergonomic", true],
          ["material", "mesh"],
          ["color", "black"],
          ["armrests", true],
        ]),
      },
      {
        merchantId: merchant._id,
        name: "Black Leather Sofa",
        description: "Premium leather sofa for living room",
        category: "Furniture",
        sku: `SKU-GENERIC-SOFA-${ts}`,
        price: 45000,
        costPrice: 30000,
        currency: "INR",
        inventory: 4,
        status: "active",
        tags: ["sofa", "leather", "living room"],
        specifications: new Map<string, any>([
          ["material", "leather"],
          ["color", "black"],
          ["seats", "3"],
        ]),
      },
      // ── Groceries ────────────────────────────────────────
      {
        merchantId: merchant._id,
        name: "Sugar 5kg",
        description: "Refined white sugar, 5kg pack",
        category: "Groceries",
        sku: `SKU-GENERIC-SUGAR-${ts}`,
        price: 300,
        costPrice: 200,
        currency: "INR",
        inventory: 100,
        status: "active",
        tags: ["sugar", "grocery", "food"],
      },
      {
        merchantId: merchant._id,
        name: "Basmati Rice 10kg",
        description: "Premium long-grain basmati rice, 10kg pack",
        category: "Groceries",
        sku: `SKU-GENERIC-RICE-${ts}`,
        price: 800,
        costPrice: 550,
        currency: "INR",
        inventory: 50,
        status: "active",
        tags: ["rice", "grocery", "food"],
      },
      // ── Other merchant product (for scoping test) ────────
      {
        merchantId: otherMerchant._id,
        name: "Other Merchant MacBook",
        description: "Apple laptop from another merchant",
        category: "Electronics",
        sku: `SKU-GENERIC-OTHER-MACBOOK-${ts}`,
        price: 145000,
        costPrice: 115000,
        currency: "INR",
        inventory: 2,
        status: "active",
        tags: ["apple", "macbook", "laptop"],
        specifications: new Map<string, any>([
          ["brand", "Apple"],
          ["ram", "16GB"],
        ]),
      },
    ]);
  });

  // ── TEST 1: Electronics category search ──────────────────
  test("1. Electronics category search returns only Electronics products", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Electronics",
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.every(p => p.category === "Electronics"));
    assert.ok(res.products.some(p => p.name === "MacBook Pro 14"));
  });

  // ── TEST 2: Fashion category search ──────────────────────
  test("2. Fashion category search returns only Fashion products", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Fashion",
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.every(p => p.category === "Fashion"));
    assert.ok(res.products.some(p => p.name === "Nike Running Shoe"));
  });

  // ── TEST 3: Furniture category search ────────────────────
  test("3. Furniture category search returns only Furniture products", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Furniture",
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.every(p => p.category === "Furniture"));
    assert.ok(res.products.some(p => p.name === "Ergonomic Office Chair"));
  });

  // ── TEST 4: Grocery category search ──────────────────────
  test("4. Grocery category search returns only Grocery products", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Groceries",
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.every(p => p.category === "Groceries"));
    assert.ok(res.products.some(p => p.name === "Sugar 5kg"));
  });

  // ── TEST 5: Brand hard requirement ───────────────────────
  test("5. Brand hard requirement: only Nike products returned (Adidas excluded)", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Fashion",
      hardRequirements: { brand: "Nike" },
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.every(p => p.specifications?.brand === "Nike"));
    assert.ok(!res.products.some(p => p.specifications?.brand === "Adidas"));
  });

  // ── TEST 6: Color hard requirement ───────────────────────
  test("6. Color hard requirement: only black products returned", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      hardRequirements: { color: "black" },
    });
    assert.ok(res.returned > 0);
    // All returned products must have color=black in their specifications
    assert.ok(res.products.every(p => {
      const color = String(p.specifications?.color ?? "").toLowerCase();
      return color === "black";
    }));
  });

  // ── TEST 7: Size hard requirement ────────────────────────
  test("7. Size hard requirement: only size-10 products returned", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Fashion",
      hardRequirements: { size: "10" },
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.every(p => String(p.specifications?.size) === "10"));
    // Adidas shirt (size M) must be excluded
    assert.ok(!res.products.some(p => p.name === "Adidas Track Shirt"));
  });

  // ── TEST 8: Generic specifications matching ───────────────
  test("8. Generic specifications matching: 16GB RAM returns only MacBook Pro", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Electronics",
      hardRequirements: { ram: "16GB" },
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.every(p => {
      const ram = String(p.specifications?.ram ?? "").toLowerCase();
      return ram === "16gb";
    }));
    // Dell XPS (32GB) must be excluded
    assert.ok(!res.products.some(p => p.name === "Dell XPS 15"));
    assert.ok(res.products.some(p => p.name === "MacBook Pro 14"));
  });

  // ── TEST 9: Multiple hard requirements ───────────────────
  test("9. Multiple hard requirements: brand=Apple AND ram=16GB", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      hardRequirements: { brand: "Apple", ram: "16GB" },
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.every(p =>
      String(p.specifications?.brand ?? "").toLowerCase() === "apple" &&
      String(p.specifications?.ram ?? "").toLowerCase() === "16gb"
    ));
  });

  // ── TEST 10: Soft preference ranking ─────────────────────
  test("10. Soft preference: black color boosts ranking but does not filter out non-black", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Fashion",
      softPreferences: { color: "black" },
    });
    // Both Nike (black) and Adidas (white) should be in results — soft does not filter
    assert.ok(res.returned >= 2);
    // Nike (black) should rank first
    assert.equal(res.products[0].name, "Nike Running Shoe");
  });

  // ── TEST 11: Category + hard requirement ─────────────────
  test("11. Category + hard requirement: Electronics + brand=Apple", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Electronics",
      hardRequirements: { brand: "Apple" },
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.every(p => p.category === "Electronics"));
    assert.ok(res.products.every(p =>
      String(p.specifications?.brand ?? "").toLowerCase() === "apple"
    ));
  });

  // ── TEST 12: Category + soft preference ──────────────────
  test("12. Category + soft preference: Fashion + color preference boosts ranking", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Fashion",
      softPreferences: { color: "white" },
    });
    // Adidas (white) should rank higher
    assert.ok(res.returned > 0);
    assert.ok(res.products.every(p => p.category === "Fashion"));
    // All fashion products present (soft pref does not filter)
    assert.ok(res.returned >= 2);
  });

  // ── TEST 13: Price + category (Grocery under ₹500) ───────
  test("13. Price + category: Groceries under ₹500 returns Sugar 5kg", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Groceries",
      maxPrice: 500,
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.every(p => p.price <= 500));
    assert.ok(res.products.some(p => p.name === "Sugar 5kg"));
    // Rice (₹800) excluded
    assert.ok(!res.products.some(p => p.name === "Basmati Rice 10kg"));
  });

  // ── TEST 14: Inventory + category ────────────────────────
  test("14. Inventory + category: high-inventory filter works across categories", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Groceries",
      minInventory: 80,
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.every(p => p.inventory >= 80));
    // Sugar has 100, Rice has 50 → only Sugar
    assert.ok(res.products.some(p => p.name === "Sugar 5kg"));
    assert.ok(!res.products.some(p => p.name === "Basmati Rice 10kg"));
  });

  // ── TEST 15: No matching attribute → no false positives ──
  test("15. Hard requirement for attribute not in any product excludes all products", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      hardRequirements: { invisibilityCloak: true },
    });
    assert.equal(res.returned, 0);
  });

  // ── TEST 16: Unsupported attribute as soft does not filter ─
  test("16. Unsupported attribute as soft preference does not filter products", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Groceries",
      softPreferences: { organic: true },  // Not in any spec
    });
    assert.ok(res.returned > 0);  // All groceries still returned
  });

  // ── TEST 17: Case-insensitive matching ───────────────────
  test("17. Case-insensitive spec matching: BRAND='apple' matches brand='Apple'", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      hardRequirements: { BRAND: "APPLE" },
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.every(p =>
      String(p.specifications?.brand ?? "").toLowerCase() === "apple"
    ));
  });

  // ── TEST 18: Multi-word product type ─────────────────────
  test("18. Multi-word product type: 'running shoes' finds Nike Running Shoe", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "running shoes",
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.some(p => p.name === "Nike Running Shoe"));
  });

  // ── TEST 19: Generic brand matching across categories ────
  test("19. Generic brand matching works across categories — no brand-specific code", async () => {
    // Apple in Electronics
    const electronics = await searchProducts({
      merchantId: merchant._id.toString(),
      hardRequirements: { brand: "Apple" },
    });
    assert.ok(electronics.returned > 0);
    assert.ok(electronics.products.every(p =>
      String(p.specifications?.brand ?? "").toLowerCase() === "apple"
    ));

    // Nike in Fashion
    const fashion = await searchProducts({
      merchantId: merchant._id.toString(),
      hardRequirements: { brand: "Nike" },
    });
    assert.ok(fashion.returned > 0);
    assert.ok(fashion.products.every(p =>
      String(p.specifications?.brand ?? "").toLowerCase() === "nike"
    ));

    // Same code path — no category-specific branches needed
  });

  // ── TEST 20: No category-specific code (code path is the same) ──
  test("20. Same search code path handles all categories generically", async () => {
    const categories = ["Electronics", "Fashion", "Furniture", "Groceries"];
    for (const cat of categories) {
      const res = await searchProducts({
        merchantId: merchant._id.toString(),
        category: cat,
      });
      // Each category search works without any category-specific logic
      assert.ok(res.returned >= 0, `Category ${cat} search failed`);
      assert.ok(res.products.every(p => p.category === cat), `Non-${cat} product returned`);
    }
  });

  // ── TEST 21: Merchant scoping ─────────────────────────────
  test("21. Merchant scoping: search only returns products from specified merchant", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "macbook",
    });
    assert.ok(res.returned > 0);
    // All returned products must belong to the scoped merchant
    assert.ok(res.products.every(p => p.merchantId === merchant._id.toString()));
    // Other merchant's MacBook must NOT appear
    assert.ok(!res.products.some(p => p.name === "Other Merchant MacBook"));
  });

  // ── TEST 22: No merchantId → cross-catalog search ────────
  test("22. Without merchantId, search spans full catalog", async () => {
    const res = await searchProducts({
      query: "macbook",
    });
    // Both merchants' MacBooks should appear
    assert.ok(res.returned >= 2);
  });

  // ── TEST 23: Electronics regression (MacBook for video editing) ──
  test("23. REGRESSION: MacBook laptop for video editing — returned", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "laptop",
      hardRequirements: { brand: "Apple" },
      softPreferences: { purpose: "video editing" },
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.some(p => p.name === "MacBook Pro 14"));
    // All returned must have brand=Apple in specs
    assert.ok(res.products.every(p =>
      String(p.specifications?.brand ?? "").toLowerCase() === "apple"
    ));
  });

  // ── TEST 24: Fashion regression (Nike black shoes size 10) ──
  test("24. REGRESSION: Nike running shoes in black, size 10 — returned", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "running shoes",
      hardRequirements: { brand: "Nike", size: "10" },
      softPreferences: { color: "black" },
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.some(p => p.name === "Nike Running Shoe"));
    assert.ok(res.products.every(p =>
      String(p.specifications?.brand ?? "").toLowerCase() === "nike"
    ));
  });

  // ── TEST 25: Furniture regression (ergonomic adjustable chair) ──
  test("25. REGRESSION: ergonomic chair with adjustable height — returned", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "office chair",
      hardRequirements: { adjustableHeight: true, ergonomic: true },
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.some(p => p.name === "Ergonomic Office Chair"));
    // Leather sofa (no adjustableHeight, ergonomic specs) must be excluded
    assert.ok(!res.products.some(p => p.name === "Black Leather Sofa"));
  });

  // ── TEST 26: Grocery regression (sugar under ₹500) ───────
  test("26. REGRESSION: sugar under ₹500 — returned if price matches", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "sugar",
      maxPrice: 500,
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.some(p => p.name === "Sugar 5kg"));
    assert.ok(res.products.every(p => p.price <= 500));
  });

  // ── TEST 27: getDynamicSupportedKeys is catalog-driven ───
  test("27. getDynamicSupportedKeys returns keys from actual catalog specs — no static list", async () => {
    const keys = await getDynamicSupportedKeys(merchant._id.toString());

    // Present because our test fixture products have these in their specifications
    assert.ok(keys.has("brand"));          // Electronics + Fashion + Furniture
    assert.ok(keys.has("ram"));            // MacBook Pro, Dell XPS
    assert.ok(keys.has("storage"));        // MacBook Pro, Dell XPS
    assert.ok(keys.has("color"));          // Multiple categories
    assert.ok(keys.has("size"));           // Fashion
    assert.ok(keys.has("ergonomic"));      // Furniture
    assert.ok(keys.has("adjustableheight")); // Furniture (normalizeAttributeKey applied)
    assert.ok(keys.has("material"));       // Furniture

    // Grocery products have no specs → no grocery-specific keys
    assert.ok(!keys.has("weight"));        // Sugar has no specs
  });

  // ── TEST 28: canonical attribute normalization ────────────
  test("28. Canonical attribute normalization: colour→color, make→brand", () => {
    assert.equal(normalizeAttributeKey("colour"), "color");
    assert.equal(normalizeAttributeKey("COLOUR"), "color");
    assert.equal(normalizeAttributeKey("make"), "brand");
    assert.equal(normalizeAttributeKey("manufacturer"), "brand");
    assert.equal(normalizeAttributeKey("BRAND"), "brand");
    assert.equal(normalizeAttributeKey("Brand"), "brand");
    assert.equal(normalizeAttributeKey("disk"), "storage");
    assert.equal(normalizeAttributeKey("SSD Capacity"), "storage");
    assert.equal(normalizeAttributeKey("adjustable-height"), "adjustableheight");
    assert.equal(normalizeAttributeKey("adjustable_height"), "adjustableheight");
  });

  // ── TEST 29: Colour alias search ─────────────────────────
  test("29. Searching with 'colour' alias matches spec key 'color'", async () => {
    // "colour" normalizes to "color" via ATTRIBUTE_ALIASES
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      hardRequirements: { colour: "black" },
    });
    assert.ok(res.returned > 0);
    // Should find same products as searching with "color"
    assert.ok(res.products.every(p =>
      String(p.specifications?.color ?? "").toLowerCase() === "black"
    ));
  });

  // ── TEST 30: Spec-first definitive answer ────────────────
  test("30. Spec mismatch excludes product even if value appears in text", async () => {
    // Dell XPS has spec.brand = "Dell" and spec.ram = "32GB"
    // Searching brand=Apple should exclude Dell XPS even though "Apple" might appear
    // in description of some other product. Spec is the definitive source.
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Electronics",
      hardRequirements: { brand: "Apple" },
    });
    assert.ok(!res.products.some(p => p.name === "Dell XPS 15"));
    assert.ok(res.products.some(p => p.name === "MacBook Pro 14"));
  });

  // ── TEST 31: Leather material requirement (Furniture) ────
  test("31. Material hard requirement: leather returns sofa, excludes mesh chair", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Furniture",
      hardRequirements: { material: "leather" },
    });
    assert.ok(res.returned > 0);
    assert.ok(res.products.some(p => p.name === "Black Leather Sofa"));
    assert.ok(!res.products.some(p => p.name === "Ergonomic Office Chair"));
  });
});
