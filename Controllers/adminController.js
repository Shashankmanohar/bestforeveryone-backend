import adminModel from "../Models/adminModels.js";
import User from "../Models/userModels.js";
import Transaction from "../Models/transactionModel.js";
import Withdrawal from "../Models/withdrawalModel.js";
import Referral from "../Models/referralModel.js";
import Revenue from "../Models/revenueModel.js";
import Matrix from "../Models/matrixModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";


export const adminRegister = async (req, res) => {
  try {
    const { adminName, email, password, registrationKey } = req.body;

    if (!adminName || !email || !password || !registrationKey) {
      return res.status(400).json({ message: "All fields are required!" });
    }

    // Security check: Verify registration key
    if (registrationKey !== process.env.ADMIN_REGISTRATION_KEY) {
      return res.status(403).json({ message: "Unauthorized: Invalid registration key" });
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
      .populate('user', 'fullname email')
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
        { email: { $regex: search, $options: 'i' } }
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
      .populate('referredBy', 'fullname username email referralCode');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get user's referrals
    const referrals = await Referral.find({ referrer: id })
      .populate('referred', 'fullname email')
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
      .populate('user', 'fullname email')
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
      .select('fullname username email paymentStatus paymentProof createdAt')
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

    console.log('📝 [approvePayment] Starting for userId:', userId);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    console.log('📝 [approvePayment] Found user:', user.fullname, '| paymentStatus:', user.paymentStatus);

    if (user.paymentStatus !== 'submitted') {
      return res.status(400).json({ message: "Payment not submitted or already processed" });
    }

    // Approve payment — core step, must always succeed
    user.paymentStatus = 'approved';
    user.verified = true;
    if (!user.paymentProof) {
      user.paymentProof = {};
    }
    user.paymentProof.approvedAt = new Date();
    user.paymentProof.approvedBy = adminId;
    await user.save({ validateBeforeSave: false });
    console.log('✅ [approvePayment] User saved as approved');

    // Process referral bonuses and matrix placement (wrapped so a failure here won't block the approval)
    try {
      const { processReferralSignup } = await import('./referralController.js');
      const { processMatrixPlacement } = await import('./matrixController.js');

      // Re-fetch fresh user to avoid stale document issues
      const freshUser = await User.findById(userId);

      // RESET MATRIX IF REACTIVATING (Cycle > 1 means they finished at least one cycle)
      const isReentry = freshUser.matrix && freshUser.matrix.cycle > 1;
      
      if (isReentry) {
        console.log(`🔄 Resetting matrix for re-entering user: ${freshUser.fullname} (Cycle ${freshUser.matrix.cycle})`);
        freshUser.matrix.level1.filled = 0;
        freshUser.isReEntryPending = false;
        freshUser.matrix.lastActivatedAt = new Date(); // Move to back of FIFO queue
        await freshUser.save({ validateBeforeSave: false });
      } else {
        // Initial Activation: set first activation timestamp if not set
        if (!freshUser.matrix.lastActivatedAt) {
          freshUser.matrix.lastActivatedAt = new Date();
          await freshUser.save({ validateBeforeSave: false });
        }
      }

      if (freshUser.referredBy) {
        console.log('📝 [approvePayment] Processing referral signup for referrer:', user.referredBy);
        await processReferralSignup(user.referredBy, user._id);
      }

      console.log('📝 [approvePayment] Processing matrix placement for user:', user._id);
      await processMatrixPlacement(user._id, user.referredBy);

      console.log('✅ [approvePayment] Referral & matrix processing complete');
    } catch (bonusError) {
      // Log but don't fail the approval itself
      console.error('⚠️ [approvePayment] Bonus/matrix processing failed (approval still succeeded):', bonusError.message);
      console.error(bonusError.stack);
    }

    // Update Platform Revenue
    // Fee is 1180 for re-entry, 1000 for initial joining
    const activationFee = (user.matrix && user.matrix.cycle > 1) ? 1180 : 1000;
    
    console.log(`📝 [approvePayment] Updating platform revenue with fee: ${activationFee}...`);
    await Revenue.findOneAndUpdate(
      {},
      {
        $inc: {
          totalRevenue: activationFee,
          totalJoiningFees: activationFee
        },
        $set: { lastUpdated: new Date() }
      },
      { upsert: true, new: true }
    );

    console.log('✅ [approvePayment] All done!');
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
    console.error('❌ [approvePayment] Fatal error:', error.message);
    console.error(error.stack);
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
    if (!user.paymentProof) {
      user.paymentProof = {};
    }
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

// ===== KYC MANAGEMENT =====
export const getPendingKyc = async (req, res) => {
  try {
    // Show all users who have submitted KYC (since they are auto-approved now)
    const kycUsers = await User.find({ 'kyc.status': 'approved' })
      .select('fullname username email kyc createdAt')
      .sort({ 'kyc.submittedAt': -1 });

    res.json({ pendingKycUsers: kycUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const approveKyc = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.kyc.status !== 'pending') {
      return res.status(400).json({ message: "KYC not pending or already processed" });
    }

    user.kyc.status = 'approved';
    user.kyc.approvedAt = new Date();
    user.kyc.approvedBy = adminId;
    await user.save();

    res.json({
      message: "KYC approved successfully",
      user: {
        id: user._id,
        fullname: user.fullname,
        kycStatus: user.kyc.status
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const rejectKyc = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.kyc.status !== 'pending') {
      return res.status(400).json({ message: "KYC not pending or already processed" });
    }

    user.kyc.status = 'rejected';
    user.kyc.rejectionReason = reason || 'KYC verification failed';
    await user.save();

    res.json({
      message: "KYC rejected",
      user: {
        id: user._id,
        fullname: user.fullname,
        kycStatus: user.kyc.status
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getCompletedCycles = async (req, res) => {
    try {
        const users = await User.find({ "matrix.cycle": { $gt: 1 } })
            .select('fullname username email matrix')
            .sort({ updatedAt: -1 });

        const completions = [];

        for (const user of users) {
            const completedCount = user.matrix.cycle - 1;
            
            for (let c = 1; c <= completedCount; c++) {
                const lastMember = await Matrix.findOne({
                    parent: user._id,
                    cycle: c,
                    position: 6,
                    level: 1
                }).select('createdAt');

                completions.push({
                    _id: `${user._id}_${c}`,
                    userId: user._id,
                    fullname: user.fullname,
                    username: user.username,
                    email: user.email,
                    cycle: c,
                    completedAt: lastMember ? lastMember.createdAt : user.updatedAt
                });
            }
        }

        completions.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

        res.json({ completions });
    } catch (error) {
        console.error('Error fetching completed cycles:', error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

