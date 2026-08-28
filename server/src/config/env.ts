import dotenv from "dotenv";

dotenv.config();

export const env = {
    PORT: process.env.PORT || "5000",
    MONGODB_URI: process.env.MONGODB_URI || "",
};

if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined in .env");
}