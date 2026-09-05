"use client";

import { Package, Eye, CheckCircle, Truck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format";
import type { BuyerProduct } from "@/types/buyer";

interface ProductCardProps {
  product: BuyerProduct;
  onView: (product: BuyerProduct) => void;
  onSelect: (product: BuyerProduct) => void;
  isSelected?: boolean;
  disabled?: boolean;
}

export function ProductCard({
  product,
  onView,
  onSelect,
  isSelected = false,
  disabled = false,
}: ProductCardProps) {
  const formatSpecValue = (val: string | number | boolean): string => {
    if (typeof val === "boolean") return val ? "Yes" : "No";
    return String(val);
  };

  // Extract up to 3 useful specifications dynamically without hardcoding keys
  const getTopSpecifications = (): { key: string; label: string; value: string }[] => {
    if (!product.specifications || typeof product.specifications !== "object") {
      return [];
    }

    const entries = Object.entries(product.specifications);
    return entries.slice(0, 3).map(([key, val]) => {
      // Convert camelCase or snake_case key to human readable label
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
    });
  };

  const topSpecs = getTopSpecifications();

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-xl border bg-card p-4 transition-all shadow-xs hover:shadow-md ${
        isSelected
          ? "border-primary ring-2 ring-primary/20 bg-primary/5"
          : "border-border hover:border-primary/50"
      }`}
    >
      <div className="space-y-3">
        {/* Product Media & Badges */}
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted/50 border border-border/50 flex items-center justify-center">
          {product.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground p-4">
              <Package className="h-8 w-8 stroke-[1.5]" />
              <span className="text-[11px] mt-1">No Image</span>
            </div>
          )}

          {/* Negotiable & Category Badges */}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-[10px] uppercase font-semibold bg-background/80 backdrop-blur-xs">
              {product.category}
            </Badge>
            {product.isNegotiable && (
              <Badge variant="default" className="text-[10px] bg-primary/90 text-primary-foreground font-medium flex items-center gap-0.5">
                <Sparkles className="h-2.5 w-2.5" />
                Negotiable
              </Badge>
            )}
          </div>
        </div>

        {/* Product Name & Pricing */}
        <div>
          <h4 className="font-semibold text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors" title={product.name}>
            {product.name}
          </h4>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-base font-bold text-foreground">
              {formatCurrency(product.price, "INR")}
            </span>
          </div>
        </div>

        {/* Dynamic Specifications Summary */}
        {topSpecs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border/50">
            {topSpecs.map((spec, idx) => (
              <span key={spec.key} className="inline-flex items-center text-[11px] bg-muted/60 px-2 py-0.5 rounded">
                <span className="font-medium text-foreground mr-1">{spec.label}:</span>
                {spec.value}
                {idx < topSpecs.length - 1 && <span className="sr-only">,</span>}
              </span>
            ))}
          </div>
        )}

        {/* Delivery & Inventory Info */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
          <span className="flex items-center gap-1">
            <Truck className="h-3 w-3 text-primary" />
            {product.deliveryDays > 0 ? `${product.deliveryDays} day delivery` : "Express delivery"}
          </span>
          <span>
            {product.inventory > 0 ? `${product.inventory} in stock` : "Out of stock"}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-4 pt-3 border-t border-border flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onView(product)}
          className="flex-1 text-xs h-8"
        >
          <Eye className="h-3.5 w-3.5 mr-1" />
          View
        </Button>
        <Button
          type="button"
          variant={isSelected ? "secondary" : "default"}
          size="sm"
          onClick={() => onSelect(product)}
          disabled={disabled || product.inventory <= 0}
          className="flex-1 text-xs h-8 font-medium"
        >
          {isSelected ? (
            <>
              <CheckCircle className="h-3.5 w-3.5 mr-1 text-emerald-600" />
              Selected
            </>
          ) : (
            "Select"
          )}
        </Button>
      </div>
    </div>
  );
}
