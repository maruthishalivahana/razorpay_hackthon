"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteProduct, updateProduct } from "@/lib/api/products";
import type { Product } from "@/types/product";

interface ProductDeleteDialogProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ProductDeleteDialog({
  product,
  open,
  onClose,
  onSuccess,
}: ProductDeleteDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !product) return null;

  const id = (product._id || product.id) as string;

  const handleDelete = async () => {
    try {
      setLoading(true);
      setError(null);
      await deleteProduct(id);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.warn("Delete product failed, falling back to deactivation:", err);
      try {
        // Fallback to soft deactivation if hard delete fails
        await updateProduct(id, { status: "inactive" });
        onSuccess();
        onClose();
      } catch (deactErr: any) {
        setError(deactErr?.message || "Failed to remove product.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-md bg-card border border-border rounded-xl shadow-xl p-6 space-y-4 text-card-foreground">
        <div className="flex items-center gap-3 text-destructive">
          <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-foreground">Deactivate Product?</h3>
            <p className="text-xs text-muted-foreground">This action will remove product from active negotiation catalog.</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Are you sure you want to deactivate <span className="font-semibold text-foreground">&quot;{product.name}&quot;</span> (SKU: {product.sku})?
        </p>

        {error && <span className="text-xs text-destructive block">{error}</span>}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={loading}>
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                Deactivating...
              </>
            ) : (
              "Deactivate"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
