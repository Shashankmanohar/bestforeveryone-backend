import express from "express"
import dotenv from "dotenv"
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import connectDB from "./Config/connectDB.js";
import userRoute from './Routes/userRoutes.js'
import adminRoutes from './Routes/adminRoutes.js'
import withdrawalRoutes from './Routes/withdrawalRoutes.js'
dotenv.config();

const app = express()

// CORS Configuration
const allowedOrigins = [
    'https://bestforeveryone.in',
    'http://localhost:5173',
    'http://localhost:3000'
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
}));

// Security Middleware
app.use(helmet());
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