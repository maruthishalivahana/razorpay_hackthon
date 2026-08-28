import express from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import merchantRoutes from "./routes/merchants.js";
import productRoutes from "./routes/products.js";
import policyRoutes from "./routes/policies.js";
import negotiationRoutes from "./routes/negotiations.js";
import agreementRoutes from "./routes/agreements.js";
import approvalRoutes from "./routes/approvals.js";
import auditRoutes from "./routes/auditEvents.js";
import agentRoutes from "./routes/agents.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "AI Commerce API is running",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/merchants", merchantRoutes);
app.use("/api/products", productRoutes);
app.use("/api/policies", policyRoutes);
app.use("/api/negotiations", negotiationRoutes);
app.use("/api/agreements", agreementRoutes);
app.use("/api/approvals", approvalRoutes);
app.use("/api/audit-events", auditRoutes);
app.use("/api/agents", agentRoutes);

app.use(errorHandler);

const startServer = async () => {
  await connectDB();

  app.listen(Number(env.PORT), () => {
    console.log(`🚀 Server running on http://localhost:${env.PORT}`);
  });
};

startServer();