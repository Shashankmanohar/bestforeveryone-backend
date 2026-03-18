import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import adminModel from './Models/adminModels.js';

dotenv.config();

async function checkAndCreateAdmin() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const email = 'admin@bestforeveryone.in';
    const password = 'admin@123';

    const existing = await adminModel.findOne({ email }).select('+password');
    if (existing) {
        console.log('📋 Admin exists:', existing.email, '| Role:', existing.role);
        // Verify password matches
        const match = await bcrypt.compare(password, existing.password);
        console.log('🔑 Password match:', match ? 'YES ✅' : 'NO ❌ - resetting password');
        if (!match) {
            existing.password = await bcrypt.hash(password, 10);
            await existing.save();
            console.log('🔄 Password reset to admin@123');
        }
    } else {
        const hashPassword = await bcrypt.hash(password, 10);
        const admin = await adminModel.create({ adminName: 'SuperAdmin', email, password: hashPassword });
        console.log('🆕 Admin CREATED:', admin.email);
    }

    await mongoose.disconnect();
    process.exit(0);
}

checkAndCreateAdmin().catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
