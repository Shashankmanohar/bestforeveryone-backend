import User from '../Models/userModels.js';
import Withdrawal from '../Models/withdrawalModel.js';
import Transaction from '../Models/transactionModel.js';
import Revenue from '../Models/revenueModel.js';

export const createWithdrawalRequest = async (req, res) => {
    try {
        const { amount, bankDetails, walletType = 'current' } = req.body;

        if (!amount || amount < 200) {
            return res.status(400).json({ message: "Minimum withdrawal is ₹200" });
        }

        if (amount > 50000) {
            return res.status(400).json({ message: "Maximum withdrawal per request is ₹50,000" });
        }

        // Restrict to Saturday only
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        if (dayOfWeek !== 6) {
            return res.status(400).json({ message: "Withdrawals are only allowed on Saturdays" });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const balance = walletType === 'matrix' ? user.wallet.matrixWallet : user.wallet.balance;

        if (amount > balance) {
            return res.status(400).json({ message: `Insufficient ${walletType} wallet balance` });
        }

        // Check weekly limit
        const effectiveLimit = Math.max(user.weeklyStats.withdrawalLimit, 50000);
        if (user.weeklyStats.withdrawalUsed + amount > effectiveLimit) {
            return res.status(400).json({
                message: `Weekly withdrawal limit exceeded. Used: ₹${user.weeklyStats.withdrawalUsed}, Limit: ₹${effectiveLimit}`
            });
        }

        const adminFee = walletType === 'matrix' ? 0 : amount * 0.20; // 0% for matrix, 20% for current
        const netPayable = amount - adminFee;

        // Create withdrawal request
        const withdrawal = await Withdrawal.create({
            user: req.user.id,
            amount,
            walletType,
            adminFee,
            netPayable,
            bankDetails,
            status: 'pending'
        });

        // Deduct from balance immediately
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
            description: `Processing (${walletType})... #${withdrawal._id.toString().slice(-6)}`,
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
            .populate('user', 'fullname phone')
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

            // Refund to user balance
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
