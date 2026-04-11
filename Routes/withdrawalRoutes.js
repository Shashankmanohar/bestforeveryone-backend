import { Router } from "express";
import { adminGetAllWithdrawals, adminApproveWithdrawal, adminMarkCompleted, adminUpdateWithdrawalBankDetails } from "../Controllers/withdrawalController.js";
import authMiddleware from "../Auth/auth.js";

const router = Router();

// Admin withdrawal management
router.get(
    "/withdrawals",
    authMiddleware(["admin", "superadmin"]),
    adminGetAllWithdrawals
);

router.put(
    "/withdrawals/:id",
    authMiddleware(["admin", "superadmin"]),
    adminApproveWithdrawal
);

// Also support /approve suffix (used by frontend store)
router.put(
    "/withdrawals/:id/approve",
    authMiddleware(["admin", "superadmin"]),
    adminApproveWithdrawal
);

router.patch(
    "/withdrawals/:id/complete",
    authMiddleware(["admin", "superadmin"]),
    adminMarkCompleted
);

// Admin edits bank details on a pending withdrawal
router.patch(
    "/withdrawals/:id/bank-details",
    authMiddleware(["admin", "superadmin"]),
    adminUpdateWithdrawalBankDetails
);

export default router;

