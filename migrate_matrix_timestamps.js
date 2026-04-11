import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './Models/userModels.js';

dotenv.config();

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        // Find verified users whose lastActivatedAt is the same as createdAt (likely default value)
        // or just re-sync all verified users to their approval time if it exists
        const users = await User.find({ verified: true });

        console.log(`Checking ${users.length} verified users for timestamp accuracy.`);

        let updatedCount = 0;
        for (const user of users) {
            const approvalTime = user.paymentProof?.approvedAt || user.createdAt;
            
            // If lastActivatedAt is missing or looks like it was just the signup time
            // we update it to the approval time to be more accurate for FIFO.
            if (!user.matrix.lastActivatedAt || user.matrix.lastActivatedAt.getTime() === user.createdAt.getTime()) {
                user.matrix.lastActivatedAt = approvalTime;
                await user.save({ validateBeforeSave: false });
                updatedCount++;
            }
        }

        console.log(`Migration complete! Updated ${updatedCount} users.`);
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
