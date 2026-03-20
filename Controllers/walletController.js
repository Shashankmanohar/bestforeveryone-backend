import User from '../Models/userModels.js';
import Transaction from '../Models/transactionModel.js';

export const getWalletBalance = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('wallet');

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ wallet: user.wallet });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getTransactionHistory = async (req, res) => {
    try {
        const transactions = await Transaction.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .limit(50);

        const formattedTransactions = transactions.map(tx => ({
            _id: tx._id,
            type: tx.type,
            description: tx.description,
            amount: tx.amount,
            createdAt: tx.createdAt,
            status: tx.status
        }));

        res.json({ transactions: formattedTransactions });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getEarningsBreakdown = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('wallet');

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
            breakdown: {
                matrixIncome: user.wallet.matrixIncome,
                referralIncome: user.wallet.referralIncome,
                royalty: user.wallet.royalty,
                bonanzaIncome: user.wallet.bonanzaIncome,
                totalEarnings: user.wallet.totalEarnings,
                withdrawn: user.wallet.withdrawn,
                balance: user.wallet.balance
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Helper function to format dates
const formatDate = (date) => {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
        return diffMins === 0 ? 'Just Now' : `${diffMins} min ago`;
    } else if (diffHours < 24) {
        return `Today, ${new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
        return `Yesterday, ${new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        return new Date(date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
};
