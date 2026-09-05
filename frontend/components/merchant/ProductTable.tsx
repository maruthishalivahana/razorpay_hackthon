"use client";

import { Package, Eye, Edit, Trash2 } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import type { Product } from "@/types/product";

interface ProductTableProps {
  products: Product[];
  onViewProduct?: (product: Product) => void;
  onEditProduct?: (product: Product) => void;
  onDeleteProduct?: (product: Product) => void;
}

export function ProductTable({
  products,
  onViewProduct,
  onEditProduct,
  onDeleteProduct,
}: ProductTableProps) {
  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block border border-border rounded-lg overflow-hidden bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Negotiable</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const productId = product._id || product.id || product.sku;
              return (
                <TableRow key={productId} className="hover:bg-muted/40 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="relative h-10 w-10 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border">
                        {product.imageUrl ? (
                          <>
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                            <Package className="h-5 w-5 text-muted-foreground -z-10 absolute" />
                          </>
                        ) : (
                          <Package className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-sm text-foreground truncate">
                          {product.name}
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                          SKU: {product.sku || "N/A"}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {product.category}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {formatCurrency(product.price, product.currency)}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span
                      className={
                        product.inventory <= 5
                          ? "text-amber-600 dark:text-amber-400 font-medium"
                          : "text-foreground"
                      }
                    >
                      {product.inventory}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {product.deliveryDays} {product.deliveryDays === 1 ? "day" : "days"}
                  </TableCell>
                  <TableCell>
                    {product.isNegotiable ? (
                      <Badge variant="success" className="font-normal">
                        Negotiable
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="font-normal text-muted-foreground">
                        Not negotiable
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {product.status === "active" ? (
                      <Badge variant="outline" className="border-emerald-500 text-emerald-700 dark:text-emerald-400 font-normal">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="font-normal">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewProduct?.(product)}
                        aria-label={`View ${product.name}`}
                        className="h-8 px-2"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditProduct?.(product)}
                        aria-label={`Edit ${product.name}`}
                        className="h-8 px-2"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteProduct?.(product)}
                        aria-label={`Delete ${product.name}`}
                        className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card Stack */}
      <div className="md:hidden space-y-3">
        {products.map((product) => {
          const productId = product._id || product.id || product.sku;
          return (
            <Card key={productId} className="shadow-sm border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border">
                      {product.imageUrl ? (
                        <>
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                          <Package className="h-5 w-5 text-muted-foreground -z-10 absolute" />
                        </>
                      ) : (
                        <Package className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-foreground">{product.name}</h4>
                      <p className="text-xs text-muted-foreground">{product.category}</p>
                    </div>
                  </div>
                  {product.status === "active" ? (
                    <Badge variant="outline" className="border-emerald-500 text-emerald-700 dark:text-emerald-400 text-xs">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Inactive
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-border py-2">
                  <div>
                    <span className="text-muted-foreground block">Price</span>
                    <span className="font-semibold">{formatCurrency(product.price, product.currency)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Stock</span>
                    <span className="font-semibold">{product.inventory}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Delivery</span>
                    <span>{product.deliveryDays} days</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Negotiable</span>
                    <span>{product.isNegotiable ? "Yes" : "No"}</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewProduct?.(product)}
                    className="h-8 text-xs"
                  >
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEditProduct?.(product)}
                    className="h-8 text-xs"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDeleteProduct?.(product)}
                    className="h-8 text-xs text-destructive hover:bg-destructive/10"
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
