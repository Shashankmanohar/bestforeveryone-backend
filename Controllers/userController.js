import User from "../Models/userModels.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { processReferralSignup, createPendingReferral } from "./referralController.js";
import { processMatrixPlacement } from "./matrixController.js";

const signupUser = async (req, res) => {
  try {
    console.log('Signup request received:', req.body);
    const { fullname, username, phone, password, referralCode } = req.body;

    if (!fullname || !username || !phone || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const userCount = await User.countDocuments({ phone });
    if (userCount >= 6) {
      return res.status(400).json({ message: "Maximum 6 IDs allowed per mobile number" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Find referrer
    let referrer = null;
    if (referralCode && referralCode.trim() !== '') {
      // Extract code from URL if user pasted a full URL
      let code = referralCode.trim();

      // Check if it's a URL and extract the code part
      if (code.includes('/')) {
        const parts = code.split('/');
        code = parts[parts.length - 1];
      }

      // Remove any query parameters
      if (code.includes('?')) {
        code = code.split('?')[0];
      }

      console.log('Looking for referral code:', code);
      referrer = await User.findOne({ referralCode: code });

      if (!referrer) {
        return res.status(400).json({ message: `Invalid referral code: ${code}` });
      }
    } else {
      // No referral code provided - find the first user (master user)
      console.log('No referral code provided, finding master user (first user)...');
      referrer = await User.findOne({}).sort({ createdAt: 1 });

      if (referrer) {
        console.log('Automatically assigned master user as referrer:', referrer.fullname, `(${referrer.referralCode})`);
      } else {
        console.log('No users in database yet. This will be the first user.');
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate unique referral code
    const generateReferralCode = () => {
      const prefix = fullname.substring(0, 3).toUpperCase();
      const random = Math.floor(100000 + Math.random() * 900000);
      return `${prefix}${random}`;
    };

    let newReferralCode = generateReferralCode();
    let codeExists = await User.findOne({ referralCode: newReferralCode });
    while (codeExists) {
      newReferralCode = generateReferralCode();
      codeExists = await User.findOne({ referralCode: newReferralCode });
    }

    const user = await User.create({
      fullname,
      username,
      phone,
      password: hashedPassword,
      referralCode: newReferralCode,
      referredBy: referrer ? referrer._id : null,
      verified: false, // Require payment verification
      paymentStatus: 'pending'
    });

    // Create pending referral record if referrer exists
    if (referrer) {
      console.log(`Creating pending referral for referrer: ${referrer._id}, new user: ${user._id}`);
      await createPendingReferral(referrer._id, user._id);
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET not defined");
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user._id,
        fullname: user.fullname,
        username: user.username,
        phone: user.phone,
        referralCode: user.referralCode,
        wallet: user.wallet,
        matrix: user.matrix,
        verified: user.verified,
        paymentStatus: user.paymentStatus
      },
      token,
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};

const signinUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: "User does not exist" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    const updatedWeeklyStats = {
      ...user.weeklyStats.toObject(),
      withdrawalLimit: Math.max(user.weeklyStats.withdrawalLimit || 0, 50000)
    };

    res.json({
      message: "Login successful",
      user: {
        id: user._id,
        fullname: user.fullname,
        username: user.username,
        phone: user.phone,
        referralCode: user.referralCode,
        wallet: user.wallet,
        matrix: user.matrix,
        weeklyStats: updatedWeeklyStats,
        status: user.status,
        verified: user.verified,
        paymentStatus: user.paymentStatus
      },
      token,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const updatedWeeklyStats = {
      ...user.weeklyStats.toObject(),
      withdrawalLimit: Math.max(user.weeklyStats.withdrawalLimit || 0, 50000)
    };

    res.json({
      user: {
        id: user._id,
        fullname: user.fullname,
        username: user.username,
        phone: user.phone,
        referralCode: user.referralCode,
        wallet: user.wallet,
        matrix: user.matrix,
        weeklyStats: updatedWeeklyStats,
        status: user.status,
        verified: user.verified,
        paymentStatus: user.paymentStatus,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Submit payment proof
const submitPaymentProof = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if already submitted or approved
    if (user.paymentStatus === 'submitted') {
      return res.status(400).json({ message: "Payment already submitted. Waiting for admin approval." });
    }

    if (user.paymentStatus === 'approved') {
      return res.status(400).json({ message: "Payment already approved" });
    }

    // Update payment status
    user.paymentStatus = 'submitted';
    user.paymentProof.submittedAt = new Date();
    await user.save();

    res.json({
      message: "Payment submitted successfully. Waiting for admin approval.",
      paymentStatus: user.paymentStatus
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Activate another user using wallet balance
const activateOtherUser = async (req, res) => {
  try {
    const activatorId = req.user.id;
    const { targetUsername } = req.body;

    if (!targetUsername) {
      return res.status(400).json({ message: "Target username is required" });
    }

    // 1. Find activator and check balance
    const activator = await User.findById(activatorId);
    if (!activator) {
      return res.status(404).json({ message: "Activator not found" });
    }

    if (activator.wallet.balance < 1180) {
      return res.status(400).json({ message: "Insufficient balance. You need at least ₹1180 to activate another account." });
    }

    // 2. Find target user
    const targetUser = await User.findOne({ username: targetUsername });
    if (!targetUser) {
      return res.status(404).json({ message: "Target user not found" });
    }

    if (targetUser.verified) {
      return res.status(400).json({ message: "Target user is already verified" });
    }

    // 3. Process Activation
    // Deduct from activator
    activator.wallet.balance -= 1180;
    await activator.save();

    // Create debit transaction for activator
    const Transaction = (await import('../Models/transactionModel.js')).default;
    await Transaction.create({
      user: activator._id,
      type: 'User Activation',
      description: `Activated account: ${targetUser.username}`,
      amount: 1180,
      status: 'debit'
    });

    // Activate target user
    targetUser.verified = true;
    targetUser.paymentStatus = 'approved';
    targetUser.paymentProof = {
      ...targetUser.paymentProof,
      approvedAt: new Date(),
      approvedBy: activator._id
    };
    await targetUser.save();

    // Create credit transaction for target user (showing payment done)
    await Transaction.create({
      user: targetUser._id,
      type: 'Account Activation',
      description: `Activated by: ${activator.username}`,
      amount: 1180,
      status: 'credit'
    });

    // 4. Trigger referral/matrix logic for target user
    if (targetUser.referredBy) {
      const { processReferralSignup } = await import('./referralController.js');
      const { processMatrixPlacement } = await import('./matrixController.js');

      // RESET CYCLE IF REACTIVATING
      if (targetUser.matrix && targetUser.matrix.cycle > 5) {
        targetUser.matrix.cycle = 1;
        targetUser.matrix.level1.filled = 0;
        await targetUser.save();
      }

      await processReferralSignup(targetUser.referredBy, targetUser._id);
      await processMatrixPlacement(targetUser._id, targetUser.referredBy);
    }

    // 5. Update Platform Revenue (still counts as revenue)
    const Revenue = (await import('../Models/revenueModel.js')).default;
    await Revenue.findOneAndUpdate(
      {},
      {
        $inc: {
          totalRevenue: 1180,
          totalJoiningFees: 1180
        },
        $set: { lastUpdated: new Date() }
      },
      { upsert: true, new: true }
    );

    res.json({
      message: `User ${targetUser.username} activated successfully!`,
      newBalance: activator.wallet.balance
    });

  } catch (error) {
    console.error('Activation error:', error);
    res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};

export { signupUser, signinUser, getUserProfile, submitPaymentProof, activateOtherUser };