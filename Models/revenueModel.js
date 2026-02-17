import mongoose from "mongoose";

const revenueSchema = new mongoose.Schema({
    totalRevenue: {
        type: Number,
        default: 0
    },
    totalJoiningFees: {
        type: Number,
        default: 0
    },
    totalAdminFees: {
        type: Number,
        default: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

export default mongoose.model("Revenue", revenueSchema);
