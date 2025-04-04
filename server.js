const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const Razorpay = require("razorpay");
require("dotenv").config();

const app = express();

// ✅ Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Webhook Route
app.post("/razorpay-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    console.log("🔹 Received Webhook Headers:", req.headers);

    const rawBody = req.body;
    const signature = req.headers["x-razorpay-signature"];

    // ✅ Verify Signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("❌ Invalid Signature");
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    // ✅ Parse JSON after verification
    const payload = JSON.parse(rawBody);
    console.log("🔹 Verified Webhook Payload:", payload);

    if (payload.event !== "payment.captured") {
      return res.json({ success: false, message: "Event not handled" });
    }

    const payment = payload.payload.payment.entity;
    const amount = payment.amount; // in paise
    const paymentId = payment.id;
    const email = payment.email || "void@razorpay.com";
    const ownerAmount = Math.round(amount * 0.7);
    const partnerAmount = Math.round(amount * 0.3);

    // ✅ Split Payment
    try {
      const transferResponse = await razorpay.payments.transfer(paymentId, {
        transfers: [
          {
            account: "acc_QEUufydnazxuLm", // Owner Account
            amount: ownerAmount,
            currency: "INR",
            notes: { description: "Owner payment split" },
          },
          {
            account: "acc_QDSdM9vlYhgxHF", // Partner Account
            amount: partnerAmount,
            currency: "INR",
            notes: { description: "Partner payment split" },
          },
        ],
      });

      console.log("✅ Payment Split Successfully:", transferResponse);

      // ✅ Log to Google Sheets
      await axios.post("https://script.google.com/macros/s/AKfycbyzAETGyXRLyULmX0QWMihjYmW0bKmsYdAcWzrCvO2ad0abW4DOCeGyWK0Uw2wUqyEp/exec", {
        paymentId,
        amount: amount / 100,
        ownerAmount: ownerAmount / 100,
        partnerAmount: partnerAmount / 100,
        email,
        status: "Transferred",
      });

      console.log(`✅ Payment Split: ${ownerAmount / 100} INR (Owner) | ${partnerAmount / 100} INR (Partner)`);
      res.json({ success: true, message: "Payment successfully split" });

    } catch (transferError) {
      console.error("❌ Transfer API Error:", transferError.response?.data || transferError.message);

      // ✅ Still log to Google Sheets for tracking
      await axios.post("https://script.google.com/macros/s/AKfycbyWm-PYO8gPlSOlZ5iag6hIRfSHgc-UsOUlRXRB1UR0F4ZFdOF6-ebx7_ewvpvyb2Z3/exec", {
        paymentId,
        amount: amount / 100,
        ownerAmount: ownerAmount / 100,
        partnerAmount: partnerAmount / 100,
        email,
        status: "Transfer Failed",
      });

      res.status(500).json({ success: false, message: "Transfer failed" });
    }

  } catch (error) {
    console.error("❌ Error processing webhook:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: "Webhook processing failed" });
  }
});

// ✅ Regular JSON Parsing Middleware
app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
