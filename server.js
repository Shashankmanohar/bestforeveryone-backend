import express from "express"
import dotenv from "dotenv"
// cors handled manually below
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import connectDB from "./Config/connectDB.js";
import userRoute from './Routes/userRoutes.js'
import adminRoutes from './Routes/adminRoutes.js'
import withdrawalRoutes from './Routes/withdrawalRoutes.js'
dotenv.config();

const app = express()

// CORS: Manual preflight handler — MUST be the very first middleware
// This catches OPTIONS requests before helmet or anything else can interfere
const allowedOrigins = [
    'https://bestforeveryone.in',
    'https://www.bestforeveryone.in',
    'http://localhost:5173',
    'http://localhost:3000'
];

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Respond to preflight immediately — do NOT let any other middleware touch it
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Security Middleware — disable crossOriginResourcePolicy so it doesn't override CORS headers
app.use(helmet({ crossOriginResourcePolicy: false, crossOriginOpenerPolicy: false }));
app.use(express.json({ limit: '10kb' })); // Body limit to prevent DoS

// Rate Limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again after 15 minutes",
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/uploads', express.static('uploads'));

connectDB()

app.get('/', (req, res) => {
    res.send("Hello from backend!")
})



app.use('/user/login', authLimiter);
app.use('/user/signup', authLimiter);
app.use('/admin/login', authLimiter);

app.use('/user', userRoute);
app.use('/admin', adminRoutes);
app.use('/withdrawal', withdrawalRoutes);

export default app;

const PORT = process.env.PORT || 5001;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}