import mongoose from 'mongoose';

const leadershipSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    downlineUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        default: 10
    },
    trigger: {
        type: String,
        required: true
    },
    credited: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

export default mongoose.model('Leadership', leadershipSchema);
