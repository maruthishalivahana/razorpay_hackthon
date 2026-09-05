import dotenv from "dotenv";

dotenv.config();

export const env = {
    PORT: process.env.PORT || "5000",
    MONGODB_URI: process.env.MONGODB_URI || "",
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || "",
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || "",
    JWT_SECRET: process.env.JWT_SECRET || "agentic_commerce_default_jwt_secret_key_2026",
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
};

if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined in .env");
}