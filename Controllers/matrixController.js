import User from '../Models/userModels.js';
import Matrix from '../Models/matrixModel.js';
import Leadership from '../Models/leadershipModel.js';
import Transaction from '../Models/transactionModel.js';

export const getMatrixStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('matrix');

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ matrix: user.matrix });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getMatrixTree = async (req, res) => {
    try {
        // Get user's matrix positions
        const level1Members = await Matrix.find({
            parent: req.user.id,
            level: 1
        }).populate('user', 'fullname phone');

        res.json({
            level1: level1Members.map(m => ({
                id: m._id,
                user: m.user,
                position: m.position,
                filled: m.filled
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const processMatrixPlacement = async (userId, parentId) => {
    try {
        console.log('=== STARTING MATRIX PLACEMENT ===');
        console.log('User ID:', userId);
        console.log('Parent ID:', parentId);

        const parent = await User.findById(parentId);
        if (!parent) {
            console.log('❌ Parent not found');
            return;
        }

        console.log('Parent:', parent.fullname);
        console.log('Current Matrix Status:');
        console.log('  Level 1:', parent.matrix.level1.filled, '/', parent.matrix.level1.total);
        console.log('  Cycle:', parent.matrix.cycle);

        // Check if user already has a matrix placement
        const existingPlacement = await Matrix.findOne({ user: userId });
        if (existingPlacement) {
            console.log(`User ${userId} already has a matrix placement. Skipping.`);
            return;
        }

        // Check Level 1 first
        if (parent.matrix.level1.filled < parent.matrix.level1.total) {
            // Place in Level 1
            const position = parent.matrix.level1.filled + 1;
            console.log('➡️  Placing in Level 1, Position:', position);

            await Matrix.create({
                user: userId,
                parent: parentId,
                level: 1,
                position,
                cycle: parent.matrix.cycle
            });

            parent.matrix.level1.filled += 1;
            await parent.save();
            console.log('✅ Placed in Level 1. New filled count:', parent.matrix.level1.filled);

            // Check if Level 1 completed
            if (parent.matrix.level1.filled === parent.matrix.level1.total) {
                console.log('🎉 LEVEL 1 COMPLETED!');
                await creditMatrixIncome(parentId, 1);
                // Increment cycle and reset for new cycle
                parent.matrix.cycle += 1;
                parent.matrix.level1.filled = 0;

                // CHECK CYCLE LIMIT (Max 5)
                if (parent.matrix.cycle > 5) {
                    console.log(`⚠️ User ${parent.fullname} has completed 5 cycles. Deactivating for reactivation.`);
                    parent.verified = false;
                    parent.paymentStatus = 'pending';
                }

                await parent.save();
                console.log('🔄 Matrix reset for new cycle:', parent.matrix.cycle);
            }
        } else {
            console.log('⚠️  Matrix full! Level 1 completed.');
        }

        console.log('=== MATRIX PLACEMENT COMPLETE ===');
    } catch (error) {
        console.error('❌ Matrix placement error:', error);
        console.error('Error stack:', error.stack);
    }
};

const creditMatrixIncome = async (userId, level) => {
    try {
        const user = await User.findById(userId);
        if (!user) return;

        // Auto Recycling Income Limit: 5 times (Maximum per ID)
        if (user.matrix.cycle > 5) {
            console.log(`⏹️ Cycle limit reached (${user.matrix.cycle}). No matrix income credited.`);
            return;
        }

        const incomeAmount = 1200; // Member Income: ₹1,200
        console.log(`💰 Crediting Matrix Level ${level} Income (Cycle ${user.matrix.cycle}) to Matrix Wallet: ₹${incomeAmount}`);

        user.wallet.matrixWallet += incomeAmount;
        user.wallet.totalEarnings += incomeAmount;
        user.wallet.matrixIncome += incomeAmount;
        await user.save();

        // Create matrix income transaction
        await Transaction.create({
            user: userId,
            type: 'Matrix Income',
            description: `Auto Recycling (Cycle ${user.matrix.cycle})`,
            amount: incomeAmount,
            status: 'credit'
        });

        // Leadership Referral Royalty: Rs.500/- again & again
        if (user.referredBy) {
            const referrer = await User.findById(user.referredBy);
            if (referrer) {
                const royaltyAmount = 500;
                console.log(`👑 Crediting Leadership Referral Royalty to ${referrer.fullname}: ₹${royaltyAmount}`);

                referrer.wallet.balance += royaltyAmount;
                referrer.wallet.totalEarnings += royaltyAmount;
                referrer.wallet.royalty += royaltyAmount; // Using existing royalty field
                await referrer.save();

                await Transaction.create({
                    user: referrer._id,
                    type: 'Leadership',
                    description: `Leadership Royalty from: ${user.fullname}`,
                    amount: royaltyAmount,
                    status: 'credit'
                });

                // Create leadership log for dedicated history
                await Leadership.create({
                    user: referrer._id,
                    downlineUser: userId,
                    amount: royaltyAmount,
                    trigger: `Matrix Royalty: ${user.fullname}`,
                    credited: true
                });
            }
        }
    } catch (error) {
        console.error('❌ Credit matrix income error:', error);
    }
};
