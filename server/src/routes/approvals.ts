import { Router, type Request, type Response, type NextFunction } from "express";
import {
  approveAgreementSchema,
  rejectAgreementSchema,
} from "../utils/validation.js";
import {
  getApprovalById,
  getApprovalByAgreement,
} from "../services/approvalService.js";
import {
  approveAgreement,
  rejectAgreement,
} from "../services/agreementService.js";

const router = Router();

// GET /api/approvals/agreement/:agreementId (MUST BE BEFORE /:id)
router.get(
  "/agreement/:agreementId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agreementId = String(req.params.agreementId);
      const approval = await getApprovalByAgreement(agreementId);
      return res.status(200).json({
        success: true,
        data: approval,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/approvals/:id
router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const approval = await getApprovalById(id);
      return res.status(200).json({
        success: true,
        data: approval,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/approvals/:id/approve
router.post(
  "/:id/approve",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const { reviewer } = approveAgreementSchema.parse(req.body);

      const approval = await getApprovalById(id);
      const result = await approveAgreement(
        approval.agreementId.toString(),
        reviewer
      );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/approvals/:id/reject
router.post(
  "/:id/reject",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const { reviewer, reason } = rejectAgreementSchema.parse(req.body);

      const approval = await getApprovalById(id);
      const result = await rejectAgreement(
        approval.agreementId.toString(),
        reviewer,
        reason
      );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
