import express from 'express';
import { signupUser, signinUser, getUserProfile, submitPaymentProof, activateOtherUser } from '../Controllers/userController.js';
import { getWalletBalance, getTransactionHistory, getEarningsBreakdown } from '../Controllers/walletController.js';
import { getMatrixStatus, getMatrixTree } from '../Controllers/matrixController.js';
import { getReferralCode, getUserReferrals, getWeeklyReferralStats } from '../Controllers/referralController.js';
import { createWithdrawalRequest, getWithdrawalHistory, getWithdrawalLimits } from '../Controllers/withdrawalController.js';
import { getWeeklyBonanza, getBonanzaLogs } from '../Controllers/bonanzaController.js';
import { getTotalRoyalty, getLeadershipLogs, getDownlineCount } from '../Controllers/leadershipController.js';
import authMiddleware from '../Auth/auth.js';

const router = express.Router();

// Auth routes (public)
router.post('/signup', signupUser);
router.post('/login', signinUser);

// Protected routes
router.get('/profile', authMiddleware(['user']), getUserProfile);

// Payment verification
router.post('/payment/submit', authMiddleware(['user']), submitPaymentProof);
router.post('/activate-other', authMiddleware(['user']), activateOtherUser);

// Wallet routes
router.get('/wallet', authMiddleware(['user']), getWalletBalance);
router.get('/transactions', authMiddleware(['user']), getTransactionHistory);
router.get('/wallet/breakdown', authMiddleware(['user']), getEarningsBreakdown);

// Matrix routes
router.get('/matrix', authMiddleware(['user']), getMatrixStatus);
router.get('/matrix/tree', authMiddleware(['user']), getMatrixTree);

// Referral routes
router.get('/referral/code', authMiddleware(['user']), getReferralCode);
router.get('/referrals', authMiddleware(['user']), getUserReferrals);
router.get('/referrals/weekly-stats', authMiddleware(['user']), getWeeklyReferralStats);

// Withdrawal routes
router.post('/withdrawal/request', authMiddleware(['user']), createWithdrawalRequest);
router.get('/withdrawals', authMiddleware(['user']), getWithdrawalHistory);
router.get('/withdrawal/limits', authMiddleware(['user']), getWithdrawalLimits);

// Bonanza routes
router.get('/bonanza', authMiddleware(['user']), getWeeklyBonanza);
router.get('/bonanza/logs', authMiddleware(['user']), getBonanzaLogs);

// Leadership routes
router.get('/leadership', authMiddleware(['user']), getTotalRoyalty);
router.get('/leadership/logs', authMiddleware(['user']), getLeadershipLogs);
router.get('/downline/count', authMiddleware(['user']), getDownlineCount);

export default router;
