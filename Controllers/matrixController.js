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
        }).populate('user', 'fullname email');

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

export const processMatrixPlacement = async (userId, referrerId) => {
    try {
        console.log('=== STARTING GLOBAL MATRIX PLACEMENT ===');
        console.log('User ID:', userId);

        // Find the global parent (the oldest active user who still has space in their Level 1)
        // We ensure we only search for users who are verified (active) and haven't finished their cycle
        const parent = await User.findOne({
            verified: true,
            "matrix.level1.filled": { $lt: 6 },
            "matrix.cycle": { $lte: 1 } // Only considering cycle 1 as per "one time" rule
        }).sort({ createdAt: 1 }); // Oldest first (top-to-bottom, left-to-right)

        if (!parent) {
            console.log('❌ No eligible global parent found in the matrix.');
            return;
        }

        console.log('Global Parent Selected:', parent.fullname, `(${parent._id})`);
        console.log('Current Global Parent Matrix Status:');
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
            // Place in Level 1 under the global parent
            const position = parent.matrix.level1.filled + 1;
            console.log('➡️  Placing in Level 1, Position:', position);

            await Matrix.create({
                user: userId,
                parent: parent._id,
                level: 1,
                position,
                cycle: parent.matrix.cycle
            });

            // --- Gradual Payment of Rs 400 per placement to the global parent ---
            await creditGradualMatrixIncome(parent._id, userId, position);

            parent.matrix.level1.filled += 1;
            await parent.save();
            console.log('✅ Placed in Level 1. New filled count:', parent.matrix.level1.filled);

            // Check if Level 1 completed
            if (parent.matrix.level1.filled === parent.matrix.level1.total) {
                console.log('🎉 LEVEL 1 COMPLETED FOR GLOBAL PARENT!');

                // User has completed their 1 time matrix cycle
                parent.matrix.cycle += 1;
                parent.matrix.level1.filled = 0;

                // CHECK CYCLE LIMIT (Max 1) - One Time from one Active ID only
                if (parent.matrix.cycle > 1) {
                    console.log(`⚠️ User ${parent.fullname} has completed 1 matrix cycle. They will not receive further matrix income. Deactivating for reactivation if necessary.`);
                    parent.verified = false;
                    parent.paymentStatus = 'pending';
                }

                await parent.save();
                console.log('🔄 Matrix reset for new cycle:', parent.matrix.cycle);
            }
        } else {
            console.log('⚠️  Matrix full! Level 1 completed.');
        }

        console.log('=== GLOBAL MATRIX PLACEMENT COMPLETE ===');
    } catch (error) {
        console.error('❌ Matrix placement error:', error);
        console.error('Error stack:', error.stack);
    }
};

const creditGradualMatrixIncome = async (userId, placedUserId, position) => {
    try {
        const user = await User.findById(userId);
        if (!user) return;

        // Auto Recycling Income Limit: 1 time (Maximum per ID - one Time Rs 2400 total)
        if (user.matrix.cycle > 1) {
            console.log(`⏹️ Cycle limit reached (${user.matrix.cycle}). No matrix income credited.`);
            return;
        }

        const placedUser = await User.findById(placedUserId);
        const placedUserName = placedUser ? placedUser.fullname : 'Unknown';

        const incomeAmount = 400; // Gradual Member Income: ₹400 per placement
        console.log(`💰 Crediting Matrix Income (Cycle ${user.matrix.cycle}, Pos ${position}) to Main Balance: ₹${incomeAmount}`);

        user.wallet.balance += incomeAmount;
        user.wallet.totalEarnings += incomeAmount;
        user.wallet.matrixIncome += incomeAmount;
        await user.save();

        // Create matrix income transaction
        await Transaction.create({
            user: userId,
            type: 'Matrix Income',
            description: `Auto Recycling (Cycle ${user.matrix.cycle}, Position ${position} - ${placedUserName})`,
            amount: incomeAmount,
            status: 'credit'
        });
    } catch (error) {
        console.error('❌ Credit gradual matrix income error:', error);
    }
};

// Matrix leadership royalty has been removed in the new plan
// (as the 1000 Rs distribution is strict: 200 Direct, 200 Bonanza, 200 Royalty, 400 Matrix)
