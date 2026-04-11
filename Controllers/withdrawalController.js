import User from '../Models/userModels.js';
import Withdrawal from '../Models/withdrawalModel.js';
import Transaction from '../Models/transactionModel.js';
import Revenue from '../Models/revenueModel.js';

export const createWithdrawalRequest = async (req, res) => {
    try {
        const { amount, walletType = 'current' } = req.body;

        if (!amount || amount < 200) {
            return res.status(400).json({ message: "Minimum withdrawal is ₹200" });
        }

        if (amount > 50000) {
            return res.status(400).json({ message: "Maximum withdrawal per request is ₹50,000" });
        }


        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.status === 'blocked') {
            return res.status(403).json({ message: "Your account is blocked. Withdrawals are not allowed." });
        }

        const balance = walletType === 'matrix' ? user.wallet.matrixWallet : user.wallet.balance;
 
        if (amount > balance) {
            return res.status(400).json({ message: `Insufficient ${walletType} wallet balance` });
        }

        // Enforce KYC
        if (user.kyc.status !== 'approved') {
            return res.status(403).json({
                message: "KYC is mandatory for withdrawals.",
                requiresKyc: true,
                kycStatus: user.kyc.status
            });
        }

        const bankDetails = {
            accountNumber: user.kyc.bankDetails.accountNumber,
            ifscCode: user.kyc.bankDetails.ifscCode,
            accountHolderName: user.kyc.bankDetails.accountHolderName,
            bankName: user.kyc.bankDetails.bankName
        };

        // Check weekly limit
        const effectiveLimit = Math.max(user.weeklyStats.withdrawalLimit, 50000);
        if (user.weeklyStats.withdrawalUsed + amount > effectiveLimit) {
            return res.status(400).json({
                message: `Weekly withdrawal limit exceeded. Used: ₹${user.weeklyStats.withdrawalUsed}, Limit: ₹${effectiveLimit}`
            });
        }

        // Both Matrix and Current wallets have 20% fee
        const adminFee = amount * 0.20;
        const netPayable = amount - adminFee;

        // Create withdrawal request
        const withdrawal = await Withdrawal.create({
            user: req.user.id,
            amount,
            adminFee,
            netPayable,
            bankDetails,
            status: 'pending',
            walletType // Save the wallet type used for withdrawal
        });

        // Deduct from the correct wallet
        if (walletType === 'matrix') {
            user.wallet.matrixWallet -= amount;
        } else {
            user.wallet.balance -= amount;
        }

        user.wallet.pending += amount;
        user.weeklyStats.withdrawalUsed += amount;
        await user.save();

        // Create transaction
        await Transaction.create({
            user: req.user.id,
            type: 'Withdrawal',
            description: `Processing... #${withdrawal._id.toString().slice(-6)}`,
            amount,
            status: 'debit'
        });

        res.status(201).json({
            message: "Withdrawal request submitted successfully",
            withdrawal: {
                id: withdrawal._id,
                amount,
                adminFee,
                netPayable,
                status: withdrawal.status
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getWithdrawalHistory = async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .limit(20);

        res.json({ withdrawals });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getWithdrawalLimits = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('weeklyStats');

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
            withdrawalUsed: user.weeklyStats.withdrawalUsed,
            withdrawalLimit: Math.max(user.weeklyStats.withdrawalLimit, 50000),
            remaining: Math.max(user.weeklyStats.withdrawalLimit, 50000) - user.weeklyStats.withdrawalUsed
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Admin functions
export const adminGetAllWithdrawals = async (req, res) => {
    try {
        const { status } = req.query;
        const filter = status ? { status } : {};

        const withdrawals = await Withdrawal.find(filter)
            .populate('user', 'fullname email')
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({ withdrawals });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const adminApproveWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rejectionReason } = req.body;

        // Admin can only approve/reject withdrawals on Saturday
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 = Sunday, ..., 6 = Saturday
        if (dayOfWeek !== 6) {
            return res.status(403).json({ message: "Withdrawal approvals are only allowed on Saturdays" });
        }

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        const withdrawal = await Withdrawal.findById(id);

        if (!withdrawal) {
            return res.status(404).json({ message: "Withdrawal not found" });
        }

        if (withdrawal.status !== 'pending') {
            return res.status(400).json({ message: "Withdrawal already processed" });
        }

        withdrawal.status = status;
        withdrawal.processedAt = new Date();

        if (status === 'rejected') {
            withdrawal.rejectionReason = rejectionReason;
 
            // Refund to correct wallet
            const user = await User.findById(withdrawal.user);
            if (withdrawal.walletType === 'matrix') {
                user.wallet.matrixWallet += withdrawal.amount;
            } else {
                user.wallet.balance += withdrawal.amount;
            }
            user.wallet.pending -= withdrawal.amount;
            user.weeklyStats.withdrawalUsed -= withdrawal.amount;
            await user.save();
        }

        await withdrawal.save();

        res.json({
            message: `Withdrawal ${status} successfully`,
            withdrawal
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const adminMarkCompleted = async (req, res) => {
    try {
        const { id } = req.params;

        const withdrawal = await Withdrawal.findById(id);

        if (!withdrawal) {
            return res.status(404).json({ message: "Withdrawal not found" });
        }

        if (withdrawal.status !== 'approved') {
            return res.status(400).json({ message: "Withdrawal must be approved first" });
        }

        withdrawal.status = 'completed';
        await withdrawal.save();

        // Update user withdrawn amount
        const user = await User.findById(withdrawal.user);
        user.wallet.pending -= withdrawal.amount;
        user.wallet.withdrawn += withdrawal.amount;
        await user.save();

        // Update Platform Revenue (Admin Fee)
        if (withdrawal.adminFee > 0) {
            await Revenue.findOneAndUpdate(
                {},
                {
                    $inc: {
                        totalAdminFees: withdrawal.adminFee,
                        totalRevenue: withdrawal.adminFee
                    },
                    $set: { lastUpdated: new Date() }
                },
                { upsert: true }
            );
        }

        res.json({
            message: "Withdrawal marked as completed",
            withdrawal
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Admin can edit bank details on a pending withdrawal
export const adminUpdateWithdrawalBankDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { accountNumber, ifscCode, accountHolderName, bankName } = req.body;

        const withdrawal = await Withdrawal.findById(id);

        if (!withdrawal) {
            return res.status(404).json({ message: "Withdrawal not found" });
        }

        if (withdrawal.status !== 'pending') {
            return res.status(400).json({ message: "Can only edit bank details of a pending withdrawal" });
        }

        // Update only the fields that were provided
        if (accountNumber) withdrawal.bankDetails.accountNumber = accountNumber;
        if (ifscCode) withdrawal.bankDetails.ifscCode = ifscCode;
        if (accountHolderName) withdrawal.bankDetails.accountHolderName = accountHolderName;
        if (bankName) withdrawal.bankDetails.bankName = bankName;

        await withdrawal.save();

        res.json({
            message: "Bank details updated successfully",
            withdrawal
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

