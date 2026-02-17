import mongoose from 'mongoose';

const matrixSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    level: {
        type: Number,
        enum: [1, 2],
        required: true
    },
    position: {
        type: Number,
        required: true
    },
    cycle: {
        type: Number,
        default: 1
    },
    filled: {
        type: Boolean,
        default: false
    },
    incomeCredited: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

export default mongoose.model('Matrix', matrixSchema);
