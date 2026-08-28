import mongoose, { Schema, Document } from "mongoose";

export interface IMerchant extends Document {
  name: string;
  businessName: string;
  email: string;
  phone?: string;
  description?: string;
  currency: string;
  status: "active" | "inactive" | "suspended";
  agentEnabled: boolean;
  agentDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

const merchantSchema = new Schema<IMerchant>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/\S+@\S+\.\S+/, "Please enter a valid email address"],
    },
    phone: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      required: true,
      default: "active",
    },
    agentEnabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    agentDescription: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (email is already indexed via unique: true)
merchantSchema.index({ status: 1 });

const Merchant = mongoose.model<IMerchant>("Merchant", merchantSchema);

export default Merchant;
