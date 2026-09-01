"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, RefreshCw, PackageX, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductTable } from "./ProductTable";
import { ProductFormDialog } from "./ProductFormDialog";
import { ProductDetailDialog } from "./ProductDetailDialog";
import { ProductDeleteDialog } from "./ProductDeleteDialog";
import { fetchProducts } from "@/lib/api/products";
import { useMerchant } from "@/hooks/useMerchant";
import type { Product, ProductPagination } from "@/types/product";

export function ProductsPageContent() {
  const { selectedMerchant, loading: merchantLoading } = useMerchant();

  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<ProductPagination | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter & Search states
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState<number>(1);

  // Dialog States
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load products function
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: Parameters<typeof fetchProducts>[0] = {
        merchantId: selectedMerchant?._id,
        search: debouncedSearch.trim() || undefined,
        category: category !== "all" ? category : undefined,
        status: status !== "all" ? status : undefined,
        page,
        limit: 20,
      };

      const res = await fetchProducts(params);
      if (res.success && Array.isArray(res.data)) {
        setProducts(res.data);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      } else {
        throw new Error("Invalid API response format");
      }
    } catch (err) {
      console.error("Error loading products:", err);
      setError("Unable to load products.");
    } finally {
      setLoading(false);
    }
  }, [selectedMerchant?._id, debouncedSearch, category, status, page]);

  useEffect(() => {
    if (!merchantLoading) {
      loadProducts();
    }
  }, [merchantLoading, loadProducts]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleClearSearch = () => {
    setSearch("");
    setDebouncedSearch("");
    setCategory("all");
    setStatus("all");
    setPage(1);
  };

  // Dialog Trigger Handlers
  const handleAddProduct = () => {
    setActiveProduct(null);
    setFormDialogOpen(true);
  };

  const handleViewProduct = (p: Product) => {
    setActiveProduct(p);
    setDetailDialogOpen(true);
  };

  const handleEditProduct = (p: Product) => {
    setActiveProduct(p);
    setFormDialogOpen(true);
  };

  const handleDeleteProduct = (p: Product) => {
    setActiveProduct(p);
    setDeleteDialogOpen(true);
  };

  const handleMutationSuccess = (actionText: string) => {
    showToast(actionText);
    loadProducts();
  };

  const isSearchOrFilterActive = Boolean(
    debouncedSearch.trim() || category !== "all" || status !== "all"
  );

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Products
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your catalog, pricing, and inventory.
          </p>
        </div>
        <div className="shrink-0">
          <Button
            className="w-full sm:w-auto font-medium"
            onClick={handleAddProduct}
            disabled={!selectedMerchant?._id}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Toast Banner */}
      {toastMessage && (
        <div className="p-3 rounded-md bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 text-sm flex items-center gap-2 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-md border border-input bg-card text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          >
            <option value="all">All Categories</option>
            <option value="Furniture">Furniture</option>
            <option value="Electronics">Electronics</option>
            <option value="Office Furniture">Office Furniture</option>
          </select>

          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-md border border-input bg-card text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Main Content States */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <div className="border border-border rounded-lg p-12 text-center bg-card space-y-4">
          <div className="inline-flex h-12 w-12 rounded-full bg-destructive/10 text-destructive items-center justify-center">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg text-foreground">
              Unable to load products.
            </h3>
            <p className="text-sm text-muted-foreground">
              Please check your connection and try again.
            </p>
          </div>
          <Button variant="outline" onClick={loadProducts}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      ) : products.length === 0 ? (
        isSearchOrFilterActive ? (
          /* Empty Search State */
          <div className="border border-border rounded-lg p-12 text-center bg-card space-y-4">
            <div className="inline-flex h-12 w-12 rounded-full bg-muted text-muted-foreground items-center justify-center">
              <PackageX className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg text-foreground">
                No products match your search.
              </h3>
              <p className="text-sm text-muted-foreground">
                Try adjusting your search terms or filters.
              </p>
            </div>
            <Button variant="outline" onClick={handleClearSearch}>
              Clear Search
            </Button>
          </div>
        ) : (
          /* Empty Catalog State */
          <div className="border border-border rounded-lg p-12 text-center bg-card space-y-4">
            <div className="inline-flex h-12 w-12 rounded-full bg-muted text-muted-foreground items-center justify-center">
              <PackageX className="h-6 w-6" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="font-semibold text-lg text-foreground">
                No products yet
              </h3>
              <p className="text-sm text-muted-foreground">
                Add your first product to make it available to your commerce agent.
              </p>
            </div>
            <Button onClick={handleAddProduct}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Product
            </Button>
          </div>
        )
      ) : (
        /* Product Table */
        <div className="space-y-4">
          <ProductTable
            products={products}
            onViewProduct={handleViewProduct}
            onEditProduct={handleEditProduct}
            onDeleteProduct={handleDeleteProduct}
          />

          {/* Pagination Controls */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
              <span>
                Showing {products.length} of {pagination.total} products (Page{" "}
                {pagination.page} of {pagination.totalPages})
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dialog Modals */}
      <ProductFormDialog
        product={activeProduct}
        merchantId={selectedMerchant?._id || ""}
        open={formDialogOpen}
        onClose={() => setFormDialogOpen(false)}
        onSuccess={() => handleMutationSuccess(activeProduct ? "Product updated successfully." : "Product created successfully.")}
      />

      <ProductDetailDialog
        product={activeProduct}
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
      />

      <ProductDeleteDialog
        product={activeProduct}
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onSuccess={() => handleMutationSuccess("Product deactivated successfully.")}
      />
    </div>
  );
}
