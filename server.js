import express from "express"
import dotenv from "dotenv"
import cors from "cors";
import connectDB from "./Config/connectDB.js";
import userRoute from './Routes/userRoutes.js'
import adminRoutes from './Routes/adminRoutes.js'
import withdrawalRoutes from './Routes/withdrawalRoutes.js'
dotenv.config();

const app = express()

// Middleware
app.use(cors());
app.use(express.json());

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