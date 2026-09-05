"use client";

import React, { useState } from "react";
import { X, Package, Save, Plus, AlertCircle, RefreshCw, Trash2, Tag, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createProduct, updateProduct } from "@/lib/api/products";
import type { Product, SpecificationValue, ProductSpecification } from "@/types/product";

interface ProductFormDialogProps {
  product: Product | null;
  merchantId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: (savedProduct?: Product) => void;
}

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
  "image",
  "isnegotiable",
  "status",
  "merchantid",
  "id",
  "_id",
]);

function parseInitialSpecifications(product: Product | null): ProductSpecification[] {
  if (!product?.specifications || typeof product.specifications !== "object") {
    return [];
  }
  return Object.entries(product.specifications).map(([key, val]) => {
    let type: "string" | "number" | "boolean" = "string";
    if (typeof val === "boolean") type = "boolean";
    else if (typeof val === "number") type = "number";
    return { key, value: val, type };
  });
}

function ProductFormModalContent({
  product,
  merchantId,
  onClose,
  onSuccess,
}: {
  product: Product | null;
  merchantId: string;
  onClose: () => void;
  onSuccess: (savedProduct?: Product) => void;
}) {
  const isEdit = Boolean(product && (product._id || product.id));

  // Basic Information
  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [sku, setSku] = useState(product?.sku || "");
  const [category, setCategory] = useState(product?.category || "Furniture");

  // Pricing
  const [price, setPrice] = useState<number | "">(product?.price ?? "");
  const [costPrice, setCostPrice] = useState<number | "">(
    product?.costPrice ?? (product?.price ? Math.round(product.price * 0.7) : "")
  );
  const [currency, setCurrency] = useState(product?.currency || "INR");

  // Inventory & Fulfillment
  const [inventory, setInventory] = useState<number | "">(product?.inventory ?? 10);
  const [isInventoryDirty, setIsInventoryDirty] = useState(false);
  const [deliveryDays, setDeliveryDays] = useState<number | "">(product?.deliveryDays ?? 3);

  // Discoverability: Tags
  const [tags, setTags] = useState<string[]>(
    Array.isArray(product?.tags) ? [...product.tags] : []
  );
  const [tagInput, setTagInput] = useState("");

  // Discoverability: Specifications
  const [specifications, setSpecifications] = useState<ProductSpecification[]>(() =>
    parseInitialSpecifications(product)
  );

  // Commerce & Media
  const [isNegotiable, setIsNegotiable] = useState(product?.isNegotiable ?? true);
  const [status] = useState(product?.status || "active");
  const [imageUrl, setImageUrl] = useState(
    product?.imageUrl || (product as unknown as Record<string, unknown>)?.image as string || ""
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Tag Handlers ──────────────────────────────────────────
  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;

    const exists = tags.some((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setTagInput("");
      return;
    }

    setTags([...tags, trimmed]);
    setTagInput("");
  };

  const handleRemoveTag = (indexToRemove: number) => {
    setTags(tags.filter((_, idx) => idx !== indexToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  // ── Specification Handlers ────────────────────────────────
  const handleAddSpecification = () => {
    setSpecifications([
      ...specifications,
      { key: "", value: "", type: "string" },
    ]);
  };

  const handleRemoveSpecification = (indexToRemove: number) => {
    setSpecifications(specifications.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSpecKeyChange = (index: number, newKey: string) => {
    const updated = [...specifications];
    updated[index] = { ...updated[index], key: newKey };
    setSpecifications(updated);
  };

  const handleSpecTypeChange = (
    index: number,
    newType: "string" | "number" | "boolean"
  ) => {
    const current = specifications[index];
    let defaultValue: SpecificationValue = "";
    if (newType === "boolean") {
      defaultValue = typeof current.value === "boolean" ? current.value : true;
    } else if (newType === "number") {
      defaultValue = typeof current.value === "number" ? current.value : 0;
    } else {
      defaultValue = String(current.value || "");
    }

    const updated = [...specifications];
    updated[index] = {
      ...current,
      type: newType,
      value: defaultValue,
    };
    setSpecifications(updated);
  };

  const handleSpecValueChange = (index: number, newValue: SpecificationValue) => {
    const updated = [...specifications];
    updated[index] = { ...updated[index], value: newValue };
    setSpecifications(updated);
  };

  // ── Validation ────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim() || name.length < 2) errs.name = "Name must be at least 2 characters.";
    if (!description.trim()) errs.description = "Description is required.";
    if (!sku.trim()) errs.sku = "SKU is required.";
    if (!category.trim()) errs.category = "Category is required.";

    const numericPrice = Number(price);
    if (isNaN(numericPrice) || numericPrice <= 0) errs.price = "Price must be greater than 0.";

    const numericCost = costPrice !== "" ? Number(costPrice) : Math.round(numericPrice * 0.7);
    if (isNaN(numericCost) || numericCost <= 0) errs.costPrice = "Cost price must be greater than 0.";

    const numericInv = Number(inventory);
    if (isNaN(numericInv) || numericInv < 0) errs.inventory = "Inventory cannot be negative.";

    const numericDeliv = Number(deliveryDays);
    if (isNaN(numericDeliv) || numericDeliv < 0) errs.deliveryDays = "Delivery days cannot be negative.";

    const seenKeys = new Set<string>();
    for (let i = 0; i < specifications.length; i++) {
      const spec = specifications[i];
      const trimmedKey = spec.key.trim();

      if (!trimmedKey) {
        errs[`spec_${i}`] = "Attribute name cannot be empty.";
        continue;
      }

      const normalized = trimmedKey.toLowerCase().replace(/[\s_-]+/g, "");
      if (RESERVED_KEYS.has(normalized)) {
        errs[`spec_${i}`] = "This attribute is already represented by a product field.";
        continue;
      }

      if (seenKeys.has(normalized)) {
        errs[`spec_${i}`] = `Duplicate attribute name "${trimmedKey}".`;
        continue;
      }
      seenKeys.add(normalized);

      if (spec.type === "string" && typeof spec.value === "string" && !spec.value.trim()) {
        errs[`spec_${i}`] = "Value cannot be empty.";
      } else if (spec.type === "number" && (typeof spec.value !== "number" || isNaN(spec.value))) {
        errs[`spec_${i}`] = "Value must be a valid number.";
      }
    }

    const trimmedImg = imageUrl.trim();
    if (trimmedImg) {
      try {
        const parsed = new URL(trimmedImg);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          errs.imageUrl = "Image URL must start with http:// or https://";
        }
      } catch {
        errs.imageUrl = "Please enter a valid URL (e.g. https://example.com/product.jpg)";
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || loading) return;

    try {
      setLoading(true);
      setError(null);

      const numericPrice = Number(price);
      const numericCost = costPrice !== "" ? Number(costPrice) : Math.round(numericPrice * 0.7);

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

      const trimmedImageUrl = imageUrl.trim();
      const payload: Partial<Product> = {
        merchantId,
        name: name.trim(),
        description: description.trim(),
        sku: sku.trim().toUpperCase(),
        category: category.trim(),
        price: numericPrice,
        costPrice: numericCost,
        currency,
        deliveryDays: Number(deliveryDays || 3),
        tags: tags.map((t) => t.trim()).filter(Boolean),
        specifications: specsRecord,
        isNegotiable,
        status,
        imageUrl: trimmedImageUrl || (isEdit ? "" : undefined),
      };

      // Only send inventory on edit if the user explicitly changed it, to avoid overwriting decremented stock
      if (!isEdit || isInventoryDirty) {
        payload.inventory = Number(inventory || 0);
      }

      let savedProduct: Product | undefined;
      if (isEdit && (product?._id || product?.id)) {
        const id = (product._id || product.id) as string;
        const res = await updateProduct(id, payload);
        savedProduct = res.data;
      } else {
        const res = await createProduct(payload);
        savedProduct = res.data;
      }

      onSuccess(savedProduct);
      onClose();
    } catch (err: unknown) {
      console.error("Product submit failed:", err);
      const message = err instanceof Error ? err.message : "Failed to save product. Please check validation rules.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-6 space-y-6 text-card-foreground">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">
            {isEdit ? "Edit Product" : "Add New Product"}
          </h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-xs flex items-center gap-2 border border-destructive/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── SECTION 1: Basic Information ── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider text-xs text-muted-foreground">
            Basic Information
          </h3>

          <div className="space-y-1.5">
            <label htmlFor="pname" className="text-xs font-medium text-foreground">
              Product Name *
            </label>
            <Input
              id="pname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. MacBook Pro 14 or Nike Running Shoe"
            />
            {errors.name && <span className="text-xs text-destructive">{errors.name}</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="psku" className="text-xs font-medium text-foreground">
                SKU *
              </label>
              <Input
                id="psku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. MBP14-001"
              />
              {errors.sku && <span className="text-xs text-destructive">{errors.sku}</span>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pcat" className="text-xs font-medium text-foreground">
                Category *
              </label>
              <Input
                id="pcat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Electronics, Fashion, Furniture"
              />
              {errors.category && <span className="text-xs text-destructive">{errors.category}</span>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pdesc" className="text-xs font-medium text-foreground">
              Description *
            </label>
            <textarea
              id="pdesc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
              placeholder="Detailed description of the product..."
            />
            {errors.description && <span className="text-xs text-destructive">{errors.description}</span>}
          </div>
        </div>

        <Separator />

        {/* ── SECTION 2: Pricing ── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider text-xs text-muted-foreground">
            Pricing
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="pprice" className="text-xs font-medium text-foreground">
                List Price ({currency === "INR" ? "₹" : currency}) *
              </label>
              <Input
                id="pprice"
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value ? Number(e.target.value) : "")}
                placeholder="120000"
              />
              {errors.price && <span className="text-xs text-destructive">{errors.price}</span>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pcost" className="text-xs font-medium text-foreground">
                Cost Price ({currency === "INR" ? "₹" : currency})
              </label>
              <Input
                id="pcost"
                type="number"
                min={0}
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value ? Number(e.target.value) : "")}
                placeholder="95000"
              />
              {errors.costPrice && <span className="text-xs text-destructive">{errors.costPrice}</span>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pcurrency" className="text-xs font-medium text-foreground">
                Currency
              </label>
              <Input
                id="pcurrency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="INR"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── SECTION 3: Inventory & Fulfillment ── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider text-xs text-muted-foreground">
            Inventory & Fulfillment
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="pinv" className="text-xs font-medium text-foreground">
                Inventory (Stock Units)
              </label>
              <Input
                id="pinv"
                type="number"
                min={0}
                value={inventory}
                onChange={(e) => {
                  setIsInventoryDirty(true);
                  setInventory(e.target.value ? Number(e.target.value) : 0);
                }}
              />
              {errors.inventory && <span className="text-xs text-destructive">{errors.inventory}</span>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pdeliv" className="text-xs font-medium text-foreground">
                Delivery (Days)
              </label>
              <Input
                id="pdeliv"
                type="number"
                min={0}
                value={deliveryDays}
                onChange={(e) => setDeliveryDays(e.target.value ? Number(e.target.value) : 0)}
              />
              {errors.deliveryDays && <span className="text-xs text-destructive">{errors.deliveryDays}</span>}
            </div>
          </div>
        </div>

        <Separator />

        {/* ── SECTION 4: Discoverability (Tags & Specifications) ── */}
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider text-xs text-muted-foreground">
              Discoverability
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Help buyers and AI agents find your product through broad tags and structured attributes.
            </p>
          </div>

          {/* Tags Subsection */}
          <div className="space-y-2 p-3.5 rounded-lg border border-border bg-muted/10">
            <div className="flex items-center gap-1.5">
              <Tag className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-semibold text-foreground">Tags</h4>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Broad searchable keywords (e.g. apple, macbook, laptop, editing).
            </p>

            {/* Tag Pills */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tags.length > 0 ? (
                tags.map((tag, idx) => (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className="text-xs py-1 px-2.5 flex items-center gap-1.5 bg-muted border border-border"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(idx)}
                      className="hover:text-destructive text-muted-foreground transition-colors"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground italic py-1">No tags added.</span>
              )}
            </div>

            {/* Tag Input */}
            <div className="flex gap-2 pt-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Enter a keyword and click Add Tag..."
                className="text-xs h-8"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTag}
                disabled={!tagInput.trim()}
                className="h-8 text-xs shrink-0"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Tag
              </Button>
            </div>
          </div>

          {/* Specifications Subsection */}
          <div className="space-y-3 p-3.5 rounded-lg border border-border bg-muted/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <div>
                  <h4 className="text-xs font-semibold text-foreground">Specifications</h4>
                  <p className="text-[11px] text-muted-foreground">
                    Add product attributes that buyers can search for.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSpecification}
                className="h-8 text-xs shrink-0"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Specification
              </Button>
            </div>

            {specifications.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground italic border border-dashed border-border rounded-md bg-card/50">
                No specifications added. Click &quot;Add Specification&quot; to define structured attributes.
              </div>
            ) : (
              <div className="space-y-2.5">
                {specifications.map((spec, index) => {
                  const rowError = errors[`spec_${index}`];
                  return (
                    <div key={index} className="space-y-1">
                      <div className="grid grid-cols-12 gap-2 items-center bg-card p-2.5 rounded-md border border-border shadow-xs">
                        {/* Attribute Name */}
                        <div className="col-span-12 sm:col-span-4">
                          <Input
                            value={spec.key}
                            onChange={(e) => handleSpecKeyChange(index, e.target.value)}
                            placeholder="Attribute (e.g. brand, ram)"
                            className="text-xs h-8"
                            aria-label={`Specification attribute name ${index + 1}`}
                          />
                        </div>

                        {/* Attribute Type */}
                        <div className="col-span-5 sm:col-span-3">
                          <select
                            value={spec.type}
                            onChange={(e) =>
                              handleSpecTypeChange(
                                index,
                                e.target.value as "string" | "number" | "boolean"
                              )
                            }
                            className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            aria-label={`Specification type ${index + 1}`}
                          >
                            <option value="string">String</option>
                            <option value="number">Number</option>
                            <option value="boolean">Boolean</option>
                          </select>
                        </div>

                        {/* Attribute Value */}
                        <div className="col-span-5 sm:col-span-4">
                          {spec.type === "boolean" ? (
                            <div className="flex items-center gap-2 h-8 px-2">
                              <Switch
                                checked={Boolean(spec.value)}
                                onCheckedChange={(checked) =>
                                  handleSpecValueChange(index, checked)
                                }
                                aria-label={`Toggle ${spec.key || "attribute"} boolean value`}
                              />
                              <span className="text-xs font-medium text-foreground">
                                {spec.value ? "True" : "False"}
                              </span>
                            </div>
                          ) : spec.type === "number" ? (
                            <Input
                              type="number"
                              value={typeof spec.value === "number" ? spec.value : 0}
                              onChange={(e) =>
                                handleSpecValueChange(
                                  index,
                                  e.target.value === "" ? 0 : Number(e.target.value)
                                )
                              }
                              placeholder="Value (e.g. 14, 500)"
                              className="text-xs h-8"
                              aria-label={`Specification number value ${index + 1}`}
                            />
                          ) : (
                            <Input
                              value={String(spec.value ?? "")}
                              onChange={(e) =>
                                handleSpecValueChange(index, e.target.value)
                              }
                              placeholder="Value (e.g. Apple, 16GB)"
                              className="text-xs h-8"
                              aria-label={`Specification string value ${index + 1}`}
                            />
                          )}
                        </div>

                        {/* Delete Action */}
                        <div className="col-span-2 sm:col-span-1 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveSpecification(index)}
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label={`Delete specification ${spec.key || index + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {rowError && (
                        <p className="text-[11px] text-destructive px-1">{rowError}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* ── SECTION 5: Commerce & Media ── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider text-xs text-muted-foreground">
            Commerce & Media
          </h3>

          <div className="space-y-1.5">
            <label htmlFor="pimg" className="text-xs font-medium text-foreground">
              Image URL
            </label>
            <Input
              id="pimg"
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                if (errors.imageUrl) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.imageUrl;
                    return next;
                  });
                }
              }}
              placeholder="https://example.com/product.jpg"
            />
            {errors.imageUrl && (
              <span className="text-xs text-destructive">{errors.imageUrl}</span>
            )}
            {imageUrl.trim() && !errors.imageUrl && (
              <div className="mt-2 flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted/20">
                <div className="relative h-12 w-12 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border">
                  <img
                    src={imageUrl.trim()}
                    alt="Product preview"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <Package className="h-5 w-5 text-muted-foreground -z-10 absolute" />
                </div>
                <div className="text-xs min-w-0 flex-1">
                  <span className="font-medium text-foreground block">Image Preview</span>
                  <span className="truncate block text-[11px] text-muted-foreground">{imageUrl.trim()}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-3 rounded-md border border-border bg-muted/20">
            <div>
              <span className="font-medium text-xs text-foreground block">Negotiable</span>
              <span className="text-[11px] text-muted-foreground">
                Allow AI agent to negotiate price for this product.
              </span>
            </div>
            <Switch
              checked={isNegotiable}
              onCheckedChange={setIsNegotiable}
              aria-label="Toggle negotiable"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                {isEdit ? "Saving..." : "Creating..."}
              </>
            ) : (
              <>
                {isEdit ? <Save className="h-4 w-4 mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
                {isEdit ? "Save Product" : "Create Product"}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function ProductFormDialog({
  product,
  merchantId,
  open,
  onClose,
  onSuccess,
}: ProductFormDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Content (remounts cleanly per product) */}
      <ProductFormModalContent
        key={product?._id || product?.id || "new-product"}
        product={product}
        merchantId={merchantId}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </div>
  );
}
