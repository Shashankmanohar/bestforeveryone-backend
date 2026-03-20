import User from '../Models/userModels.js';
import Transaction from '../Models/transactionModel.js';
import Revenue from '../Models/revenueModel.js';

/**
 * Distributes Weekly Royalty Bonus
 * Calculation:
 * - 200 Rs per new active ID (verified users) since the last distribution
 * - Star Pool (3% = 30 Rs/ID) -> Users with exactly >= 6 Directs and < 12 Directs
 * - Double Star Pool (6% = 60 Rs/ID) -> Users with exactly >= 12 Directs and < 18 Directs
 * - Super Star Pool (11% = 110 Rs/ID) -> Users with >= 18 Directs
 * Note: Not Accumulative - An achiever only gets a share from their highest qualified pool.
 */
export const distributeWeeklyRoyalty = async (req, res) => {
    try {
        console.log('=== STARTING WEEKLY ROYALTY DISTRIBUTION ===');

        // 1. Get the date of the last royalty distribution
        const revenueData = await Revenue.findOne({});
        const lastDistributionDate = revenueData?.lastRoyaltyDistribution || new Date(0); // If never run, count from beginning

        console.log(`Counting new joinings since: ${lastDistributionDate}`);

        // 2. Count new verified users (activations) since last distribution
        const newActivationsCount = await User.countDocuments({
            verified: true,
            updatedAt: { $gt: lastDistributionDate } // Assuming verification updates the updatedAt field
        });

        console.log(`Total new activations this week: ${newActivationsCount}`);

        if (newActivationsCount === 0) {
            return res.status(200).json({ message: "No new activations this week to distribute royalty." });
        }

        // 3. Calculate Pool Amounts
        // Total Royalty Fund = Rs 200 per ID (split as 30, 60, 110)
        const starPoolAmount = newActivationsCount * 30;       // 3% 
        const doubleStarPoolAmount = newActivationsCount * 60; // 6%
        const superStarPoolAmount = newActivationsCount * 110; // 11%

        console.log(`Pools - Star: ₹${starPoolAmount}, Double Star: ₹${doubleStarPoolAmount}, Super Star: ₹${superStarPoolAmount}`);

        // 4. Find all Active Users and count their direct referrals
        const allUsers = await User.find({ status: 'active', verified: true });

        const starAchievers = [];
        const doubleStarAchievers = [];
        const superStarAchievers = [];

        for (const user of allUsers) {
            const directsCount = await User.countDocuments({ referredBy: user._id, verified: true });

            if (directsCount >= 18) {
                // NOT Accumulative: Only add to Super Star pool
                superStarAchievers.push(user);
            } else if (directsCount >= 12) {
                // NOT Accumulative: Only add to Double Star pool
                doubleStarAchievers.push(user);
            } else if (directsCount >= 6) {
                // NOT Accumulative: Only add to Star pool
                starAchievers.push(user);
            }
        }

        console.log(`Achievers Count - Star: ${starAchievers.length}, Double Star: ${doubleStarAchievers.length}, Super Star: ${superStarAchievers.length}`);

        // 5. Calculate per-achiever payouts
        const starPayoutPerUser = starAchievers.length > 0 ? Math.floor(starPoolAmount / starAchievers.length) : 0;
        const doubleStarPayoutPerUser = doubleStarAchievers.length > 0 ? Math.floor(doubleStarPoolAmount / doubleStarAchievers.length) : 0;
        const superStarPayoutPerUser = superStarAchievers.length > 0 ? Math.floor(superStarPoolAmount / superStarAchievers.length) : 0;

        const payouts = [];

        // 6. Distribute to Star Achievers
        if (starPayoutPerUser > 0) {
            for (const user of starAchievers) {
                user.wallet.balance += starPayoutPerUser;
                user.wallet.totalEarnings += starPayoutPerUser;
                user.wallet.royalty += starPayoutPerUser;

                await Transaction.create({
                    user: user._id,
                    type: 'Royalty',
                    description: `Weekly Royalty Bonus (Star Pool - 3%)`,
                    amount: starPayoutPerUser,
                    status: 'credit'
                });

                await user.save();
            }
            payouts.push(`Paid ₹${starPayoutPerUser} to ${starAchievers.length} Star achievers.`);
        }

        // 7. Distribute to Double Star Achievers
        if (doubleStarPayoutPerUser > 0) {
            for (const user of doubleStarAchievers) {
                user.wallet.balance += doubleStarPayoutPerUser;
                user.wallet.totalEarnings += doubleStarPayoutPerUser;
                user.wallet.royalty += doubleStarPayoutPerUser;

                await Transaction.create({
                    user: user._id,
                    type: 'Royalty',
                    description: `Weekly Royalty Bonus (Double Star Pool - 6%)`,
                    amount: doubleStarPayoutPerUser,
                    status: 'credit'
                });

                await user.save();
            }
            payouts.push(`Paid ₹${doubleStarPayoutPerUser} to ${doubleStarAchievers.length} Double Star achievers.`);
        }

        // 8. Distribute to Super Star Achievers
        if (superStarPayoutPerUser > 0) {
            for (const user of superStarAchievers) {
                user.wallet.balance += superStarPayoutPerUser;
                user.wallet.totalEarnings += superStarPayoutPerUser;
                user.wallet.royalty += superStarPayoutPerUser;

                await Transaction.create({
                    user: user._id,
                    type: 'Royalty',
                    description: `Weekly Royalty Bonus (Super Star Pool - 11%)`,
                    amount: superStarPayoutPerUser,
                    status: 'credit'
                });

                await user.save();
            }
            payouts.push(`Paid ₹${superStarPayoutPerUser} to ${superStarAchievers.length} Super Star achievers.`);
        }

        // 9. Update last distribution date
        await Revenue.findOneAndUpdate(
            {},
            { $set: { lastRoyaltyDistribution: new Date() } },
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
            const directsCount = await User.countDocuments({ referredBy: user._id, verified: true });
            if (directsCount >= 18) superStarCount++;
            else if (directsCount >= 12) doubleStarCount++;
            else if (directsCount >= 6) starCount++;
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
