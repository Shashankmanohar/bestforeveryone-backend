import User from '../Models/userModels.js';
import Bonanza from '../Models/bonanzaModel.js';
import Referral from '../Models/referralModel.js';
import Transaction from '../Models/transactionModel.js';

export const getWeeklyBonanza = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('weeklyStats');

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ weeklyBonanza: user.weeklyStats.weeklyBonanza });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getBonanzaLogs = async (req, res) => {
    try {
        const bonanzas = await Bonanza.find({ user: req.user.id })
            .populate('referral', 'fullname')
            .sort({ createdAt: -1 })
            .limit(50);

        const formattedLogs = bonanzas.map((b, index) => ({
            id: index + 1,
            amount: b.amount,
            referral: b.referral.fullname,
            date: formatBonanzaDate(b.createdAt)
        }));

        res.json({ bonanzaLogs: formattedLogs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// This should be called weekly via cron job
export const processBonanza = async () => {
    try {
        const { weekStart, weekEnd } = getPreviousWeek();

        // Get all referrals from last week
        const weeklyReferrals = await Referral.find({
            createdAt: { $gte: weekStart, $lte: weekEnd },
            verified: true,
            status: 'active'
        }).populate('referrer referred');

        // Group by referrer
        const referrerMap = new Map();
        weeklyReferrals.forEach(ref => {
            const referrerId = ref.referrer._id.toString();
            if (!referrerMap.has(referrerId)) {
                referrerMap.set(referrerId, []);
            }
            referrerMap.get(referrerId).push(ref);
        });

        // Process each referrer
        for (const [referrerId, refs] of referrerMap.entries()) {
            const bonusUnlocked = refs.length >= 3;
            const amount = bonusUnlocked ? 400 : 200;

            const user = await User.findById(referrerId);
            const totalBonanza = amount * refs.length;

            // Credit bonanza
            user.wallet.balance += totalBonanza;
            user.wallet.totalEarnings += totalBonanza;
            user.wallet.bonanzaIncome += totalBonanza;
            user.weeklyStats.weeklyBonanza = totalBonanza;
            await user.save();

            // Create bonanza logs
            for (const ref of refs) {
                await Bonanza.create({
                    user: referrerId,
                    referral: ref.referred._id,
                    amount,
                    weekStart,
                    weekEnd,
                    credited: true
                });
            }

            // Create transaction
            await Transaction.create({
                user: referrerId,
                type: 'Weekly Bonanza',
                description: `${refs.length} referrals × ₹${amount}`,
                amount: totalBonanza,
                status: 'credit'
            });
        }

        console.log('Weekly bonanza processed successfully');
    } catch (error) {
        console.error('Process bonanza error:', error);
    }
};

// Helper functions
const getPreviousWeek = () => {
    const now = new Date();
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - (now.getDay() === 0 ? 13 : now.getDay() + 6));
    lastMonday.setHours(0, 0, 0, 0);

    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    lastSunday.setHours(23, 59, 59, 999);

    return { weekStart: lastMonday, weekEnd: lastSunday };
};

const formatBonanzaDate = (date) => {
    const now = new Date();
    const diffDays = Math.floor((now - new Date(date)) / 86400000);

    if (diffDays < 7) return 'This Week';
    if (diffDays < 14) return 'Last Week';
    return `${Math.floor(diffDays / 7)} weeks ago`;
};
