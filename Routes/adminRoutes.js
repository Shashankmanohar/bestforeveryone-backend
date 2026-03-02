import { Router } from "express";
import {
  adminRegister,
  adminLogin,
  getDashboardMetrics,
  getRecentActivity,
  getAllUsers,
  getUserDetails,
  adjustUserWallet,
  updateUserStatus,
  getFinancialLedger,
  getSystemConfig,
  updateSystemConfig,
  getPendingPayments,
  approvePayment,
  rejectPayment,
  getPendingKyc,
  approveKyc,
  rejectKyc
} from "../Controllers/adminController.js";

import {
  adminGetAllWithdrawals,
  adminApproveWithdrawal,
  adminMarkCompleted
} from "../Controllers/withdrawalController.js";
import authMiddleware from "../Auth/auth.js";

const router = Router();

// ===== PUBLIC ROUTES =====
router.post("/register", adminRegister);
router.post("/login", adminLogin);

// ===== PROTECTED ADMIN ROUTES =====
// Dashboard
router.get("/metrics", authMiddleware(), getDashboardMetrics);
router.get("/activity", authMiddleware(), getRecentActivity);

// User Management
router.get("/users", authMiddleware(), getAllUsers);
router.get("/users/:id", authMiddleware(), getUserDetails);
router.post("/users/:id/wallet", authMiddleware(), adjustUserWallet);
router.put("/users/:id/status", authMiddleware(), updateUserStatus);

// Payment Approvals
router.get("/pending-payments", authMiddleware(), getPendingPayments);
router.put("/payment/approve/:userId", authMiddleware(), approvePayment);
router.put("/payment/reject/:userId", authMiddleware(), rejectPayment);

// KYC management
router.get("/kyc/pending", authMiddleware(), getPendingKyc);
router.put("/kyc/approve/:userId", authMiddleware(), approveKyc);
router.put("/kyc/reject/:userId", authMiddleware(), rejectKyc);

// Withdrawals
router.get("/withdrawals", authMiddleware(), adminGetAllWithdrawals);
router.put("/withdrawals/:id/approve", authMiddleware(), adminApproveWithdrawal);
router.put("/withdrawals/:id/complete", authMiddleware(), adminMarkCompleted);

// Financial Ledger
router.get("/ledger", authMiddleware(), getFinancialLedger);

// System Configuration
router.get("/config", authMiddleware(), getSystemConfig);
router.put("/config", authMiddleware(), updateSystemConfig);

export default router;
