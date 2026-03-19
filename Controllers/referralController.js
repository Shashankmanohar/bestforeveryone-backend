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
            .populate('referred', 'fullname email status verified createdAt')
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

        const weeklyCount = allWeeklyReferrals.length;
        const baseReward = 200;
        const bonanzaReward = 200;

        // Base reward is 200 per direct
        const baseEarnings = weeklyCount * baseReward;
        
        // Bonanza is 200 per direct only if >= 2
        const bonusEarnings = weeklyCount >= 2 ? weeklyCount * bonanzaReward : 0;
        
        const totalEarnings = baseEarnings + bonusEarnings;

        res.json({
            weekStart: weekStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
            weekEnd: weekEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
            directReferrals: weeklyCount,
            totalCount: weeklyCount,
            weeklyCount: weeklyCount,
            bonusThreshold: 2,
            bonusUnlocked: weeklyCount >= 2,
            baseEarnings,
            bonusEarnings,
            totalEarnings,
            isWeekend: false,
            isBonanzaWindow: true,
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

        // 2. Base Reward: Always give ₹200 for direct referral
        const baseAmount = 200;
        await creditReferralBonus(referrer, baseAmount, referredId);

        // 3. Weekly Bonanza: Give ₹200 for Bonanza as per the 20% rule, starting from 2 referrals.
        const allReferralsThisWeek = await Referral.find({
            referrer: referrerId,
            createdAt: { $gte: weekStart, $lte: weekEnd },
            verified: true,
            status: 'active'
        });
        const weeklyCount = allReferralsThisWeek.length;

        if (weeklyCount === 2) {
            await creditBonanza(referrer, 400, `Weekly Bonanza Income for hitting 2 referrals`, referredId);
        } else if (weeklyCount > 2) {
            await creditBonanza(referrer, 200, `Weekly Bonanza Income for Referral`, referredId);
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

    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    friday.setHours(23, 59, 59, 999);

    return { weekStart: monday, weekEnd: friday };
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
