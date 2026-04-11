import User from "../Models/userModels.js";
import Matrix from "../Models/matrixModel.js";
import Leadership from "../Models/leadershipModel.js";
import Transaction from "../Models/transactionModel.js";

export const getMatrixStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('matrix isReEntryPending verified');

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // --- Calculate Queue Position ---
        let queuePosition = 0;
        let globalWaitlistLength = 0;
        let queueRank = 0;

        const isMatrixActive = user.verified && !user.isReEntryPending;
        const isPaymentSubmitted = user.paymentStatus === 'submitted';

        if ((isMatrixActive || isPaymentSubmitted) && user.matrix.lastActivatedAt) {
            // 1. Get all users ahead of this user in the FIFO queue
            // We count people who:
            // - ARE verified AND NOT pending re-entry (Active parents)
            // - OR have SUBMITTED payment (Waiting to be parents)
            // AND have an earlier lastActivatedAt
            const aheadUsers = await User.find({
                _id: { $ne: user._id },
                $or: [
                    { verified: true, isReEntryPending: { $ne: true } },
                    { paymentStatus: 'submitted' }
                ],
                "matrix.lastActivatedAt": { $ne: null, $lt: user.matrix.lastActivatedAt },
                "matrix.level1.filled": { $lt: 6 }
            }).select('matrix.level1.filled');

            // 2. Sum the remaining slots for all users ahead
            globalWaitlistLength = aheadUsers.reduce((sum, u) => sum + (6 - u.matrix.level1.filled), 0);
            
            // NEW: queueRank is your index in the line (1st, 2nd, 3rd, etc.)
            queueRank = aheadUsers.length + 1;
            // 3. This user's personal position (how many global signups until their first child?)
            queuePosition = globalWaitlistLength + 1;
        }

        // Get total active parents in matrix
        const totalActiveParents = await User.countDocuments({
            verified: true,
            isReEntryPending: { $ne: true },
            "matrix.lastActivatedAt": { $ne: null },
            "matrix.level1.filled": { $lt: 6 }
        });

        res.json({
            matrix: user.matrix,
            isReEntryPending: user.isReEntryPending || (user.matrix && user.matrix.isReEntryPending),
            paymentStatus: user.paymentStatus,
            queuePosition,
            queueRank,
            globalWaitlistLength,
            totalActiveParents
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getMatrixTree = async (req, res) => {
    try {
        const { cycle } = req.query;
        const user = await User.findById(req.user.id).select('matrix');

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const targetCycle = cycle ? parseInt(cycle) : user.matrix.cycle;

        // Get user's matrix positions for specific cycle
        const level1Members = await Matrix.find({
            parent: req.user.id,
            user: { $ne: req.user.id },
            level: 1,
            cycle: targetCycle
        }).populate('user', 'fullname email');

        const targetUser = await User.findById(req.user.id).select('matrix isReEntryPending paymentStatus');
        
        res.json({
            currentCycle: targetCycle,
            maxCycle: targetUser.matrix.cycle,
            paymentStatus: targetUser.paymentStatus,
            isReEntryPending: targetUser.matrix.isReEntryPending || targetUser.isReEntryPending, 
            level1: level1Members.map(m => ({
                id: m._id,
                user: m.user,
                position: m.position,
                filled: m.filled,
                createdAt: m.createdAt
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const adminGetMatrixTree = async (req, res) => {
    try {
        const { userId } = req.params;
        const { cycle } = req.query;

        const user = await User.findById(userId).select('fullname username matrix');
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const targetCycle = cycle ? parseInt(cycle) : user.matrix.cycle;

        // Get user's matrix positions for specific cycle
        const level1Members = await Matrix.find({
            parent: userId,
            user: { $ne: userId },
            level: 1,
            cycle: targetCycle
        }).populate('user', 'fullname email username');

        res.json({
            user,
            currentCycle: targetCycle,
            maxCycle: user.matrix.cycle,
            isReEntryPending: user.matrix.isReEntryPending || user.isReEntryPending,
            level1: level1Members.map(m => ({
                id: m._id,
                user: m.user,
                position: m.position,
                filled: m.filled,
                createdAt: m.createdAt
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
        // We use matrix.lastActivatedAt for a fair FIFO queue
        const parent = await User.findOne({
            _id: { $ne: userId }, // Exclude self from being their own parent
            verified: true,
            isReEntryPending: { $ne: true }, // ONLY users who are NOT pending re-entry can be parents
            "matrix.lastActivatedAt": { $ne: null }, // MUST have an activation timestamp
            "matrix.level1.filled": { $lt: 6 }
        }).sort({ "matrix.lastActivatedAt": 1, createdAt: 1 }); // FIFO sorting

        if (!parent) {
            console.log('❌ No eligible global parent found in the matrix.');
            return;
        }

        console.log('Global Parent Selected:', parent.fullname, `(${parent._id})`);
        console.log('Current Global Parent Matrix Status:');
        console.log('  Level 1:', parent.matrix.level1.filled, '/', parent.matrix.level1.total);
        console.log('  Cycle:', parent.matrix.cycle);

        // Check if user already has a matrix placement in their current cycle
        // A user can have multiple Matrix records over time, so we check for the current cycle
        const existingPlacement = await Matrix.findOne({
            user: userId,
            parent: parent._id,
            cycle: parent.matrix.cycle
        });

        if (existingPlacement) {
            console.log(`User ${userId} already has a matrix placement for this cycle. Skipping.`);
            return;
        }

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

        parent.matrix.level1.filled += 1;
        await parent.save();
        console.log('✅ Placed in Level 1. New filled count:', parent.matrix.level1.filled);

        // Check if Level 1 completed
        if (parent.matrix.level1.filled >= parent.matrix.level1.total) {
            console.log('🎉 LEVEL 1 COMPLETED FOR GLOBAL PARENT!');

            // Increment cycle
            parent.matrix.cycle += 1;
            parent.matrix.level1.filled = 0;

            // --- Complete Matrix Payment of Rs 2400 ---
            // Pass the parent object directly to avoid overwriting wallet balance
            await creditCompleteMatrixIncome(parent);

            // Deactivate for Re-entry (One Time per activation)
            console.log(`⚠️ User ${parent.fullname} has completed a matrix cycle. Setting isReEntryPending to true.`);
            parent.isReEntryPending = true;
            if (parent.matrix) {
                parent.matrix.isReEntryPending = true; // For double safety
            }
            await parent.save();
        }

        console.log('=== GLOBAL MATRIX PLACEMENT COMPLETE ===');
    } catch (error) {
        console.error('❌ Matrix placement error:', error);
        console.error('Error stack:', error.stack);
    }
};

const creditCompleteMatrixIncome = async (user) => {
    try {
        if (!user) return;

        // Auto Recycling Income: ₹2400 per completed cycle
        // No longer limiting to cycle 1 to allow multiple paid cycles

        const incomeAmount = 2400; // Complete Matrix Income: ₹2400 (6 members)
        console.log(`💰 Crediting Complete Matrix Income (Cycle ${user.matrix.cycle - 1}) to Matrix Wallet: ₹${incomeAmount}`);

        user.wallet.matrixWallet += incomeAmount;
        user.wallet.totalEarnings += incomeAmount;
        user.wallet.matrixIncome += incomeAmount;
        await user.save();

        // Create matrix income transaction
        await Transaction.create({
            user: user._id,
            type: 'Matrix Income',
            description: `Auto Recycling Completion (Cycle ${user.matrix.cycle - 1})`,
            amount: incomeAmount,
            status: 'credit'
        });
    } catch (error) {
        console.error('❌ Credit complete matrix income error:', error);
    }
};

export const getMatrixHistory = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('matrix');
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const completedCount = user.matrix.cycle - 1;
        const history = [];

        for (let c = 1; c <= completedCount; c++) {
            const lastMember = await Matrix.findOne({
                parent: req.user.id,
                cycle: c,
                position: 6,
                level: 1
            }).select('createdAt');

            history.push({
                cycle: c,
                completedAt: lastMember ? lastMember.createdAt : null,
                status: 'Completed'
            });
        }

        history.sort((a, b) => b.cycle - a.cycle);
        res.json({ history });
    } catch (error) {
        console.error('Error fetching matrix history:', error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const submitReEntryPayment = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Consolidated check: check both locations for backward compatibility
        const isPending = user.isReEntryPending || (user.matrix && user.matrix.isReEntryPending);

        if (!isPending) {
            console.log(`❌ Re-entry failed for ${user.username}: isPending=false`);
            return res.status(400).json({ 
                message: "No re-entry pending for this user",
                paymentStatus: user.paymentStatus,
                isReEntryPending: false
            });
        }

        if (user.paymentStatus === 'submitted') {
            console.log(`❌ Re-entry failed for ${user.username}: already submitted`);
            return res.status(400).json({ 
                message: "Re-entry payment already submitted",
                paymentStatus: user.paymentStatus,
                isReEntryPending: isPending
            });
        }

        user.paymentStatus = 'submitted';
        if (!user.paymentProof) {
            user.paymentProof = {};
        }
        user.paymentProof.submittedAt = new Date();
        
        // Set lastActivatedAt at submission time so FIFO depends on when they clicked "Done"
        if (!user.matrix) user.matrix = {};
        user.matrix.lastActivatedAt = new Date();
        
        await user.save();

        res.json({
            message: "Re-entry payment submitted successfully. Waiting for admin approval.",
            paymentStatus: user.paymentStatus
        });
    } catch (error) {
        console.error('Error submitting re-entry:', error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
