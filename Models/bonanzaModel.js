import mongoose from 'mongoose';

const bonanzaSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    referral: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    weekStart: {
        type: Date,
        required: true
    },
    weekEnd: {
        type: Date,
        required: true
    },
    credited: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

export default mongoose.model('Bonanza', bonanzaSchema);
