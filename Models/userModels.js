import mongoose from "mongoose";

const userModel = new mongoose.Schema(
  {
    fullname: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      default: null,
    },
    phone: {
      type: String,
      default: null,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: "user",
    },
    // MLM Fields
    referralCode: {
      type: String,
      unique: true,
      required: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    referralMilestones: {
      milestone5: { type: Boolean, default: false },
      milestone25: { type: Boolean, default: false },
    },
    wallet: {
      balance: { type: Number, default: 0 },
      matrixWallet: { type: Number, default: 0 },
      totalEarnings: { type: Number, default: 0 },
      withdrawn: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      matrixIncome: { type: Number, default: 0 },
      referralIncome: { type: Number, default: 0 },
      royalty: { type: Number, default: 0 },
      bonanzaIncome: { type: Number, default: 0 },
    },
    matrix: {
      level1: {
        total: { type: Number, default: 6 },
        filled: { type: Number, default: 0 },
      },
      cycle: { type: Number, default: 1 },
      lastActivatedAt: { type: Date, default: null },
      isReEntryPending: { type: Boolean, default: false }, // Legacy location
    },
    weeklyStats: {
      withdrawalUsed: { type: Number, default: 0 },
      withdrawalLimit: { type: Number, default: 50000 },
      weeklyBonanza: { type: Number, default: 0 },
      leadershipIncome: { type: Number, default: 0 },
      lastWeekReset: { type: Date, default: Date.now },
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended", "blocked"],
      default: "active",
    },
    verified: {
      type: Boolean,
      default: false,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "submitted", "approved", "rejected"],
      default: "pending",
    },
    paymentProof: {
      submittedAt: { type: Date },
      approvedAt: { type: Date },
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
      rejectionReason: { type: String },
    },
    kyc: {
      aadharCard: { type: String }, // path
      panCard: { type: String },    // path
      bankDetails: {
        accountNumber: String,
        ifscCode: String,
        accountHolderName: String,
        bankName: String
      },
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'not_submitted'],
        default: 'not_submitted'
      },
      submittedAt: { type: Date },
      approvedAt: { type: Date },
      rejectionReason: { type: String }
    },
    isReEntryPending: { type: Boolean, default: false },
    resetPasswordOTP: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("User", userModel);
