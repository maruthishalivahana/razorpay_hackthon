"use client";

import { X, Package, Truck, Sparkles, CheckCircle, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format";
import type { BuyerProduct } from "@/types/buyer";

interface ProductDetailDialogProps {
  product: BuyerProduct | null;
  open: boolean;
  onClose: () => void;
  onSelect?: (product: BuyerProduct) => void;
  isSelected?: boolean;
}

export function ProductDetailDialog({
  product,
  open,
  onClose,
  onSelect,
  isSelected = false,
}: ProductDetailDialogProps) {
  if (!open || !product) return null;

  const formatSpecValue = (val: string | number | boolean): string => {
    if (typeof val === "boolean") return val ? "Yes" : "No";
    return String(val);
  };

  const specsList = product.specifications && typeof product.specifications === "object"
    ? Object.entries(product.specifications).map(([key, val]) => {
        const formattedKey = key
          .replace(/([A-Z])/g, " $1")
          .replace(/_/g, " ")
          .replace(/^\w/, (c) => c.toUpperCase())
          .trim();
        return {
          key,
          label: formattedKey,
          value: formatSpecValue(val),
        };
      })
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-6 space-y-5 text-card-foreground">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
          <div>
            <Badge variant="secondary" className="text-[10px] uppercase font-semibold">
              {product.category}
            </Badge>
            <h2 className="text-xl font-bold text-foreground mt-1">{product.name}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Media Preview */}
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted/60 border border-border flex items-center justify-center">
          {product.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground p-4">
              <Package className="h-10 w-10 stroke-[1.5]" />
              <span className="text-xs mt-1">No Image Available</span>
            </div>
          )}
        </div>

        {/* Price & Commercial Attributes */}
        <div className="p-4 rounded-lg bg-muted/30 border border-border flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground block">List Price</span>
            <span className="text-xl font-bold text-foreground">
              {formatCurrency(product.price, "INR")}
            </span>
          </div>

          <div className="text-right space-y-1">
            {product.isNegotiable ? (
              <Badge variant="default" className="text-xs bg-primary text-primary-foreground font-medium flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Price Negotiable
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Fixed Price
              </Badge>
            )}
            <p className="text-[11px] text-muted-foreground">
              {product.inventory > 0 ? `${product.inventory} units in stock` : "Out of stock"}
            </p>
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <div className="space-y-1.5 text-xs">
            <h4 className="font-semibold text-foreground">Description</h4>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
          </div>
        )}

        {/* Dynamic Specifications */}
        {specsList.length > 0 && (
          <div className="space-y-2 text-xs">
            <h4 className="font-semibold text-foreground">Specifications</h4>
            <div className="grid grid-cols-2 gap-2 border border-border rounded-lg p-3 bg-muted/20">
              {specsList.map((spec) => (
                <div key={spec.key} className="space-y-0.5">
                  <span className="text-muted-foreground block text-[11px]">{spec.label}</span>
                  <span className="font-medium text-foreground">{spec.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {product.tags && product.tags.length > 0 && (
          <div className="space-y-1.5 text-xs">
            <h4 className="font-semibold text-foreground flex items-center gap-1">
              <Tag className="h-3 w-3 text-primary" />
              Tags
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {product.tags.map((tag, idx) => (
                <Badge key={idx} variant="secondary" className="text-[11px] font-normal">
                  #{tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Delivery Terms */}
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
          <span className="flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-primary" />
            Standard Delivery: {product.deliveryDays > 0 ? `${product.deliveryDays} days` : "Immediate"}
          </span>
          {product.sku && <span className="font-mono text-[11px]">SKU: {product.sku}</span>}
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {onSelect && (
            <Button
              variant={isSelected ? "secondary" : "default"}
              size="sm"
              onClick={() => {
                onSelect(product);
                onClose();
              }}
              disabled={product.inventory <= 0}
            >
              {isSelected ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-1 text-emerald-600" />
                  Product Selected
                </>
              ) : (
                "Select This Product"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
