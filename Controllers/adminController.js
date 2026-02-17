import adminModel from "../Models/adminModels.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../Models/userModels.js";
import Transaction from "../Models/transactionModel.js";
import Withdrawal from "../Models/withdrawalModel.js";
import Referral from "../Models/referralModel.js";
import Revenue from "../Models/revenueModel.js";


export const adminRegister = async (req, res) => {
  try {
    const { adminName, email, password } = req.body;

    if (!adminName || !email || !password) {
      return res.status(400).json({ message: "All fields are required!" });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Password strength
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const existingAdmin = await adminModel.findOne({
      email: email.toLowerCase(),
    });

    if (existingAdmin) {
      return res.status(409).json({ message: "Admin already exists!" });
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const newAdmin = await adminModel.create({
      adminName,
      email: email.toLowerCase(),
      password: hashPassword,
    });

    return res.status(201).json({
      message: "Admin created successfully",
      admin: {
        id: newAdmin._id,
        adminName: newAdmin.adminName,
        email: newAdmin.email,
        role: newAdmin.role,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};



export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required!" });
    }

    const admin = await adminModel
      .findOne({ email: email.toLowerCase() })
      .select("+password");

    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // JWT TOKEN
    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      admin: {
        id: admin._id,
        adminName: admin.adminName,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ===== DASHBOARD METRICS =====
export const getDashboardMetrics = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'active' });
    const blockedUsers = await User.countDocuments({ status: 'blocked' });

    const pendingWithdrawals = await Withdrawal.countDocuments({ status: 'pending' });
    const totalWithdrawalAmount = await Withdrawal.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Identify Master User (first user created)
    const masterUser = await User.findOne({}).sort({ createdAt: 1 });
    const masterUserId = masterUser ? masterUser._id : null;

    // Calculate total revenue (sum of all regular user earnings, excluding master user)
    const revenueData = await User.aggregate([
      { $match: { _id: { $ne: masterUserId } } },
      { $group: { _id: null, total: { $sum: '$wallet.totalEarnings' } } }
    ]);

    // Matrix cycles count
    const matrixCycles = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$matrix.cycle' } } }
    ]);

    // User wallet holdings vs reserve
    const walletHoldings = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$wallet.balance' } } }
    ]);

    const pendingPayments = await User.countDocuments({ paymentStatus: 'submitted' });

    // Fetch platform revenue
    let platformRevenue = await Revenue.findOne();
    if (!platformRevenue) {
      platformRevenue = { totalRevenue: 0 };
    }

    res.json({
      totalRevenue: platformRevenue.totalRevenue || 0,
      totalJoiningFees: platformRevenue.totalJoiningFees || 0,
      totalAdminFees: platformRevenue.totalAdminFees || 0,
      totalUserEarnings: revenueData[0]?.total || 0,
      activeUsers,
      totalUsers,
      blockedUsers,
      pendingWithdrawals,
      pendingWithdrawalAmount: totalWithdrawalAmount[0]?.total || 0,
      matrixCycles: matrixCycles[0]?.total || 0,
      userWalletHoldings: walletHoldings[0]?.total || 0,
      reserveFund: (walletHoldings[0]?.total || 0) * 1.5, // Mock 150% reserve
      pendingPayments
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ===== ACTIVITY FEED =====
export const getRecentActivity = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const activities = await Transaction.find()
      .populate('user', 'fullname phone')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({ activities });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ===== USER MANAGEMENT =====
export const getAllUsers = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { fullname: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await User.countDocuments(filter);

    res.json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select('-password')
      .populate('referredBy', 'fullname username phone referralCode');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get user's referrals
    const referrals = await Referral.find({ referrer: id })
      .populate('referred', 'fullname phone')
      .sort({ createdAt: -1 });

    // Get recent transactions
    const transactions = await Transaction.find({ user: id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      user,
      referrals,
      transactions
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const adjustUserWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, type, description } = req.body;

    if (!amount || !type || !['credit', 'debit'].includes(type)) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (type === 'credit') {
      user.wallet.balance += amount;
      user.wallet.totalEarnings += amount;
    } else {
      if (user.wallet.balance < amount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
      user.wallet.balance -= amount;
    }

    await user.save();

    // Create transaction record
    await Transaction.create({
      user: id,
      type: 'Admin Adjustment',
      description: description || `Admin ${type} adjustment`,
      amount,
      status: type
    });

    res.json({
      message: `Wallet ${type}ed successfully`,
      newBalance: user.wallet.balance
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'blocked', 'suspended'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: `User status updated to ${status}`,
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ===== FINANCIAL LEDGER =====
export const getFinancialLedger = async (req, res) => {
  try {
    const { type, category, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (type) filter.status = type; // 'credit' or 'debit'
    if (category) filter.type = category;

    const transactions = await Transaction.find(filter)
      .populate('user', 'fullname phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Transaction.countDocuments(filter);

    res.json({
      transactions,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ===== SYSTEM CONFIGURATION =====
const systemConfig = {
  joiningFee: 1000,
  lvl1Reward: 300,
  lvl2Reward: 300,
  adminFee: 20,
  minWithdraw: 200,
  maintenance: false
};

export const getSystemConfig = async (req, res) => {
  try {
    res.json({ config: systemConfig });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateSystemConfig = async (req, res) => {
  try {
    const { joiningFee, lvl1Reward, lvl2Reward, adminFee, minWithdraw, maintenance } = req.body;

    if (joiningFee !== undefined) systemConfig.joiningFee = joiningFee;
    if (lvl1Reward !== undefined) systemConfig.lvl1Reward = lvl1Reward;
    if (lvl2Reward !== undefined) systemConfig.lvl2Reward = lvl2Reward;
    if (adminFee !== undefined) systemConfig.adminFee = adminFee;
    if (minWithdraw !== undefined) systemConfig.minWithdraw = minWithdraw;
    if (maintenance !== undefined) systemConfig.maintenance = maintenance;

    res.json({
      message: "System configuration updated successfully",
      config: systemConfig
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ===== PAYMENT APPROVALS =====
export const getPendingPayments = async (req, res) => {
  try {
    const pendingUsers = await User.find({ paymentStatus: 'submitted' })
      .select('fullname username phone paymentStatus paymentProof createdAt')
      .sort({ 'paymentProof.submittedAt': -1 });

    res.json({ pendingUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const approvePayment = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.paymentStatus !== 'submitted') {
      return res.status(400).json({ message: "Payment not submitted or already processed" });
    }

    // Approve payment
    user.paymentStatus = 'approved';
    user.verified = true;
    user.paymentProof.approvedAt = new Date();
    user.paymentProof.approvedBy = adminId;
    await user.save();

    // Process referral bonuses and matrix placement if user has a referrer
    if (user.referredBy) {
      const { processReferralSignup } = await import('./referralController.js');
      const { processMatrixPlacement } = await import('./matrixController.js');

      // RESET CYCLE IF REACTIVATING
      if (user.matrix.cycle > 5) {
        console.log(`🔄 Resetting cycles for reactivated user: ${user.fullname}`);
        user.matrix.cycle = 1;
        user.matrix.level1.filled = 0;
        await user.save();
      }

      await processReferralSignup(user.referredBy, user._id);
      await processMatrixPlacement(user._id, user.referredBy);
    }

    // Update Platform Revenue
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
      message: "Payment approved successfully",
      user: {
        id: user._id,
        fullname: user.fullname,
        username: user.username,
        verified: user.verified,
        paymentStatus: user.paymentStatus
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const rejectPayment = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.paymentStatus !== 'submitted') {
      return res.status(400).json({ message: "Payment not submitted or already processed" });
    }

    // Reject payment
    user.paymentStatus = 'rejected';
    user.paymentProof.rejectionReason = reason || 'Payment verification failed';
    await user.save();

    res.json({
      message: "Payment rejected",
      user: {
        id: user._id,
        fullname: user.fullname,
        paymentStatus: user.paymentStatus
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

