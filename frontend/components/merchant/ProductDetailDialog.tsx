"use client";

import { X, Truck, CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";
import type { Product } from "@/types/product";

interface ProductDetailDialogProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}

export function ProductDetailDialog({ product, open, onClose }: ProductDetailDialogProps) {
  if (!open || !product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-6 space-y-5 text-card-foreground">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-foreground">{product.name}</h2>
              <Badge variant={product.status === "active" ? "success" : "secondary"}>
                {product.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <span>SKU: {product.sku}</span>
              <span>•</span>
              <span>Category: {product.category}</span>
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Product Image / Info */}
        {product.imageUrl && (
          <div className="w-full h-48 rounded-lg overflow-hidden border border-border bg-muted/30 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" />
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</h4>
          <p className="text-sm text-foreground leading-relaxed">{product.description}</p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-lg bg-muted/40 border border-border text-xs">
          <div>
            <span className="text-muted-foreground block">List Price</span>
            <span className="font-bold text-base text-foreground">{formatCurrency(product.price, product.currency)}</span>
          </div>

          <div>
            <span className="text-muted-foreground block">Stock Level</span>
            <span className={`font-semibold ${product.inventory > 0 ? "text-foreground" : "text-destructive"}`}>
              {product.inventory} units
            </span>
          </div>

          <div>
            <span className="text-muted-foreground block flex items-center gap-1">
              <Truck className="h-3 w-3" /> Delivery
            </span>
            <span className="font-semibold text-foreground">{product.deliveryDays} days</span>
          </div>

          <div>
            <span className="text-muted-foreground block">Negotiable</span>
            <span className="font-semibold text-foreground flex items-center gap-1">
              {product.isNegotiable ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  Yes
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  No
                </>
              )}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
