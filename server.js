const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const Razorpay = require("razorpay");
require("dotenv").config();

const app = express();
app.use(express.json()); // Middleware to parse JSON

// Razorpay credentials
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Constants
const GOOGLE_SHEETS_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbyWm-PYO8gPlSOlZ5iag6hIRfSHgc-UsOUlRXRB1UR0F4ZFdOF6-ebx7_ewvpvyb2Z3/exec";
const OWNER_ACCOUNT_ID = "acc_QDSdM9vlYhgxHF"; // ✅ Replace with real Razorpay Account ID
const PARTNER_ACCOUNT_ID = "acc_QEUufydnazxuLm"; // ✅ Replace with real Partner's Razorpay Account ID
const OWNER_SHARE = 0.7;
const PARTNER_SHARE = 0.3;

// Webhook route
app.post(
  "/razorpay-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      // ✅ Step 1: Verify Razorpay Signature
      const signature = req.headers["x-razorpay-signature"];
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(req.body.toString())
        .digest("hex");

      if (signature !== expectedSignature) {
        console.error("❌ Invalid signature");
        return res
          .status(400)
          .json({ success: false, message: "Invalid signature" });
      }

      // ✅ Step 2: Parse Payment Data
      const payload = JSON.parse(req.body.toString());
      if (payload.event !== "payment.captured") {
        return res.json({ success: false, message: "Event not handled" });
      }

      const payment = payload.payload.payment.entity;
      const amount = payment.amount / 100; // Convert to INR
      const paymentId = payment.id;
      const email = payment.email;
      const ownerAmount = amount * OWNER_SHARE;
      const partnerAmount = amount * PARTNER_SHARE;

      // ✅ Step 3: Create an Order & Transfer Funds (Required for Razorpay Route)
      const order = await razorpay.orders.create({
        amount: amount * 100, // Convert to paise
        currency: "INR",
        receipt: `order_rcpt_${paymentId}`,
        payment_capture: 1,
        transfers: [
          {
            account: OWNER_ACCOUNT_ID,
            amount: ownerAmount * 100,
            currency: "INR",
            on_hold: false,
          },
          {
            account: PARTNER_ACCOUNT_ID,
            amount: partnerAmount * 100,
            currency: "INR",
            on_hold: false,
          },
        ],
      });

      console.log("✅ Order & Transfers Created:", order);

      // ✅ Step 4: Send Data to Google Sheets
      await axios.post(GOOGLE_SHEETS_WEBHOOK_URL, {
        paymentId,
        amount,
        ownerAmount,
        partnerAmount,
        email,
        status: "Transferred",
      });

      console.log(
        `✅ Payment Split: ${ownerAmount} (Owner) | ${partnerAmount} (Partner)`
      );
      res.json({ success: true, message: "Payment successfully split" });
    } catch (error) {
      console.error(
        "❌ Error processing webhook:",
        error.response?.data || error.message
      );
      res
        .status(500)
        .json({ success: false, message: "Webhook processing failed" });
    }
  }
);

// ✅ Step 5: Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
