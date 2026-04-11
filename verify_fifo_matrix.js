import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './Models/userModels.js';
import Matrix from './Models/matrixModel.js';
import { processMatrixPlacement } from './Controllers/matrixController.js';

dotenv.config();

async function verifyFifoMatrix() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI not found in .env');
        }
        
        console.log('Connecting to MongoDB (URI masked)...');
        // Masked URI: mongodb+srv://***:***@cluster0...
        const maskedUri = process.env.MONGODB_URI.replace(/\/\/.*@/, '//***:***@');
        console.log(`URI: ${maskedUri}`);

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected successfully!');

        // 1. Cleanup old test data (optional but recommended for clean run)
        // await User.deleteMany({ username: { $regex: /^test_fifo_/ } });
        // await Matrix.deleteMany({});

        console.log('\n--- 1. Creating User A (The first Parent) ---');
        let userA = await User.findOneAndUpdate(
            { username: 'test_fifo_A' },
            { 
                fullname: 'User A', 
                verified: true,
                referralCode: 'REF_FIFO_A',
                password: 'password123',
                "matrix.lastActivatedAt": new Date(Date.now() - 10000) // 10s ago
            },
            { upsert: true, new: true }
        );
        console.log(`Created ${userA.fullname} (${userA._id}) - lastActivatedAt: ${userA.matrix.lastActivatedAt}`);

        console.log('\n--- 2. Creating User B (The second Parent) ---');
         let userB = await User.findOneAndUpdate(
            { username: 'test_fifo_B' },
            { 
                fullname: 'User B', 
                verified: true,
                referralCode: 'REF_FIFO_B',
                password: 'password123',
                "matrix.lastActivatedAt": new Date(Date.now() - 5000) // 5s ago
            },
            { upsert: true, new: true }
        );
        console.log(`Created ${userB.fullname} (${userB._id}) - lastActivatedAt: ${userB.matrix.lastActivatedAt}`);

        console.log('\n--- 3. Simulating 6 Global Signups ---');
        for (let i = 1; i <= 6; i++) {
            const signup = await User.findOneAndUpdate(
                { username: `test_fifo_signup_${i}` },
                { 
                    fullname: `Signup ${i}`, 
                    verified: true,
                    referralCode: `REF_FIFO_SIGNUP_${i}`,
                    password: 'password123'
                },
                { upsert: true, new: true }
            );
            console.log(`Signup ${i} (${signup._id}) joined. Processing placement...`);
            await processMatrixPlacement(signup._id, userA._id);
        }

        console.log('\n--- 4. Checking User A Status (Should be Finished) ---');
        userA = await User.findOne({ username: 'test_fifo_A' });
        console.log(`User A Verified: ${userA.verified} (Expected: false)`);
        console.log(`User A Matrix Cycle: ${userA.matrix.cycle} (Expected: 2)`);
        console.log(`User A Matrix Wallet: ${userA.wallet.matrixWallet} (Expected: 2400)`);

        console.log('\n--- 5. Simulating Next Signup (Should go to User B) ---');
        const signup7 = await User.findOneAndUpdate(
            { username: 'test_fifo_signup_7' },
            { 
                fullname: 'Signup 7', 
                verified: true,
                referralCode: 'REF_FIFO_SIGNUP_7',
                password: 'password123'
            },
            { upsert: true, new: true }
        );
        await processMatrixPlacement(signup7._id, userB._id);

        userB = await User.findOne({ username: 'test_fifo_B' });
        console.log(`User B Level 1 Filled: ${userB.matrix.level1.filled} (Expected: 1)`);

        console.log('\n--- 6. Reactivating User A (Re-entry) ---');
        // User K joined at -5s (Step 2)
        // User A reactivates NOW
        userA.verified = true;
        userA.matrix.lastActivatedAt = new Date(); // Newest in queue (T=0)
        userA.matrix.level1.filled = 0;
        userA.isReEntryPending = false;
        await userA.save();
        console.log(`User A Reactivated at: ${userA.matrix.lastActivatedAt}`);
        console.log(`User B (User K) was activated at: ${userB.matrix.lastActivatedAt}`);

        console.log('\n--- 7. Verifying User B (User K) is still the next Parent ---');
        // User B was created in Step 2 with an older timestamp than User A's re-entry
        const signup8 = await User.findOneAndUpdate(
            { username: 'test_fifo_signup_8' },
            { 
                fullname: 'Signup 8', 
                verified: true,
                referralCode: 'REF_FIFO_SIGNUP_8',
                password: 'password123'
            },
            { upsert: true, new: true }
        );
        console.log(`Signup 8 joining. Finding parent...`);
        await processMatrixPlacement(signup8._id, userB._id);

        userB = await User.findOne({ username: 'test_fifo_B' });
        console.log(`User B Level 1 Filled: ${userB.matrix.level1.filled} (Expected: 1)`);
        
        // Simulating the user's exact wording: "after UserK userA will complete"
        console.log('\n--- 8. Simulating completion of User B before User A starts ---');
        for (let i = 9; i <= 13; i++) {
            const s = await User.findOneAndUpdate(
                { username: `test_fifo_signup_${i}` },
                { fullname: `Signup ${i}`, verified: true, referralCode: `REF_S${i}`, password: 'password123' },
                { upsert: true, new: true }
            );
            await processMatrixPlacement(s._id, userB._id);
        }

        userB = await User.findOne({ username: 'test_fifo_B' });
        console.log(`User B Status: Completed Cycle 1? ${userB.matrix.cycle === 2} (Current Cycle: ${userB.matrix.cycle})`);

        console.log('\n--- 9. Verifying User A is now the next Parent ---');
        const signup14 = await User.findOneAndUpdate(
            { username: 'test_fifo_signup_14' },
            { 
                fullname: 'Signup 14', 
                verified: true,
                referralCode: 'REF_FIFO_SIGNUP_14',
                password: 'password123'
            },
            { upsert: true, new: true }
        );
        await processMatrixPlacement(signup14._id, userA._id);

        userA = await User.findOne({ username: 'test_fifo_A' });
        console.log(`User A Level 1 Filled: ${userA.matrix.level1.filled} (Expected: 1)`);

        console.log('\n--- VERIFICATION COMPLETE ---');
        process.exit(0);
    } catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    }
}

verifyFifoMatrix();
