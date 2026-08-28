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
  isNegotiable: boolean;
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
    },
    isNegotiable: {
      type: Boolean,
      required: true,
      default: true,
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

const Product = mongoose.model<IProduct>("Product", productSchema);

export default Product;
