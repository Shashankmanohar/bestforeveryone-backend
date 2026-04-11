import Epin from "../Models/epinModel.js";
import User from "../Models/userModels.js";
import Transaction from "../Models/transactionModel.js";
import Revenue from "../Models/revenueModel.js";
import crypto from "crypto";

// Generate a random unique E-pin
const generatePin = async () => {
    let pin;
    let exists = true;
    while (exists) {
        pin = crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 characters
        const found = await Epin.findOne({ pin });
        if (!found) exists = false;
    }
    return pin;
};

export const buyEpin = async (req, res) => {
    try {
        const userId = req.user.id;
        const amount = 1357; // 1180 + 15% charge
        const adminFee = 177; // 15% of 1180

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.wallet.balance < amount) {
            return res.status(400).json({ message: "Insufficient balance" });
        }

        // Deduct balance
        user.wallet.balance -= amount;
        await user.save();

        // Generate Pin
        const pinCode = await generatePin();

        // Create E-pin
        const epin = await Epin.create({
            pin: pinCode,
            owner: userId,
            amount,
        });

        // Create Transaction
        await Transaction.create({
            user: userId,
            type: "E-pin Purchase",
            description: `Purchased E-pin: ${pinCode}`,
            amount,
            status: "debit",
        });

        // Update Platform Revenue
        await Revenue.findOneAndUpdate(
            {},
            {
                $inc: {
                    totalRevenue: amount,
                    totalJoiningFees: amount,
                    totalAdminFees: adminFee
                },
                $set: { lastUpdated: new Date() },
            },
            { upsert: true, new: true }
        );

        res.status(201).json({
            message: "E-pin purchased successfully",
            epin,
            newBalance: user.wallet.balance,
        });
    } catch (error) {
        console.error("Buy E-pin error:", error);
        res.status(500).json({ message: error.message || "Internal Server Error" });
    }
};

export const getMyEpins = async (req, res) => {
    try {
        const userId = req.user.id;
        const epins = await Epin.find({ owner: userId }).sort({ createdAt: -1 });
        res.json({ epins });
    } catch (error) {
        console.error("Get Epins error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const useEpin = async (req, res) => {
    try {
        const activatorId = req.user.id;
        const { pin, targetUsername } = req.body;

        if (!pin || !targetUsername) {
            return res.status(400).json({ message: "Pin and target username are required" });
        }

        // 1. Find E-pin
        const epin = await Epin.findOne({ pin, status: "active" });
        if (!epin) {
            return res.status(400).json({ message: "Invalid or already used E-pin" });
        }

        // 2. Find target user
        const targetUser = await User.findOne({ username: targetUsername });
        if (!targetUser) {
            return res.status(404).json({ message: "Target user not found" });
        }

        if (targetUser.verified) {
            return res.status(400).json({ message: "Target user is already verified" });
        }

        const activator = await User.findById(activatorId);

        // 3. Process Activation
        // Mark E-pin as used
        epin.status = "used";
        epin.usedBy = targetUser._id;
        epin.usedAt = new Date();
        await epin.save();

        // Activate target user
        targetUser.verified = true;
        targetUser.paymentStatus = "approved";
        targetUser.matrix.lastActivatedAt = new Date(); // Set activation time for FIFO
        targetUser.paymentProof = {
            ...targetUser.paymentProof,
            approvedAt: new Date(),
            approvedBy: activatorId, // The person who used the pin
        };
        await targetUser.save();

        // Create credit transaction for target user
        await Transaction.create({
            user: targetUser._id,
            type: "Account Activation",
            description: `Activated using E-pin by: ${activator ? activator.username : 'User'}`,
            amount: epin.amount,
            status: "credit",
        });

        // 4. Trigger referral/matrix logic
        const { processReferralSignup } = await import("./referralController.js");
        const { processMatrixPlacement } = await import("./matrixController.js");

        // RESET MATRIX IF REACTIVATING (Re-entry)
        const isReentry = targetUser.isReEntryPending || (targetUser.matrix && (targetUser.matrix.isReEntryPending || targetUser.matrix.cycle > 1));

        if (isReentry) {
            console.log(`🔄 Resetting matrix for re-entering user: ${targetUser.fullname}`);
            targetUser.matrix.level1.filled = 0;
            targetUser.isReEntryPending = false;
            if (targetUser.matrix) {
                targetUser.matrix.isReEntryPending = false;
            }
            targetUser.matrix.lastActivatedAt = new Date(); // Move to back of FIFO queue
            await targetUser.save();
        }

        if (targetUser.referredBy) {
            console.log('📝 [useEpin] Processing referral signup for referrer:', targetUser.referredBy);
            await processReferralSignup(targetUser.referredBy, targetUser._id);
        }

        console.log('📝 [useEpin] Processing matrix placement for user:', targetUser._id);
        await processMatrixPlacement(targetUser._id, targetUser.referredBy);

        // 5. Update Platform Revenue (counted when E-pin was BOUGHT would be double counting if we count here too? 
        // Usually revenue is counted at the moment money enters the system. 
        // In buyEpin, money left the user wallet and became an E-pin. 
        // That's when revenue should probably be counted.
        // Let's check how revenue is handled in activateOtherUser.

        // Actually, let's update revenue in buyEpin instead of here to avoid double counting if they buy many pins.
        // Or, count it here and NOT in buyEpin? 
        // If I buy a pin, the money is gone from my wallet. It's revenue for the platform now.

        res.json({
            message: `User ${targetUser.username} activated successfully using E-pin!`,
        });
    } catch (error) {
        console.error("Use E-pin error:", error);
        res.status(500).json({ message: error.message || "Internal Server Error" });
    }
};

// Admin Functions
export const adminCreateEpins = async (req, res) => {
    try {
        const { count, amount } = req.body;
        const pinCount = parseInt(count) || 1;
        const pinAmount = parseFloat(amount) || 1357;

        if (pinCount > 100) {
            return res.status(400).json({ message: "Cannot generate more than 100 pins at once" });
        }

        const pins = [];
        for (let i = 0; i < pinCount; i++) {
            const pinCode = await generatePin();
            pins.push({
                pin: pinCode,
                owner: req.user.id, // Admin is the initial owner
                amount: pinAmount,
            });
        }

        const createdPins = await Epin.insertMany(pins);

        res.status(201).json({
            message: `${pinCount} E-pins generated successfully`,
            pins: createdPins,
        });
    } catch (error) {
        console.error("Admin Create E-pins error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const adminGetAllEpins = async (req, res) => {
    try {
        const epins = await Epin.find()
            .populate("owner", "username fullname")
            .populate("usedBy", "username fullname")
            .sort({ createdAt: -1 });
        res.json({ epins });
    } catch (error) {
        console.error("Admin Get All Epins error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const adminAssignEpin = async (req, res) => {
    try {
        const { pinIds, targetUsername } = req.body;

        if (!pinIds || !Array.isArray(pinIds) || pinIds.length === 0) {
            return res.status(400).json({ message: "No E-pin IDs provided" });
        }

        const targetUser = await User.findOne({ username: targetUsername });
        if (!targetUser) {
            return res.status(404).json({ message: "Target user not found" });
        }

        // Only update pins that are currently active
        const result = await Epin.updateMany(
            { _id: { $in: pinIds }, status: "active" },
            { $set: { owner: targetUser._id } }
        );

        res.json({
            message: `${result.modifiedCount} E-pins assigned to ${targetUser.username} successfully`,
            totalRequested: pinIds.length,
            assignedCount: result.modifiedCount
        });
    } catch (error) {
        console.error("Admin Bulk Assign E-pin error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const adminGetEpinStats = async (req, res) => {
    try {
        const total = await Epin.countDocuments();
        const used = await Epin.countDocuments({ status: "used" });
        const active = await Epin.countDocuments({ status: "active" });

        res.json({
            stats: {
                total,
                used,
                active,
            }
        });
    } catch (error) {
        console.error("Admin E-pin Stats error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
