import express from "express"
import dotenv from "dotenv"
import cors from "cors";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import { rateLimit } from "express-rate-limit";
import connectDB from "./Config/connectDB.js";
import userRoute from './Routes/userRoutes.js'
import adminRoutes from './Routes/adminRoutes.js'
import withdrawalRoutes from './Routes/withdrawalRoutes.js'
dotenv.config();

const app = express()

// Security Middleware
app.use(helmet()); // Set security-related HTTP headers
app.use(mongoSanitize()); // Prevent NoSQL injection

// CORS Configuration
const allowedOrigins = [
    'https://bestforeveryone.in',
    'http://localhost:5173',
    'http://localhost:3000'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// Rate Limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again after 15 minutes",
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/user/login', authLimiter);
app.use('/user/signup', authLimiter);
app.use('/admin/login', authLimiter);

app.use(express.json({ limit: '10kb' })); // Body limit to prevent DoS
app.use('/uploads', express.static('uploads'));

connectDB()

app.get('/', (req, res) => {
    res.send("Hello from backend!")
})


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