import Razorpay from "razorpay";
import { env } from "./env.js";
import { AppCustomError } from "../services/negotiationService.js";

export const getRazorpayConfig = (): { keyId: string; keySecret: string } => {
  const keyId = process.env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET || env.RAZORPAY_KEY_SECRET;

  const missing: string[] = [];
  if (!keyId) missing.push("RAZORPAY_KEY_ID");
  if (!keySecret) missing.push("RAZORPAY_KEY_SECRET");

  if (missing.length > 0) {
    console.warn(`[PAYMENT] Missing configuration variable(s): ${missing.join(", ")}`);
    throw new AppCustomError("PAYMENT_NOT_CONFIGURED", "Payment provider is not configured.", 500);
  }

  return {
    keyId,
    keySecret,
  };
};

export const getRazorpayInstance = (): Razorpay => {
  const { keyId, keySecret } = getRazorpayConfig();
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
};
