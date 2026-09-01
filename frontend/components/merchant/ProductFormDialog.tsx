"use client";

import { useState, useEffect } from "react";
import { X, Package, Save, Plus, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createProduct, updateProduct } from "@/lib/api/products";
import type { Product } from "@/types/product";

interface ProductFormDialogProps {
  product: Product | null;
  merchantId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ProductFormDialog({
  product,
  merchantId,
  open,
  onClose,
  onSuccess,
}: ProductFormDialogProps) {
  const isEdit = Boolean(product && (product._id || product.id));

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("Furniture");
  const [price, setPrice] = useState<number | "">("");
  const [costPrice, setCostPrice] = useState<number | "">("");
  const [inventory, setInventory] = useState<number | "">(0);
  const [deliveryDays, setDeliveryDays] = useState<number | "">(3);
  const [isNegotiable, setIsNegotiable] = useState(true);
  const [status, setStatus] = useState("active");
  const [imageUrl, setImageUrl] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      if (product) {
        setName(product.name || "");
        setDescription(product.description || "");
        setSku(product.sku || "");
        setCategory(product.category || "Furniture");
        setPrice(product.price ?? "");
        setCostPrice(product.costPrice ?? Math.round((product.price || 0) * 0.7));
        setInventory(product.inventory ?? 0);
        setDeliveryDays(product.deliveryDays ?? 3);
        setIsNegotiable(product.isNegotiable ?? true);
        setStatus(product.status || "active");
        setImageUrl(product.imageUrl || "");
      } else {
        setName("");
        setDescription("");
        setSku(`SKU_${Math.floor(Math.random() * 90000) + 10000}`);
        setCategory("Furniture");
        setPrice("");
        setCostPrice("");
        setInventory(10);
        setDeliveryDays(3);
        setIsNegotiable(true);
        setStatus("active");
        setImageUrl("");
      }
      setError(null);
      setErrors({});
    }
  }, [open, product]);

  if (!open) return null;

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

      const payload: Partial<Product> = {
        merchantId,
        name: name.trim(),
        description: description.trim(),
        sku: sku.trim().toUpperCase(),
        category: category.trim(),
        price: numericPrice,
        costPrice: numericCost,
        currency: "INR",
        inventory: Number(inventory || 0),
        deliveryDays: Number(deliveryDays || 3),
        isNegotiable,
        status,
        imageUrl: imageUrl.trim() || undefined,
      };

      if (isEdit && (product?._id || product?.id)) {
        const id = (product._id || product.id) as string;
        await updateProduct(id, payload);
      } else {
        await createProduct(payload);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Product submit failed:", err);
      setError(err?.message || "Failed to save product. Please check validation rules.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-6 space-y-6 text-card-foreground">
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="pname" className="text-xs font-medium text-foreground">Product Name *</label>
            <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ergonomic Office Chair" />
            {errors.name && <span className="text-xs text-destructive">{errors.name}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="psku" className="text-xs font-medium text-foreground">SKU *</label>
              <Input id="psku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU-1001" />
              {errors.sku && <span className="text-xs text-destructive">{errors.sku}</span>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pcat" className="text-xs font-medium text-foreground">Category *</label>
              <Input id="pcat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Furniture" />
              {errors.category && <span className="text-xs text-destructive">{errors.category}</span>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pdesc" className="text-xs font-medium text-foreground">Description *</label>
            <textarea
              id="pdesc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
              placeholder="High quality ergonomic chair with lumbar support..."
            />
            {errors.description && <span className="text-xs text-destructive">{errors.description}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="pprice" className="text-xs font-medium text-foreground">List Price (₹) *</label>
              <Input id="pprice" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value ? Number(e.target.value) : "")} placeholder="24000" />
              {errors.price && <span className="text-xs text-destructive">{errors.price}</span>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pcost" className="text-xs font-medium text-foreground">Cost Price (₹)</label>
              <Input id="pcost" type="number" min={0} value={costPrice} onChange={(e) => setCostPrice(e.target.value ? Number(e.target.value) : "")} placeholder="15000" />
              {errors.costPrice && <span className="text-xs text-destructive">{errors.costPrice}</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="pinv" className="text-xs font-medium text-foreground">Inventory (Stock)</label>
              <Input id="pinv" type="number" min={0} value={inventory} onChange={(e) => setInventory(e.target.value ? Number(e.target.value) : 0)} />
              {errors.inventory && <span className="text-xs text-destructive">{errors.inventory}</span>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pdeliv" className="text-xs font-medium text-foreground">Delivery (Days)</label>
              <Input id="pdeliv" type="number" min={0} value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value ? Number(e.target.value) : 0)} />
              {errors.deliveryDays && <span className="text-xs text-destructive">{errors.deliveryDays}</span>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pimg" className="text-xs font-medium text-foreground">Image URL</label>
            <Input id="pimg" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/product.jpg" />
          </div>

          <div className="flex items-center justify-between p-3 rounded-md border border-border bg-muted/20">
            <div>
              <span className="font-medium text-xs text-foreground block">Negotiable</span>
              <span className="text-[11px] text-muted-foreground">Allow AI agent to negotiate price for this product.</span>
            </div>
            <Switch checked={isNegotiable} onCheckedChange={setIsNegotiable} aria-label="Toggle negotiable" />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
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
    </div>
  );
}
