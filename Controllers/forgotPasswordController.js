import nodemailer from "nodemailer";
import bcrypt from "bcrypt";
import User from "../Models/userModels.js";
import Admin from "../Models/adminModels.js";

// Create reusable transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
};

// Generate 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP email
const sendOTPEmail = async (to, otp, name = "User") => {
    const transporter = createTransporter();

    const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject: "Password Reset OTP - Best For Everyone",
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="display: inline-block; background: #111827; color: white; width: 40px; height: 40px; border-radius: 12px; line-height: 40px; font-weight: bold; font-size: 18px;">B</div>
          <h2 style="color: #111827; margin-top: 10px;">Best For Everyone</h2>
        </div>
        <p style="color: #374151; font-size: 16px;">Hello <strong>${name}</strong>,</p>
        <p style="color: #374151; font-size: 14px;">You requested a password reset. Use the OTP below to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <div style="display: inline-block; background: #F3F4F6; border: 2px dashed #D1D5DB; border-radius: 12px; padding: 15px 30px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111827;">${otp}</span>
          </div>
        </div>
        <p style="color: #6B7280; font-size: 13px;">This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">
        <p style="color: #9CA3AF; font-size: 12px; text-align: center;">If you didn't request this, please ignore this email.</p>
      </div>
    `,
    };

    await transporter.sendMail(mailOptions);
};

// ===== USER FORGOT PASSWORD =====
export const userForgotPassword = async (req, res) => {
    try {
        const { username, email } = req.body;

        if (!username || !email) {
            return res.status(400).json({ message: "Username and email are required" });
        }

        const user = await User.findOne({ username, email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ message: "No account found with this username and email combination" });
        }

        const otp = generateOTP();
        user.resetPasswordOTP = otp;
        user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await user.save();

        await sendOTPEmail(email.toLowerCase(), otp, user.fullname);

        res.json({ message: "OTP sent to your email address" });
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ message: "Failed to send OTP. Please try again." });
    }
};

// ===== USER RESET PASSWORD =====
export const userResetPassword = async (req, res) => {
    try {
        const { username, otp, newPassword } = req.body;

        if (!username || !otp || !newPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const user = await User.findOne({
            username,
            resetPasswordOTP: otp,
            resetPasswordExpires: { $gt: new Date() },
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.resetPasswordOTP = null;
        user.resetPasswordExpires = null;
        await user.save();

        res.json({ message: "Password reset successfully. You can now login with your new password." });
    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// ===== ADMIN FORGOT PASSWORD =====
export const adminForgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const admin = await Admin.findOne({ email: email.toLowerCase() });
        if (!admin) {
            return res.status(404).json({ message: "No admin account found with this email" });
        }

        const otp = generateOTP();
        admin.resetPasswordOTP = otp;
        admin.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await admin.save();

        await sendOTPEmail(email.toLowerCase(), otp, admin.adminName);

        res.json({ message: "OTP sent to your email address" });
    } catch (error) {
        console.error("Admin forgot password error:", error);
        res.status(500).json({ message: "Failed to send OTP. Please try again." });
    }
};

// ===== ADMIN RESET PASSWORD =====
export const adminResetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const admin = await Admin.findOne({
            email: email.toLowerCase(),
            resetPasswordOTP: otp,
            resetPasswordExpires: { $gt: new Date() },
        }).select("+password");

        if (!admin) {
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        admin.password = hashedPassword;
        admin.resetPasswordOTP = null;
        admin.resetPasswordExpires = null;
        await admin.save();

        res.json({ message: "Password reset successfully. You can now login with your new password." });
    } catch (error) {
        console.error("Admin reset password error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
