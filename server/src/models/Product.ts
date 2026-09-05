import mongoose, { Schema, Document } from "mongoose";

export interface IProduct extends Document {
  merchantId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  category: string;
  sku: string;
  price: number;
  costPrice: number;
  currency: string;
  inventory: number;
  lowStockThreshold: number;
  status: "active" | "inactive" | "out_of_stock";
  deliveryDays: number;
  tags?: string[];
  imageUrl?: string;
  image?: string;
  isNegotiable: boolean;
  /**
   * Generic structured attribute map for arbitrary product specifications.
   * Examples:
   *   Electronics:  { brand: "Apple", model: "MacBook Pro", ram: "16GB", storage: "512GB" }
   *   Fashion:      { brand: "Nike", color: "black", size: "10" }
   *   Furniture:    { adjustableHeight: true, ergonomic: true, material: "mesh" }
   *   Groceries:    { weight: "5kg", organic: true }
   * Keys and values are completely catalog-driven — no hardcoding per category.
   */
  specifications?: Map<string, string | number | boolean>;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    price: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => v > 0,
        message: "Price must be greater than 0",
      },
    },
    costPrice: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => v > 0,
        message: "Cost price must be greater than 0",
      },
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
    },
    inventory: {
      type: Number,
      required: true,
      min: [0, "Inventory cannot be negative"],
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "Inventory must be an integer",
      },
    },
    lowStockThreshold: {
      type: Number,
      required: true,
      min: [0, "Low stock threshold cannot be negative"],
      default: 10,
      validate: {
        validator: Number.isInteger,
        message: "Low stock threshold must be an integer",
      },
    },
    status: {
      type: String,
      enum: ["active", "inactive", "out_of_stock"],
      required: true,
      default: "active",
    },
    deliveryDays: {
      type: Number,
      required: true,
      min: [0, "Delivery days cannot be negative"],
      default: 3,
      validate: {
        validator: Number.isInteger,
        message: "Delivery days must be an integer",
      },
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    imageUrl: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      trim: true,
    },
    isNegotiable: {
      type: Boolean,
      required: true,
      default: true,
    },
    /**
     * Generic key-value map for arbitrary product attributes.
     * Supports any category: Electronics, Fashion, Furniture, Groceries, etc.
     * No field names are hardcoded in the schema — all keys are catalog-driven.
     */
    specifications: {
      type: Map,
      of: Schema.Types.Mixed,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (sku is already indexed via unique: true)
productSchema.index({ merchantId: 1 });
productSchema.index({ category: 1 });
productSchema.index({ status: 1 });
productSchema.index({ merchantId: 1, status: 1 });

productSchema.pre("save", function () {
  if (this.image && !this.imageUrl) {
    this.imageUrl = this.image;
  }
  if (this.imageUrl && !this.image) {
    this.image = this.imageUrl;
  }
});

const Product = mongoose.model<IProduct>("Product", productSchema);

export default Product;
