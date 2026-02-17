import User from '../Models/userModels.js';
import Referral from '../Models/referralModel.js';
import Transaction from '../Models/transactionModel.js';
import Bonanza from '../Models/bonanzaModel.js';

export const getReferralCode = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('referralCode');

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ referralCode: user.referralCode });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getUserReferrals = async (req, res) => {
    try {
        const referrals = await Referral.find({ referrer: req.user.id })
            .populate('referred', 'fullname phone status verified createdAt')
            .sort({ createdAt: -1 });

        const formattedReferrals = referrals.map((ref, index) => ({
            id: index + 1,
            name: ref.referred.fullname,
            joined: getRelativeTime(ref.createdAt),
            status: ref.status,
            verified: ref.verified,
            rewardCredited: ref.rewardCredited
        }));

        // Get milestone info
        const user = await User.findById(req.user.id).select('referralMilestones');
        const totalVerified = referrals.filter(r => r.verified && r.status === 'active').length;

        res.json({
            referrals: formattedReferrals,
            totalVerified,
            milestones: user.referralMilestones
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getWeeklyReferralStats = async (req, res) => {
    try {
        const { weekStart, weekEnd } = getCurrentWeek();
        const now = new Date();
        const dayOfWeek = now.getDay();

        const allWeeklyReferrals = await Referral.find({
            referrer: req.user.id,
            createdAt: { $gte: weekStart, $lte: weekEnd },
            verified: true
        });

        // Filter for referrals made on Mon-Fri
        const monFriReferrals = allWeeklyReferrals.filter(ref => {
            const day = new Date(ref.createdAt).getDay();
            return day >= 1 && day <= 5;
        });

        const weeklyCount = allWeeklyReferrals.length;
        const monFriCount = monFriReferrals.length;
        const bonusThreshold = 2;
        const bonusUnlocked = monFriCount >= bonusThreshold;
        const baseReward = 200;
        const bonusAmount = 400; // One-time bonanza

        const baseEarnings = weeklyCount * baseReward;
        const bonusEarnings = bonusUnlocked ? bonusAmount : 0;
        const totalEarnings = baseEarnings + bonusEarnings;

        res.json({
            weekStart: weekStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
            weekEnd: weekEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
            directReferrals: monFriCount, // Use Mon-Fri count for progress
            totalCount: weeklyCount,
            weeklyCount: monFriCount,
            bonusThreshold,
            bonusUnlocked,
            baseEarnings,
            bonusEarnings,
            totalEarnings,
            isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
            isBonanzaWindow: dayOfWeek >= 1 && dayOfWeek <= 5
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const processReferralSignup = async (referrerId, referredId) => {
    try {
        console.log('=== STARTING REFERRAL PROCESSING ===');
        const { weekStart, weekEnd } = getCurrentWeek();
        const now = new Date();
        const dayOfWeek = now.getDay();

        // 1. Check if referral record already exists
        let referral = await Referral.findOne({ referrer: referrerId, referred: referredId });

        if (referral) {
            console.log('Referral record already exists. Checking if rewards need to be credited...');
            if (referral.rewardCredited) {
                console.log('Rewards already credited for this referral. Skipping.');
                console.log('=== REFERRAL PROCESSING COMPLETE (EXISTING) ===');
                return;
            }

            // Update existing record
            referral.status = 'active';
            referral.verified = true;
            referral.weekStart = weekStart;
            referral.weekEnd = weekEnd;
            await referral.save();
        } else {
            // Create new referral record
            referral = await Referral.create({
                referrer: referrerId,
                referred: referredId,
                status: 'active',
                verified: true,
                weekStart,
                weekEnd
            });
        }

        // 2. & 3. Reward Processing
        const referrer = await User.findById(referrerId);
        if (!referrer) {
            console.log('❌ Referrer not found');
            return;
        }

        // 2. Base Reward: Always give ₹200
        const baseAmount = 200;
        await creditReferralBonus(referrer, baseAmount, referredId);

        // 3. Weekly Bonanza: Additional ₹200 per referral on Mon-Fri if 2+ referrals
        const isMonFri = dayOfWeek >= 1 && dayOfWeek <= 5;
        if (isMonFri) {
            const currentRefs = await Referral.find({
                referrer: referrerId,
                createdAt: { $gte: weekStart, $lte: weekEnd },
                verified: true
            });
            const monFriRefs = currentRefs.filter(ref => {
                const day = new Date(ref.createdAt).getDay();
                return day >= 1 && day <= 5;
            });
            const count = monFriRefs.length;

            if (count === 2) {
                // If this is exactly the 2nd referral on Mon-Fri, credit the ONE-TIME ₹400 bonus
                const bonusAmount = 400;
                await creditBonanza(referrer, bonusAmount, 'Weekly Milestone: 2 Referrals Bonus', referredId);
            }
            // For count > 2 or weekend referrals, no extra bonanza is given (only base 200)
        }

        referral.rewardCredited = true;
        await referral.save();

        console.log('=== REFERRAL PROCESSING COMPLETE ===');
    } catch (error) {
        console.error('❌ Process referral error:', error);
    }
};

// Helper for crediting base referral bonus
const creditReferralBonus = async (user, amount, referredId) => {
    user.wallet.balance += amount;
    user.wallet.totalEarnings += amount;
    user.wallet.referralIncome += amount;
    await user.save();

    await Transaction.create({
        user: user._id,
        type: 'Referral Bonus',
        description: `Direct Referral rewarded for user: ${referredId}`,
        amount,
        status: 'credit'
    });
};

export const createPendingReferral = async (referrerId, referredId) => {
    try {
        console.log('=== CREATING PENDING REFERRAL ===');
        const { weekStart, weekEnd } = getCurrentWeek();

        // Check if exists
        const exists = await Referral.findOne({ referrer: referrerId, referred: referredId });
        if (exists) {
            console.log('Pending referral already exists.');
            return;
        }

        await Referral.create({
            referrer: referrerId,
            referred: referredId,
            status: 'pending',
            verified: false,
            weekStart,
            weekEnd
        });
        console.log('=== PENDING REFERRAL CREATED ===');
    } catch (error) {
        console.error('❌ Create pending referral error:', error);
    }
};

// Milestones removed in new plan in favor of matrix logic and royalty

// Helper for crediting bonanza
const creditBonanza = async (user, amount, description, referralId) => {
    const { weekStart, weekEnd } = getCurrentWeek();

    user.wallet.balance += amount;
    user.wallet.totalEarnings += amount;
    user.wallet.bonanzaIncome = (user.wallet.bonanzaIncome || 0) + amount;

    // Update weeklyStats for frontend display
    user.weeklyStats.weeklyBonanza = (user.weeklyStats.weeklyBonanza || 0) + amount;

    await user.save();

    // Create Bonanza log for history
    if (referralId) {
        await Bonanza.create({
            user: user._id,
            referral: referralId,
            amount,
            weekStart,
            weekEnd,
            credited: true
        });
    }

    await Transaction.create({
        user: user._id,
        type: 'Weekly Bonanza',
        description,
        amount,
        status: 'credit'
    });
};

// Helper functions
const getCurrentWeek = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return { weekStart: monday, weekEnd: sunday };
};

const getRelativeTime = (date) => {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return new Date(date).toLocaleDateString();
};
