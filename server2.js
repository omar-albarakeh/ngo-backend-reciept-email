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
  "http://localhost:3000",
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

// 👇 Only parse raw body for PayPal webhook
app.use("/paypal-webhook", express.raw({ type: "application/json" }));

// 👇 Use JSON body parser for all other routes
app.use(express.json());

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

// 📩 Webhook endpoint for PayPal
app.post("/paypal-webhook", async (req, res) => {
  try {
    const headers = req.headers;
    const transmissionId = headers["paypal-transmission-id"];
    const transmissionTime = headers["paypal-transmission-time"];
    const certUrl = headers["paypal-cert-url"];
    const authAlgo = headers["paypal-auth-algo"];
    const transmissionSig = headers["paypal-transmission-sig"];
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    const webhookEventBody = req.body; // now raw body is available here

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
          webhook_event: JSON.parse(webhookEventBody.toString("utf8")),
        }),
      }
    );

    const verification = await verifyResponse.json();

    if (verification.verification_status === "SUCCESS") {
      const event = JSON.parse(webhookEventBody.toString("utf8"));
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

// 💰 Metal Prices Endpoint
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

// 🔐 PayPal Config Endpoint
app.get("/config/paypal", (req, res) => {
  res.json({ clientId: process.env.PAYPAL_CLIENT_ID });
});

// ✅ Nodemailer
export async function sendEmail({ to, subject, html }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `"SOSP Palestine" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}

// 📧 Subscription route
app.post("/subscribe", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required." });

  try {
    console.log("Sending emails...");
    await Promise.all([
      sendEmail({
        to: email,
        subject: "You’re now subscribed!",
        html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #eaeaea; border-radius: 10px; background-color: #f9f9f9;">
          <h2 style="color: #2e7d32;"> Welcome to SOS Palestine!</h2>
          <p style="font-size: 16px; color: #333;">
            Thank you for subscribing to our updates. You’re now part of a global community standing in solidarity for justice and humanity.
          </p>
          <p style="font-size: 15px; color: #555;">
            We’ll keep you informed about our latest campaigns, projects, and how your support is making a difference on the ground.
          </p>
          <hr style="margin: 20px 0;" />
          <p style="font-size: 14px; color: #888;">
            If you have any questions, feel free to reply to this email or visit our website at 
            <a href="https://sospalestine.fr" style="color: #2e7d32;">sospalestine.fr</a>.
          </p>
          <p style="font-size: 14px; color: #888;">
            – The SOS Palestine Team
          </p>
        </div>
      `,
      }),
      sendEmail({
        to: "omaralbarakeh2@gmail.com",
        subject: "New subscriber",
        html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #fffbe6;">
          <h3 style="color: #d84315;"> New Newsletter Subscription</h3>
          <p style="font-size: 16px; color: #333;">
            A new user has just subscribed to the mailing list.
          </p>
          <table style="margin-top: 10px; font-size: 15px; color: #555;">
            <tr>
              <td><strong>Email:</strong></td>
              <td>${email}</td>
            </tr>
            <tr>
              <td><strong>Subscribed At:</strong></td>
              <td>${new Date().toLocaleString("fr-FR", {
                timeZone: "Europe/Paris",
              })}</td>
            </tr>
          </table>
          <hr style="margin: 20px 0;" />
          <p style="font-size: 13px; color: #888;">
            This is an automated notification from <strong>sospalestine.fr</strong>
          </p>
        </div>
      `,
      }),
    ]);
    console.log("Emails sent!");
    res.json({ success: true, message: "Subscription successful." });
  } catch (err) {
    console.error("Subscription error:", err.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

// 📨 Test email
app.get("/test-email", async (req, res) => {
  try {
    await sendEmail({
      to: "omaralbarakeh2@gmail.com",
      subject: "Test Email from IONOS SMTP",
      html: "<p>This is a test email from your Node server.</p>",
    });
    res.send("Test email sent!");
  } catch (err) {
    console.error("❌ Email error:", err);
    res.status(500).send("Failed to send test email.");
  }
});

// 💬 Contact form
app.post("/contact", async (req, res) => {
  const { email, message } = req.body;

  // Basic validation: check for missing fields
  if (!email || !message) {
    return res.status(400).json({ error: "Email and message are required." });
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  // HTML escaping to prevent injection
  const escapedEmail = escape(email);
  const escapedMessage = escape(message).replace(/\n/g, "<br/>");

  try {
    await sendEmail({
      to: "omaralbarakeh2@gmail.com",
      subject: `📨 New Contact Form Submission from ${escapedEmail}`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background-color: #f4f4f4; color: #333;">
          <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <div style="background-color: #4CAF50; color: white; padding: 16px 20px; font-size: 18px;">
               New Message Received
            </div>
            <div style="padding: 20px;">
              <p style="margin: 0 0 10px;"><strong>Sender Email:</strong> 
                <a href="mailto:${escapedEmail}" style="color: #4CAF50; text-decoration: none;">${escapedEmail}</a>
              </p>
    
              <p style="margin: 20px 0 5px;"><strong>Message:</strong></p>
              <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #4CAF50; white-space: pre-line;">
                ${escapedMessage}
              </div>
    
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
    
              <p style="font-size: 13px; color: #888; text-align: center;">
                This message was sent via your website contact form.
              </p>
            </div>
          </div>
        </div>
      `,
      replyTo: escapedEmail,
    });

    res.json({ success: true, message: "Message sent successfully." });
  } catch (err) {
    console.error("Email send error:", err.message);
    res.status(500).json({ error: "Failed to send message." });
  }
});

// 🏠 Root route
app.get("/", (req, res) => {
  res.send("Home route works");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `✅ Secure PayPal webhook server with metal prices running on port ${PORT}`
  );
});
