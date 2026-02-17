import { Router } from "express";
import { adminGetAllWithdrawals, adminApproveWithdrawal, adminMarkCompleted } from "../Controllers/withdrawalController.js";
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

router.patch(
    "/withdrawals/:id/complete",
    authMiddleware(["admin", "superadmin"]),
    adminMarkCompleted
);

export default router;
