import mongoose, { Schema, Document } from "mongoose";

export type UserRole = "BUYER" | "MERCHANT";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  role: UserRole;
  name: string;
  phone?: string;
  merchantId?: mongoose.Types.ObjectId;
  buyerId?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/\S+@\S+\.\S+/, "Please enter a valid email address"],
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["BUYER", "MERCHANT"],
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    phone: {
      type: String,
      trim: true,
    },
    merchantId: {
      type: Schema.Types.ObjectId,
      ref: "Merchant",
      default: null,
    },
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ role: 1 });
userSchema.index({ merchantId: 1 });
userSchema.index({ buyerId: 1 });

const User = mongoose.model<IUser>("User", userSchema);

export default User;
