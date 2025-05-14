// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import fetch from "node-fetch";
import paypal from "@paypal/paypal-server-sdk";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later.",
});
app.use(limiter);

const allowedOrigins = [
  "https://www.soshumanistes.fr",
  "http://www.soshumanistes.fr",
  "https://soshumanistes.fr",
  "http://soshumanistes.fr",

  "https://www.soshumanistes.com",
  "http://www.soshumanistes.com",
  "https://soshumanistes.com",
  "http://soshumanistes.com",

  "https://www.soshumanistes.org",
  "http://www.soshumanistes.org",
  "https://soshumanistes.org",
  "http://soshumanistes.org",

  "https://www.soshumanistes.ch",
  "http://www.soshumanistes.ch",
  "https://soshumanistes.ch",
  "http://soshumanistes.ch",

  "https://www.sospalestine.fr",
  "http://www.sospalestine.fr",
  "https://sospalestine.fr",
  "http://sospalestine.fr",

  "https://ngo-v3-omars-projects-52eaefc2.vercel.app",
  "http://localhost:5173",
  "https://ngo-backend-p0rc.onrender.com",
  "https://test.sospalestine.fr",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);
app.use(express.json({ type: "application/json" }));
app.use((req, res, next) => {
  let data = "";
  req.on("data", (chunk) => {
    data += chunk;
  });
  req.on("end", () => {
    req.rawBody = data;
    next();
  });
});

// Metal prices logic
let goldPricePerGram = null;
let silverPricePerGram = null;

const fetchPrices = async () => {
  const API_URL =
    "https://gold.g.apised.com/v1/latest?metals=XAU,XAG&base_currency=EUR&currencies=EUR&weight_unit=gram";
  const API_KEY = process.env.GOLD_API_KEY;

  try {
    const response = await fetch(API_URL, {
      headers: {
        "x-api-key": API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const { XAU, XAG } = data?.data?.metal_prices || {};

    if (!XAU?.price || !XAG?.price) {
      throw new Error("Missing metal prices in API response");
    }

    goldPricePerGram = XAU.price;
    silverPricePerGram = XAG.price;

    console.log("Updated metal prices:", {
      goldPricePerGram,
      silverPricePerGram,
    });
  } catch (err) {
    console.error("Error fetching metal prices:", err.message);
  }
};

fetchPrices();
cron.schedule("0 */12 * * *", fetchPrices);

app.post("/paypal-webhook", async (req, res) => {
  try {
    const headers = req.headers;
    const transmissionId = headers["paypal-transmission-id"];
    const transmissionTime = headers["paypal-transmission-time"];
    const certUrl = headers["paypal-cert-url"];
    const authAlgo = headers["paypal-auth-algo"];
    const transmissionSig = headers["paypal-transmission-sig"];
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    const webhookEventBody = req.rawBody;

    // Verify signature
    const verifyResponse = await fetch(
      "https://api-m.paypal.com/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
          ).toString("base64")}`,
        },
        body: JSON.stringify({
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: JSON.parse(webhookEventBody),
        }),
      }
    );

    const verification = await verifyResponse.json();

    if (verification.verification_status === "SUCCESS") {
      const event = JSON.parse(webhookEventBody);
      if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        console.log("✅ Payment completed:", {
          transactionId: event.resource.id,
          amount: event.resource.amount.value,
          currency: event.resource.amount.currency_code,
          payerEmail: event.resource.payer.email_address,
        });
      }
      res.status(200).send("Webhook verified.");
    } else {
      console.warn("❌ Webhook verification failed.");
      res.status(400).send("Invalid signature.");
    }
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).send("Server error.");
  }
});

// Metal Prices Endpoint
app.get("/api/metal-prices", async (req, res) => {
  if (goldPricePerGram === null || silverPricePerGram === null) {
    await fetchPrices();
  }

  if (goldPricePerGram !== null && silverPricePerGram !== null) {
    res.json({ goldPricePerGram, silverPricePerGram });
  } else {
    res.status(503).json({ error: "Prices not available yet" });
  }
});

// PayPal Config Endpoint
app.get("/config/paypal", (req, res) => {
  res.json({ clientId: process.env.PAYPAL_CLIENT_ID });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_PORT === "465", // Use true for SSL (465) and false for TLS (587)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Modify your sendEmail function to use SMTP
const sendEmail = async ({ to, subject, html }) => {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to,
    subject,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Message sent:", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

// Example route using the updated sendEmail
app.post("/subscribe", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    await sendEmail({
      to: email,
      subject: "You're subscribed!",
      html: `<p>Thank you for subscribing to our newsletter.</p>`,
    });

    res.json({ success: true, message: "Subscription confirmed." });
  } catch (err) {
    res.status(500).json({ error: "Failed to send confirmation." });
  }
});

app.post("/contact", async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    await sendEmail({
      to: "admin@yourdomain.com", // your admin inbox
      subject: `New contact message from ${name}`,
      html: `<p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong><br/>${message}</p>`,
    });

    res.json({ success: true, message: "Message sent successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to send message." });
  }
});

app.get("/", (req, res) => {
  res.send("Home route works");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `✅ Secure PayPal webhook server with metal prices running on port ${PORT}`
  );
});
