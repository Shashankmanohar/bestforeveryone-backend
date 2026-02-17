import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['Matrix Income', 'Referral Bonus', 'Withdrawal', 'Leadership', 'Bonanza', 'Weekly Bonanza', 'Referral Royalty', 'Admin Adjustment', 'User Activation', 'Account Activation'],
        required: true
    },
    description: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    }
}, {
    timestamps: true
});

export default mongoose.model('Transaction', transactionSchema);
