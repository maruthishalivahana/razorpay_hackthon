import mongoose, { Schema, Document } from "mongoose";

export type PaymentStatus =
  | "PAYMENT_READY"
  | "RAZORPAY_ORDER_CREATED"
  | "CHECKOUT_OPEN"
  | "VERIFICATION_PENDING"
  | "VERIFIED"
  | "FAILED"
  | "CANCELLED"
  | "CAPTURED";

export interface IPayment extends Document {
  agreementId: mongoose.Types.ObjectId;
  merchantId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  amount: number; // Smallest subunit (e.g. paise for INR)
  currency: string;
  status: PaymentStatus;
  inventoryAdjusted: boolean;
  failureReason?: string;
  verifiedAt?: Date;
  capturedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    agreementId: {
      type: Schema.Types.ObjectId,
      ref: "Agreement",
      required: true,
      unique: true,
    },
    merchantId: {
      type: Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    razorpayOrderId: {
      type: String,
      required: true,
      trim: true,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
    },
    razorpaySignature: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [1, "Amount in subunits must be greater than 0"],
      validate: {
        validator: Number.isInteger,
        message: "Amount in subunits must be an integer",
      },
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      enum: [
        "PAYMENT_READY",
        "RAZORPAY_ORDER_CREATED",
        "CHECKOUT_OPEN",
        "VERIFICATION_PENDING",
        "VERIFIED",
        "FAILED",
        "CANCELLED",
        "CAPTURED",
      ],
      required: true,
      default: "RAZORPAY_ORDER_CREATED",
    },
    inventoryAdjusted: {
      type: Boolean,
      default: false,
    },
    failureReason: {
      type: String,
    },
    verifiedAt: {
      type: Date,
    },
    capturedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ merchantId: 1 });
paymentSchema.index({ razorpayOrderId: 1 });
paymentSchema.index({ status: 1 });

const Payment = mongoose.model<IPayment>("Payment", paymentSchema);

export default Payment;
