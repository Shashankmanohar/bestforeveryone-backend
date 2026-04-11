import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './Models/userModels.js';

dotenv.config();

async function checkQueue() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const users = await User.find({
            verified: true,
            isReEntryPending: { $ne: true },
            "matrix.level1.filled": { $lt: 6 }
        })
        .select('fullname username matrix.lastActivatedAt matrix.level1.filled createdAt')
        .sort({ "matrix.lastActivatedAt": 1, createdAt: 1 })
        .limit(10);

        console.log('Current Parent Queue (Top 10):');
        users.forEach((u, i) => {
            console.log(`${i+1}. ${u.username} [${u.fullname}]`);
            console.log(`   lastActivatedAt: ${u.matrix.lastActivatedAt}`);
            console.log(`   createdAt: ${u.createdAt}`);
            console.log(`   Filled: ${u.matrix.level1.filled}/6`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkQueue();
