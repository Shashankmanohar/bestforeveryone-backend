import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './Models/userModels.js';
import Referral from './Models/referralModel.js';
import { processReferralSignup } from './Controllers/referralController.js';

dotenv.config();

const verifyRewards = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI;
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        // Create a test referrer
        const referrer = await User.create({
            fullname: 'Test Referrer',
            phone: '1234567800',
            dateofbirth: '1990-01-01',
            password: 'password123',
            referralCode: 'TESTREF1'
        });

        console.log('\n--- Test 1: First Referral (Should be ₹200) ---');
        const ref1 = await User.create({ fullname: 'Ref 1', phone: '1111111110', dateofbirth: '2000-01-01', password: 'p', referralCode: 'R1' });
        await processReferralSignup(referrer._id, ref1._id);
        let updatedReferrer = await User.findById(referrer._id);
        console.log(`Referrer Wallet Balance: ₹${updatedReferrer.wallet.balance} (Expected 200)`);

        console.log('\n--- Test 2: Second Referral (Should be ₹200 + ₹400 bonus = ₹600 more, total ₹800) ---');
        const ref2 = await User.create({ fullname: 'Ref 2', phone: '2222222220', dateofbirth: '2000-01-01', password: 'p', referralCode: 'R2' });
        await processReferralSignup(referrer._id, ref2._id);
        updatedReferrer = await User.findById(referrer._id);
        console.log(`Referrer Wallet Balance: ₹${updatedReferrer.wallet.balance} (Expected 800)`);

        console.log('\n--- Test 3: Third Referral (Should be ₹200 only, total ₹1000) ---');
        const ref3 = await User.create({ fullname: 'Ref 3', phone: '3333333330', dateofbirth: '2000-01-01', password: 'p', referralCode: 'R3' });
        await processReferralSignup(referrer._id, ref3._id);
        updatedReferrer = await User.findById(referrer._id);
        console.log(`Referrer Wallet Balance: ₹${updatedReferrer.wallet.balance} (Expected 1000)`);

        // Cleanup
        await User.deleteMany({ _id: { $in: [referrer._id, ref1._id, ref2._id, ref3._id] } });
        await Referral.deleteMany({ referrer: referrer._id });
        console.log('\nCleanup done.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

verifyRewards();
