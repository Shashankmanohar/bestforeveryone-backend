import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = "mongodb+srv://shashankmanohar1734_db_user:WLvLWhZUo9S2XLeN@bestforever.2fj14bg.mongodb.net/";

async function checkWithdrawals() {
    try {
        await mongoose.connect(MONGODB_URI);
        const count = await mongoose.connection.db.collection('withdrawals').countDocuments();
        const pendingCount = await mongoose.connection.db.collection('withdrawals').countDocuments({ status: 'pending' });
        console.log(`Total withdrawals: ${count}`);
        console.log(`Pending withdrawals: ${pendingCount}`);

        if (pendingCount > 0) {
            const latest = await mongoose.connection.db.collection('withdrawals').find({ status: 'pending' }).sort({ createdAt: -1 }).limit(1).toArray();
            console.log("Latest pending withdrawal:", JSON.stringify(latest[0], null, 2));
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error("Error checking withdrawals:", error);
    }
}

checkWithdrawals();
