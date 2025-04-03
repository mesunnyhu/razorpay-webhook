const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const Razorpay = require("razorpay");
require("dotenv").config();

const app = express();

// ✅ Initialize Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Webhook Route (Use express.raw() before JSON middleware)
app.post("/razorpay-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    console.log("🔹 Received Webhook Headers:", req.headers);

    // ✅ Read raw request body
    const rawBody = req.body;
    req.body = rawBody.toString(); // Convert buffer to string for signature verification

    console.log("🔹 Received Webhook Body:", req.body);

    // ✅ Verify Razorpay Signature
    const signature = req.headers["x-razorpay-signature"];
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody, "utf-8") // Use raw buffer for verification
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("❌ Invalid signature");
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    // ✅ Parse Payment Data AFTER verification
    const payload = JSON.parse(req.body);
    if (payload.event !== "payment.captured") {
      return res.json({ success: false, message: "Event not handled" });
    }

    const payment = payload.payload.payment.entity;
    const amount = payment.amount / 100; // Convert to INR
    const paymentId = payment.id;
    const email = payment.email;
    const ownerAmount = Math.round(amount * 0.7 * 100); // Convert to paise
    const partnerAmount = Math.round(amount * 0.3 * 100); // Convert to paise

    // ✅ Transfer Funds using `transfers.create()`
    try {
      const transferResponse = await razorpay.transfers.create({
        account: "acc_QDSdM9vlYhgxHF", // Fund account for Owner
        amount: ownerAmount,
        currency: "INR",
        notes: { reason: "Owner Share" },
      });

      const partnerTransfer = await razorpay.transfers.create({
        account: "acc_QEUufydnazxuLm", // Fund account for Partner
        amount: partnerAmount,
        currency: "INR",
        notes: { reason: "Partner Share" },
      });

      console.log("✅ Payment Split Successfully:", transferResponse, partnerTransfer);
    } catch (transferError) {
      if (transferError.response) {
        console.error("❌ Transfer API Error:", JSON.stringify(transferError.response.data, null, 2));
      } else {
        console.error("❌ Transfer Error:", transferError.message);
      }
    }

    // ✅ Send Data to Google Sheets
    await axios.post("https://script.google.com/macros/s/AKfycbyWm-PYO8gPlSOlZ5iag6hIRfSHgc-UsOUlRXRB1UR0F4ZFdOF6-ebx7_ewvpvyb2Z3/exec", {
      paymentId,
      amount,
      ownerAmount: ownerAmount / 100, // Convert back to INR
      partnerAmount: partnerAmount / 100, // Convert back to INR
      email,
      status: "Transferred",
    });

    console.log(`✅ Payment Split: ${ownerAmount / 100} INR (Owner) | ${partnerAmount / 100} INR (Partner)`);
    res.json({ success: true, message: "Payment successfully split" });

  } catch (error) {
    console.error("❌ Error processing webhook:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: "Webhook processing failed" });
  }
});

// ✅ Regular JSON Parsing Middleware (AFTER webhook route)
app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
