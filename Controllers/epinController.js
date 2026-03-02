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
        if (targetUser.referredBy) {
            const { processReferralSignup } = await import("./referralController.js");
            const { processMatrixPlacement } = await import("./matrixController.js");

            if (targetUser.matrix && targetUser.matrix.cycle > 5) {
                targetUser.matrix.cycle = 1;
                targetUser.matrix.level1.filled = 0;
                await targetUser.save();
            }

            await processReferralSignup(targetUser.referredBy, targetUser._id);
            await processMatrixPlacement(targetUser._id, targetUser.referredBy);
        }

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
