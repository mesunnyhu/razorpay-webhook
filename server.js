const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

// Define constants
const GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwEzjv3lCeftipOrzUctsJuQupp_ExT5BnKnKnubIyyenNcZoXHRyTelcUsl5pFqmQgVf/exec"; 
const RAZORPAY_SECRET = "your_razorpay_webhook_secret";  // Replace with actual secret from Razorpay
const OWNER_SHARE = 0.7;
const PARTNER_SHARE = 0.3;

// Webhook route with raw body middleware
app.post("/razorpay-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    // Signature verification
    const signature = req.headers["x-razorpay-signature"];
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_SECRET)
      .update(req.body.toString()) // Convert raw buffer to string
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("Invalid signature");
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    // Convert raw buffer body to JSON
    const payload = JSON.parse(req.body.toString());
    if (payload.event !== "payment.captured") return res.json({ success: false, message: "Event not handled" });

    // Extract payment details
    const payment = payload.payload.payment.entity;
    const amount = payment.amount / 100; // Convert to actual amount
    const paymentId = payment.id;
    const email = payment.email;
    const ownerAmount = amount * OWNER_SHARE;
    const partnerAmount = amount * PARTNER_SHARE;

    // Send data to Google Sheets
    const response = await axios.post(GOOGLE_SHEETS_WEBHOOK_URL, {
      paymentId,
      amount,
      ownerAmount,
      partnerAmount,
      email,
      status: "Captured",
    });

    console.log("Google Sheets response:", response.data);
    console.log(`✅ Payment split recorded: ${ownerAmount} (Owner) | ${partnerAmount} (Partner)`);
    res.json({ success: true });

  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    res.status(500).json({ success: false, message: "Webhook processing failed" });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
