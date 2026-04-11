import User from '../Models/userModels.js';
import Transaction from '../Models/transactionModel.js';
import Revenue from '../Models/revenueModel.js';

/**
 * Distributes Weekly Royalty Bonus
 * Calculation:
 * - 200 Rs per new active ID (verified users) since the last distribution
 * - Star Pool (3% = 30 Rs/ID)        -> Users with Direct Referrals >= 6
 * - Double Star Pool (6% = 60 Rs/ID)  -> Users with Direct Referrals >= 18 (6 + 12 next)
 * - Super Star Pool (11% = 110 Rs/ID) -> Users with Direct Referrals >= 36 (18 + 18 next)
 * 
 * Note: Accumulative - An achiever gets a share from EVERY pool they have qualified for.
 * Star: >= 6 (3%), Double Star: >= 18 (6%), Super Star: >= 36 (11%). 
 * Note: Accumulative - An achiever gets a share from EVERY pool they have qualified for.
 * Star: >= 6 (3%), Double Star: >= 18 (6%), Super Star: >= 36 (11%). 
 * A Super Star gets (3% + 6% + 11% = 20% total).
 * 
 * Earning Caps:
 * - Star: ₹10,000 total royalty
 * - Double Star: ₹50,000 total royalty
 * - Super Star: ₹1,00,000 total royalty
 */
const ROYALTY_CAPS = {
    STAR: 10000,
    DOUBLE_STAR: 50000,
    SUPER_STAR: 100000
};

export const distributeWeeklyRoyalty = async (req, res) => {
    try {
        console.log('=== STARTING WEEKLY ROYALTY DISTRIBUTION ===');

        // 1. Database Self-Repair: Ensure all verified users have paymentProof.approvedAt
        // This handles users verified before the approvedAt field was introduced.
        const usersToRepair = await User.find({
            verified: true,
            $or: [
                { "paymentProof.approvedAt": { $exists: false } },
                { "paymentProof.approvedAt": null }
            ]
        });

        if (usersToRepair.length > 0) {
            console.log(`Self-Repair: Setting approvedAt for ${usersToRepair.length} users...`);
            for (const user of usersToRepair) {
                if (!user.paymentProof) user.paymentProof = {};
                user.paymentProof.approvedAt = user.updatedAt || user.createdAt || new Date();
                await user.save({ validateBeforeSave: false });
            }
        }

        // 2. Get the date of the last royalty distribution
        const revenueData = await Revenue.findOne({});
        const lastDistributionDate = revenueData?.lastRoyaltyDistribution || new Date(0);

        console.log(`Calculating payouts for ids verified after: ${lastDistributionDate}`);

        // 3. Count new verified users (activations) since last distribution
        const newActivationsCount = await User.countDocuments({
            verified: true,
            "paymentProof.approvedAt": { $gt: lastDistributionDate }
        });

        console.log(`Processing ${newActivationsCount} new activations for this royalty cycle.`);

        if (newActivationsCount === 0) {
            return res.status(200).json({
                success: true,
                message: "No new activations found since the last distribution.",
                newActivations: 0
            });
        }

        // 3. Calculate Pool Amounts
        // Total Royalty Fund is based on ₹200 per new sponsorship (3% + 6% + 11%)
        const starPoolAmount = newActivationsCount * 30;       // 3% 
        const doubleStarPoolAmount = newActivationsCount * 60; // 6%
        const superStarPoolAmount = newActivationsCount * 110; // 11%

        console.log(`Pools - Star: ₹${starPoolAmount}, Double Star: ₹${doubleStarPoolAmount}, Super Star: ₹${superStarPoolAmount}`);

        // 4. Find all Active Users and calculate their rankings
        // We find all verified users and check their global team count
        const allUsers = await User.find({ status: 'active', verified: true });

        const starAchievers = [];
        const doubleStarAchievers = [];
        const superStarAchievers = [];

        for (const user of allUsers) {
            const directReferralCount = await User.countDocuments({ referredBy: user._id, verified: true });

            // Accumulative Logic (Users can belong to multiple pools)
            if (directReferralCount >= 6) {
                starAchievers.push(user);
            }
            if (directReferralCount >= 18) {
                doubleStarAchievers.push(user);
            }
            if (directReferralCount >= 36) {
                superStarAchievers.push(user);
            }
        }

        console.log(`Achievers Count - Star: ${starAchievers.length}, Double Star: ${doubleStarAchievers.length}, Super Star: ${superStarAchievers.length}`);

        // 5. Calculate per-achiever payouts
        // If a pool has no achievers, that money is effectively saved in the system.
        const starPayoutPerUser = starAchievers.length > 0 ? Math.floor(starPoolAmount / starAchievers.length) : 0;
        const doubleStarPayoutPerUser = doubleStarAchievers.length > 0 ? Math.floor(doubleStarPoolAmount / doubleStarAchievers.length) : 0;
        const superStarPayoutPerUser = superStarAchievers.length > 0 ? Math.floor(superStarPoolAmount / superStarAchievers.length) : 0;

        const payouts = [];
        const distributionTime = new Date();

        // 6. Distribute to Star Achievers
        if (starPayoutPerUser > 0) {
            console.log(`Distributing ₹${starPayoutPerUser} to ${starAchievers.length} Star achievers...`);
            for (const user of starAchievers) {
                const currentRoyalty = user.wallet?.royalty || 0;
                const availableRoom = ROYALTY_CAPS.STAR - currentRoyalty;

                if (availableRoom <= 0) {
                    console.log(`User ${user.username} reached Star royalty cap. Skipping.`);
                    continue;
                }

                const finalPayout = Math.min(starPayoutPerUser, availableRoom);

                user.wallet.balance += finalPayout;
                user.wallet.totalEarnings += finalPayout;
                user.wallet.royalty = (user.wallet.royalty || 0) + finalPayout;
                await user.save({ validateBeforeSave: false });

                await Transaction.create({
                    user: user._id,
                    type: 'Royalty',
                    description: `Weekly Royalty Bonus (Star Pool - 3%)${finalPayout < starPayoutPerUser ? ' [CAP REACHED]' : ''}`,
                    amount: finalPayout,
                    status: 'credit'
                });
            }
            payouts.push(`Paid to ${starAchievers.length} Star achievers (subject to ₹10k cap).`);
        }

        // 7. Distribute to Double Star Achievers
        if (doubleStarPayoutPerUser > 0) {
            console.log(`Distributing ₹${doubleStarPayoutPerUser} to ${doubleStarAchievers.length} Double Star achievers...`);
            for (const user of doubleStarAchievers) {
                const currentRoyalty = user.wallet?.royalty || 0;
                const availableRoom = ROYALTY_CAPS.DOUBLE_STAR - currentRoyalty;

                if (availableRoom <= 0) {
                    console.log(`User ${user.username} reached Double Star royalty cap. Skipping.`);
                    continue;
                }

                const finalPayout = Math.min(doubleStarPayoutPerUser, availableRoom);

                user.wallet.balance += finalPayout;
                user.wallet.totalEarnings += finalPayout;
                user.wallet.royalty = (user.wallet.royalty || 0) + finalPayout;
                await user.save({ validateBeforeSave: false });

                await Transaction.create({
                    user: user._id,
                    type: 'Royalty',
                    description: `Weekly Royalty Bonus (Double Star Pool - 6%)${finalPayout < doubleStarPayoutPerUser ? ' [CAP REACHED]' : ''}`,
                    amount: finalPayout,
                    status: 'credit'
                });
            }
            payouts.push(`Paid to ${doubleStarAchievers.length} Double Star achievers (subject to ₹50k cap).`);
        }

        // 8. Distribute to Super Star Achievers
        if (superStarPayoutPerUser > 0) {
            console.log(`Distributing ₹${superStarPayoutPerUser} to ${superStarAchievers.length} Super Star achievers...`);
            for (const user of superStarAchievers) {
                const currentRoyalty = user.wallet?.royalty || 0;
                const availableRoom = ROYALTY_CAPS.SUPER_STAR - currentRoyalty;

                if (availableRoom <= 0) {
                    console.log(`User ${user.username} reached Super Star royalty cap. Skipping.`);
                    continue;
                }

                const finalPayout = Math.min(superStarPayoutPerUser, availableRoom);

                user.wallet.balance += finalPayout;
                user.wallet.totalEarnings += finalPayout;
                user.wallet.royalty = (user.wallet.royalty || 0) + finalPayout;
                await user.save({ validateBeforeSave: false });

                await Transaction.create({
                    user: user._id,
                    type: 'Royalty',
                    description: `Weekly Royalty Bonus (Super Star Pool - 11%)${finalPayout < superStarPayoutPerUser ? ' [CAP REACHED]' : ''}`,
                    amount: finalPayout,
                    status: 'credit'
                });
            }
            payouts.push(`Paid to ${superStarAchievers.length} Super Star achievers (subject to ₹100k cap).`);
        }

        // 9. Update last distribution date in Revenue
        await Revenue.findOneAndUpdate(
            {},
            { $set: { lastRoyaltyDistribution: distributionTime } },
            { upsert: true }
        );

        console.log('=== WEEKLY ROYALTY DISTRIBUTION COMPLETE ===');

        res.status(200).json({
            message: "Weekly Royalty Bonus distributed successfully",
            stats: {
                newActivations: newActivationsCount,
                pools: {
                    star: starPoolAmount,
                    doubleStar: doubleStarPoolAmount,
                    superStar: superStarPoolAmount
                },
                achievers: {
                    star: starAchievers.length,
                    doubleStar: doubleStarAchievers.length,
                    superStar: superStarAchievers.length
                },
                payouts
            }
        });

    } catch (error) {
        console.error('❌ Weekly Royalty distribution error:', error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getRoyaltyStats = async (req, res) => {
    try {
        const Transaction = (await import('../Models/transactionModel.js')).default;

        // 1. Total Royalty Paid
        const totalPaidRes = await Transaction.aggregate([
            { $match: { type: 'Royalty', status: 'credit' } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const totalPaid = totalPaidRes.length > 0 ? totalPaidRes[0].total : 0;

        // 2. Weekly Payout (last 7 days)
        const weeklyPaidRes = await Transaction.aggregate([
            {
                $match: {
                    type: 'Royalty',
                    status: 'credit',
                    createdAt: { $gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                }
            },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const weeklyPaid = weeklyPaidRes.length > 0 ? weeklyPaidRes[0].total : 0;

        // 3. Qualifier Counts
        const allUsers = await User.find({ status: 'active', verified: true });
        let starCount = 0;
        let doubleStarCount = 0;
        let superStarCount = 0;

        for (const user of allUsers) {
            const directReferralCount = await User.countDocuments({ referredBy: user._id, verified: true });
            if (directReferralCount >= 6) starCount++;
            if (directReferralCount >= 18) doubleStarCount++;
            if (directReferralCount >= 36) superStarCount++;
        }

        res.json({
            totalPaid,
            weeklyPaid,
            starCount,
            doubleStarCount,
            superStarCount
        });
    } catch (error) {
        console.error('Error fetching royalty stats:', error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// ─── Helper: Count verified direct referrals ───────────
const getDirectReferralCount = async (userId) => {
    return await User.countDocuments({ referredBy: userId, verified: true });
};
