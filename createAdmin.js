import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import adminModel from './Models/adminModels.js';

dotenv.config();

async function createAdmin() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const email = 'admin@bestforeveryone.in';
    const password = 'admin@123';
    const adminName = 'SuperAdmin';

    const existing = await adminModel.findOne({ email });
    if (existing) {
        console.log('Admin already exists:', existing.email);
        process.exit(0);
    }

    const hashPassword = await bcrypt.hash(password, 10);
    const admin = await adminModel.create({ adminName, email, password: hashPassword });
    console.log('✅ Admin created successfully:', admin.email);
    process.exit(0);
}

createAdmin().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
