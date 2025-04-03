const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const Razorpay = require("razorpay");
require("dotenv").config();

const app = express();

// ✅ Webhook route FIRST, using express.raw() to get raw request body
app.post("/razorpay-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    console.log("🔹 Received Webhook Headers:", req.headers);

    // ✅ Read raw request body
    const rawBody = req.body; 

    console.log("🔹 Received Webhook Body:", rawBody.toString());

    // ✅ Verify Razorpay Signature
    const signature = req.headers["x-razorpay-signature"];
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET) // ✅ Correct secret
      .update(rawBody) // ✅ Use raw body
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("❌ Invalid signature");
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    // ✅ Parse Payment Data AFTER verification
    const payload = JSON.parse(rawBody.toString());
    if (payload.event !== "payment.captured") {
      return res.json({ success: false, message: "Event not handled" });
    }

    const payment = payload.payload.payment.entity;
    const amount = payment.amount / 100;
    const paymentId = payment.id;
    const email = payment.email;
    const ownerAmount = amount * 0.7;
    const partnerAmount = amount * 0.3;

    // ✅ Transfer Funds
    const transferResponse = await razorpay.payments.createTransfer(paymentId, {
      transfers: [
        {
          account: "acc_QDSdM9vlYhgxHF",
          amount: ownerAmount * 100,
          currency: "INR",
          on_hold: false,
        },
        {
          account: "acc_QEUufydnazxuLm",
          amount: partnerAmount * 100,
          currency: "INR",
          on_hold: false,
        },
      ],
    });

    console.log("✅ Payment Split Successfully:", transferResponse);

    // ✅ Send Data to Google Sheets
    await axios.post("https://script.google.com/macros/s/AKfycbyWm-PYO8gPlSOlZ5iag6hIRfSHgc-UsOUlRXRB1UR0F4ZFdOF6-ebx7_ewvpvyb2Z3/exec", {
      paymentId,
      amount,
      ownerAmount,
      partnerAmount,
      email,
      status: "Transferred",
    });

    console.log(`✅ Payment Split: ${ownerAmount} (Owner) | ${partnerAmount} (Partner)`);
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
