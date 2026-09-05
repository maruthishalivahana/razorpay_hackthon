"use client";

import React from "react";
import { X, Truck, CheckCircle, XCircle, Tag, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils/format";
import type { Product } from "@/types/product";

interface ProductDetailDialogProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}

export function ProductDetailDialog({ product, open, onClose }: ProductDetailDialogProps) {
  if (!open || !product) return null;

  const specEntries =
    product.specifications && typeof product.specifications === "object"
      ? Object.entries(product.specifications)
      : [];

  const tagsList = Array.isArray(product.tags) ? product.tags.filter(Boolean) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-6 space-y-5 text-card-foreground">
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

        {/* Product Image */}
        {product.imageUrl && (
          <div className="w-full h-48 rounded-lg overflow-hidden border border-border bg-muted/30 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-full w-full object-contain"
            />
          </div>
        )}

        {/* Description */}
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Description
          </h4>
          <p className="text-sm text-foreground leading-relaxed">{product.description}</p>
        </div>

        {/* Key Commercial Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-lg bg-muted/40 border border-border text-xs">
          <div>
            <span className="text-muted-foreground block">List Price</span>
            <span className="font-bold text-base text-foreground">
              {formatCurrency(product.price, product.currency)}
            </span>
          </div>

          <div>
            <span className="text-muted-foreground block">Stock Level</span>
            <span
              className={`font-semibold ${
                product.inventory > 0 ? "text-foreground" : "text-destructive"
              }`}
            >
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

        <Separator />

        {/* Tags Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Tag className="h-4 w-4 text-primary" />
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Tags
            </h4>
          </div>

          {tagsList.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tagsList.map((tag, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="text-xs py-1 px-2.5 bg-muted border border-border font-normal"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No tags added.</p>
          )}
        </div>

        <Separator />

        {/* Specifications Section */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Specifications
            </h4>
          </div>

          {specEntries.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-border rounded-lg p-3 bg-muted/20">
              {specEntries.map(([key, val]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-2 rounded bg-card border border-border/60 text-xs"
                >
                  <span className="text-muted-foreground capitalize font-medium">
                    {key.replace(/([a-z])([A-Z])/g, "$1 $2")}
                  </span>
                  <span className="font-semibold text-foreground text-right pl-2 truncate max-w-[180px]">
                    {typeof val === "boolean" ? (
                      val ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Yes
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-medium">No</span>
                      )
                    ) : (
                      String(val)
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No specifications added.</p>
          )}
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
