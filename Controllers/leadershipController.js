import User from '../Models/userModels.js';
import Leadership from '../Models/leadershipModel.js';
import Transaction from '../Models/transactionModel.js';

export const getTotalRoyalty = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('wallet');

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ royalty: user.wallet.royalty });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getLeadershipLogs = async (req, res) => {
    try {
        const logs = await Leadership.find({ user: req.user.id })
            .populate('downlineUser', 'fullname')
            .sort({ createdAt: -1 })
            .limit(50);

        const formattedLogs = logs.map((log, index) => ({
            id: index + 1,
            amount: log.amount,
            trigger: log.trigger,
            date: formatDate(log.createdAt)
        }));

        res.json({ leadershipLogs: formattedLogs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// This should be called when a user re-topups
export const processTopupRoyalty = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user || !user.referredBy) return;

        // Get all upline members
        const upline = await getUplineChain(user.referredBy);

        // Credit ₹10 to each upline member
        for (const uplineUser of upline) {
            const amount = 10;

            uplineUser.wallet.balance += amount;
            uplineUser.wallet.totalEarnings += amount;
            uplineUser.wallet.royalty += amount;
            uplineUser.weeklyStats.leadershipIncome += amount;
            await uplineUser.save();

            // Create leadership log
            await Leadership.create({
                user: uplineUser._id,
                downlineUser: userId,
                amount,
                trigger: `Re-Topup: ${user.fullname}`,
                credited: true
            });

            // Create transaction
            await Transaction.create({
                user: uplineUser._id,
                type: 'Leadership',
                description: `Weekly Royalty - ${user.fullname}`,
                amount,
                status: 'credit'
            });
        }

        console.log('Leadership royalty processed for user:', userId);
    } catch (error) {
        console.error('Process topup royalty error:', error);
    }
};

export const getDownlineCount = async (req, res) => {
    try {
        const count = await getDownlineCountRecursive(req.user.id);
        res.json({ downlineCount: count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Helper functions
const getUplineChain = async (userId, chain = []) => {
    if (!userId) return chain;

    const user = await User.findById(userId);
    if (!user) return chain;

    chain.push(user);

    if (user.referredBy) {
        return getUplineChain(user.referredBy, chain);
    }

    return chain;
};

const getDownlineCountRecursive = async (userId) => {
    const directReferrals = await User.find({ referredBy: userId });
    let count = directReferrals.length;

    for (const referral of directReferrals) {
        count += await getDownlineCountRecursive(referral._id);
    }

    return count;
};

const formatDate = (date) => {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 60) {
        return `Today, ${new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffHours < 24) {
        return `Today, ${new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        return new Date(date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
};
