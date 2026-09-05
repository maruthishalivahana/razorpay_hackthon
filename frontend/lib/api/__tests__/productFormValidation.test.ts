import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Product, ProductSpecification, SpecificationValue } from "@/types/product";

const RESERVED_KEYS = new Set([
  "name",
  "description",
  "category",
  "sku",
  "price",
  "costprice",
  "currency",
  "inventory",
  "deliverydays",
  "tags",
  "imageurl",
  "isnegotiable",
  "status",
  "merchantid",
  "id",
  "_id",
]);

/**
 * Pure helper function mirroring ProductFormDialog's validation and transformation logic.
 */
function validateAndBuildPayload({
  name,
  description,
  sku,
  category,
  price,
  costPrice,
  currency = "INR",
  inventory = 0,
  deliveryDays = 3,
  isNegotiable = true,
  status = "active",
  imageUrl = "",
  merchantId = "m123",
  tags = [],
  specifications = [],
}: {
  name: string;
  description: string;
  sku: string;
  category: string;
  price: number;
  costPrice?: number;
  currency?: string;
  inventory?: number;
  deliveryDays?: number;
  isNegotiable?: boolean;
  status?: string;
  imageUrl?: string;
  merchantId?: string;
  tags?: string[];
  specifications?: ProductSpecification[];
}): {
  valid: boolean;
  errors: Record<string, string>;
  payload: Partial<Product> | null;
} {
  const errors: Record<string, string> = {};

  if (!name.trim() || name.length < 2) errors.name = "Name must be at least 2 characters.";
  if (!description.trim()) errors.description = "Description is required.";
  if (!sku.trim()) errors.sku = "SKU is required.";
  if (!category.trim()) errors.category = "Category is required.";
  if (isNaN(price) || price <= 0) errors.price = "Price must be greater than 0.";

  const seenKeys = new Set<string>();
  for (let i = 0; i < specifications.length; i++) {
    const spec = specifications[i];
    const trimmedKey = spec.key.trim();

    if (!trimmedKey) {
      errors[`spec_${i}`] = "Attribute name cannot be empty.";
      continue;
    }

    const normalized = trimmedKey.toLowerCase().replace(/[\s_-]+/g, "");
    if (RESERVED_KEYS.has(normalized)) {
      errors[`spec_${i}`] = "This attribute is already represented by a product field.";
      continue;
    }

    if (seenKeys.has(normalized)) {
      errors[`spec_${i}`] = `Duplicate attribute name "${trimmedKey}".`;
      continue;
    }
    seenKeys.add(normalized);

    if (spec.type === "string" && typeof spec.value === "string" && !spec.value.trim()) {
      errors[`spec_${i}`] = "Value cannot be empty.";
    } else if (spec.type === "number" && (typeof spec.value !== "number" || isNaN(spec.value))) {
      errors[`spec_${i}`] = "Value must be a valid number.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, payload: null };
  }

  const specsRecord: Record<string, SpecificationValue> = {};
  for (const spec of specifications) {
    const k = spec.key.trim();
    if (k) {
      if (spec.type === "number") {
        specsRecord[k] = Number(spec.value);
      } else if (spec.type === "boolean") {
        specsRecord[k] = Boolean(spec.value);
      } else {
        specsRecord[k] = String(spec.value).trim();
      }
    }
  }

  const payload: Partial<Product> = {
    merchantId,
    name: name.trim(),
    description: description.trim(),
    sku: sku.trim().toUpperCase(),
    category: category.trim(),
    price,
    costPrice: costPrice ?? Math.round(price * 0.7),
    currency,
    inventory,
    deliveryDays,
    tags: tags.map((t) => t.trim()).filter(Boolean),
    specifications: specsRecord,
    isNegotiable,
    status,
    imageUrl: imageUrl.trim() || undefined,
  };

  return { valid: true, errors: {}, payload };
}

describe("Product Form Validation & Specification Transformation", () => {
  it("1. Successfully creates payload with tags and structured specifications", () => {
    const result = validateAndBuildPayload({
      name: "MacBook Pro 14",
      description: "Apple laptop suitable for professional video editing",
      sku: "MBP14-001",
      category: "Electronics",
      price: 120000,
      costPrice: 95000,
      tags: ["apple", "macbook", "laptop", "editing"],
      specifications: [
        { key: "brand", value: "Apple", type: "string" },
        { key: "model", value: "MacBook Pro", type: "string" },
        { key: "ram", value: "16GB", type: "string" },
        { key: "storage", value: "512GB", type: "string" },
        { key: "screenSize", value: 14, type: "number" },
        { key: "touchscreen", value: false, type: "boolean" },
      ],
    });

    assert.equal(result.valid, true);
    assert.ok(result.payload);
    assert.deepEqual(result.payload.tags, ["apple", "macbook", "laptop", "editing"]);
    assert.strictEqual(result.payload.specifications?.brand, "Apple");
    assert.strictEqual(result.payload.specifications?.ram, "16GB");
    assert.strictEqual(result.payload.specifications?.screenSize, 14);
    assert.strictEqual(result.payload.specifications?.touchscreen, false);
  });

  it("2. Prevents duplicate specification keys (case-insensitive: brand, Brand, BRAND)", () => {
    const result = validateAndBuildPayload({
      name: "Test Laptop",
      description: "A test laptop",
      sku: "TEST-001",
      category: "Electronics",
      price: 50000,
      specifications: [
        { key: "brand", value: "Apple", type: "string" },
        { key: "BRAND", value: "Dell", type: "string" },
      ],
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.spec_1.includes('Duplicate attribute name "BRAND"'));
  });

  it("3. Prevents specification keys from colliding with core Product reserved fields", () => {
    const reservedTests = ["name", "price", "description", "category", "sku", "inventory", "tags"];

    for (const key of reservedTests) {
      const result = validateAndBuildPayload({
        name: "Test Product",
        description: "Test description",
        sku: "TEST-RES",
        category: "Test",
        price: 1000,
        specifications: [{ key, value: "some value", type: "string" }],
      });

      assert.equal(result.valid, false, `Expected collision error for key "${key}"`);
      assert.ok(
        result.errors.spec_0.includes("already represented by a product field"),
        `Error for "${key}" should indicate reserved field collision`
      );
    }
  });

  it("4. Prevents empty specification key when row exists", () => {
    const result = validateAndBuildPayload({
      name: "Test Product",
      description: "Test description",
      sku: "TEST-EMPTY",
      category: "Test",
      price: 1000,
      specifications: [{ key: "  ", value: "16GB", type: "string" }],
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.spec_0.includes("cannot be empty"));
  });

  it("5. Supports completely empty tags and empty specifications", () => {
    const result = validateAndBuildPayload({
      name: "Simple Grocery Item",
      description: "Refined sugar 5kg",
      sku: "SUGAR-5KG",
      category: "Groceries",
      price: 300,
      tags: [],
      specifications: [],
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.payload?.tags, []);
    assert.deepEqual(result.payload?.specifications, {});
  });

  it("6. Correctly parses and converts existing product specifications into form editor format", () => {
    const existingProduct: Product = {
      _id: "prod_1",
      merchantId: "m1",
      name: "Ergonomic Office Chair",
      description: "Chair with lumbar support",
      category: "Furniture",
      sku: "CHAIR-001",
      price: 15000,
      inventory: 10,
      deliveryDays: 3,
      isNegotiable: true,
      status: "active",
      tags: ["chair", "office", "ergonomic"],
      specifications: {
        ergonomic: true,
        adjustableHeight: true,
        weightCapacityKg: 150,
        material: "mesh",
      },
    };

    // Conversion to form specs list
    const specsList: ProductSpecification[] = Object.entries(
      existingProduct.specifications || {}
    ).map(([key, val]) => {
      let type: "string" | "number" | "boolean" = "string";
      if (typeof val === "boolean") type = "boolean";
      else if (typeof val === "number") type = "number";
      return { key, value: val, type };
    });

    assert.equal(specsList.length, 4);

    const ergonomicSpec = specsList.find((s) => s.key === "ergonomic");
    assert.strictEqual(ergonomicSpec?.type, "boolean");
    assert.strictEqual(ergonomicSpec?.value, true);

    const weightSpec = specsList.find((s) => s.key === "weightCapacityKg");
    assert.strictEqual(weightSpec?.type, "number");
    assert.strictEqual(weightSpec?.value, 150);

    const materialSpec = specsList.find((s) => s.key === "material");
    assert.strictEqual(materialSpec?.type, "string");
    assert.strictEqual(materialSpec?.value, "mesh");
  });

  it("7. Updates existing product specifications (e.g. changing ram to 32GB)", () => {
    const initialSpecs: ProductSpecification[] = [
      { key: "brand", value: "Apple", type: "string" },
      { key: "ram", value: "16GB", type: "string" },
    ];

    // Simulate merchant edit: change ram value to "32GB"
    const updatedSpecs = initialSpecs.map((s) =>
      s.key === "ram" ? { ...s, value: "32GB" } : s
    );

    const result = validateAndBuildPayload({
      name: "MacBook Pro 14",
      description: "Upgraded laptop",
      sku: "MBP14-001",
      category: "Electronics",
      price: 150000,
      specifications: updatedSpecs,
    });

    assert.equal(result.valid, true);
    assert.strictEqual(result.payload?.specifications?.ram, "32GB");
    assert.strictEqual(result.payload?.specifications?.brand, "Apple");
  });
});
