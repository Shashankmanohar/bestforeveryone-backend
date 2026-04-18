import mongoose from "mongoose";

const epinSchema = new mongoose.Schema(
    {
        pin: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        amount: {
            type: Number,
            default: 1380,
        },
        status: {
            type: String,
            enum: ["active", "used"],
            default: "active",
        },
        usedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        usedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Epin", epinSchema);
