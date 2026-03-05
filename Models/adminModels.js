import mongoose from "mongoose";

const adminModel = new mongoose.Schema({
    adminName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    role: {
        type: String,
        enum: ["admin", "superadmin"],
        default: "admin"
    }

})


export default mongoose.model("Admin", adminModel);
