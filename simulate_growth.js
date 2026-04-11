import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './Models/userModels.js';
import Matrix from './Models/matrixModel.js';
import { processMatrixPlacement } from './Controllers/matrixController.js';

dotenv.config();

async function simulateABCFlow() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('--- DB CONNECTED ---');

        // Delete ALL users and matrices for a clean state
        await User.deleteMany({});
        await Matrix.deleteMany({});
        
        console.log('--- 1. Create User A (First) ---');
        const userA = await User.create({
            fullname: 'User A',
            username: 'sim_A',
            email: 'sim_a@test.com',
            password: 'password',
            referralCode: 'REFA',
            verified: true,
            "matrix.lastActivatedAt": new Date(Date.now() - 100000) // Oldest
        });

        console.log('--- 2. Signup Users B-G (6 members) ---');
        const children = [];
        for (let name of ['B', 'C', 'D', 'E', 'F', 'G']) {
            const u = await User.create({
                fullname: `User ${name}`,
                username: `sim_${name}`,
                email: `sim_${name}@test.com`,
                password: 'password',
                referralCode: `REF${name}`,
                verified: true,
                "matrix.lastActivatedAt": new Date() // Newer than A
            });
            children.push(u);
            console.log(`Processing ${u.username}...`);
            await processMatrixPlacement(u._id, userA._id);
        }

        console.log('--- 3. Verify A Completed ---');
        const finalA = await User.findById(userA._id);
        console.log(`User A: Cycle=${finalA.matrix.cycle}, Filled=${finalA.matrix.level1.filled}, PendingReEntry=${finalA.isReEntryPending}, Wallet=${finalA.wallet.matrixWallet}`);

        console.log('--- 4. User A Re-pays ---');
        finalA.isReEntryPending = false;
        finalA.matrix.lastActivatedAt = new Date(); // Moves to back of queue
        await finalA.save();
        console.log('User A reactivated.');

        console.log('--- 5. Signup User H ---');
        const userH = await User.create({
            fullname: 'User H',
            username: 'sim_H',
            email: 'sim_h@test.com',
            password: 'password',
            referralCode: 'REFH',
            verified: true,
            "matrix.lastActivatedAt": new Date()
        });
        await processMatrixPlacement(userH._id, null);

        console.log('--- 6. Verify Parent of H is B ---');
        const placementH = await Matrix.findOne({ user: userH._id });
        const parentOfH = await User.findById(placementH.parent);
        console.log(`User H parent: ${parentOfH.username} (Expected: sim_B)`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

simulateABCFlow();
