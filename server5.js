import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  "https://ngo-frontend-reciept-email-31ym.vercel.app",
];
//tes test
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

// Email sender helper
async function sendEmailWithAttachment({
  to,
  subject,
  html,
  pdfBuffer,
  filename,
}) {
  const transporter = nodemailer.createTransport({
    service: "IONOS",
    host: "smtp.ionos.fr",
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: "contact@sospalestine.fr",
    to,
    subject,
    html,
    attachments: pdfBuffer
      ? [
          {
            filename,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ]
      : [],
  };

  await transporter.sendMail(mailOptions);
}

// Get next receipt number helper
async function getNextReceiptNumber() {
  const filePath = path.join(__dirname, "data", "receipt_counter.json");
  let counter = 1;

  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(fileContent);
    counter = data.lastReceiptNumber + 1;
  } catch {
    counter = 1;
  }

  await fs.writeFile(
    filePath,
    JSON.stringify({ lastReceiptNumber: counter }),
    "utf-8"
  );
  return counter;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Main route
app.post("/generate-receipt-or-thankyou", async (req, res) => {
  try {
    const {
      name,
      surname,
      address,
      postalCode,
      city,
      amount,
      amountText,
      email,
    } = req.body;

    if (!email || !name || !surname || !amount) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const hasFullReceiptData = [address, postalCode, city, amountText].every(
      (field) => typeof field === "string" && field.trim() !== ""
    );

    let pdfBuffer = null;
    let filename = null;
    let receiptNumber = null;

    if (hasFullReceiptData) {
      receiptNumber = await getNextReceiptNumber();

      const templatePath = path.join(__dirname, "templates", "recu_fiscal.pdf");
      const pdfBytes = await fs.readFile(templatePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const [page1, page2] = pdfDoc.getPages();

      const draw = (page, text, x, y) => {
        page.drawText(text || "", {
          x,
          y,
          size: 12,
          font,
          color: rgb(0, 0, 0),
        });
      };

      draw(page1, receiptNumber.toString(), 480, 761);
      draw(page2, name, 350, 740);
      draw(page2, surname, 60, 740);
      draw(page2, address, 60, 695);
      draw(page2, postalCode, 130, 680);
      draw(page2, city, 280, 680);
      draw(page2, `${amount} €`, 100, 580);
      draw(page2, amountText, 180, 550);

      const today = new Date().toLocaleDateString("fr-FR");
      draw(page2, today, 200, 520);
      draw(page2, today, 370, 97);

      const sigPath = path.join(__dirname, "assets", "signature.png");
      const sigBytes = await fs.readFile(sigPath);
      const sigImage = await pdfDoc.embedPng(sigBytes);
      const sigDims = sigImage.scale(0.35);
      page2.drawImage(sigImage, {
        x: 380,
        y: 20,
        width: sigDims.width,
        height: sigDims.height,
      });

      pdfBuffer = await pdfDoc.save();
      filename =
        `Donation_Receipt_${name}_${surname}_#${receiptNumber}`.replace(
          /\s+/g,
          "_"
        ) + ".pdf";
    }

    const donorHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: auto; padding: 30px; background-color: #fffbe7; border-radius: 8px; line-height: 1.6; color: #333;">
      <p>Salam alaykoum <strong>${name} ${surname}</strong>,</p>
      
      <p>Au nom de toute l'équipe de l'Association <strong>SOS Humanistes</strong>, je tiens à vous exprimer notre profonde gratitude pour votre généreux don.</p>
  
      <p><strong>Montant du don :</strong> ${amount} €<br/>
      ${
        hasFullReceiptData && receiptNumber
          ? `<strong>ID de transaction :</strong> ${receiptNumber}<br/>`
          : ""
      }
      </p>
  
      <p>Grâce à votre don, nous pourrons fournir une aide médicale, de la nourriture, de l'eau potable et d'autres fournitures essentielles aux personnes touchées par le conflit en Palestine.</p>
  
      <p>Encore une fois, nous vous remercions de tout cœur pour votre soutien.</p>
  
      <p><strong>بارك الله فيك</strong></p>
  
      <p>— L'équipe de l'Association SOS Humanistes</p>
  
      <hr style="margin: 20px 0;" />
  
      <p style="font-size: 14px;">
        📞 Tel: +33/783255325<br/>
        ☎️ Fixe: 0951082454<br/>
        ✉️ Email: <a href="mailto:contact@sospalestine.fr">contact@sospalestine.fr</a><br/>
        🌐 Site: <a href="https://sospalestine.fr" target="_blank">https://sospalestine.fr</a>
      </p>
    </div>
  `;

    const subject = hasFullReceiptData
      ? "🎁 Votre reçu fiscal SOS Palestine"
      : "💖 Merci pour votre don à SOS Palestine";

    await sendEmailWithAttachment({
      to: email, // <- email from the frontend
      subject,
      html: donorHtml,
      pdfBuffer,
      filename,
    });
    // Send to the donor
    await sendEmailWithAttachment({
      to: email, // from frontend
      subject,
      html: donorHtml,
      pdfBuffer,
      filename,
    });

    // Send to the team (just PDF, no donorHtml)
    if (pdfBuffer) {
      await sendEmailWithAttachment({
        to: "contact@sospalestine.fr",
        subject: `🧾 Nouveau reçu fiscal émis - ${name} ${surname}`,
        html: `
      <p>Un nouveau reçu fiscal a été généré pour un donateur :</p>
      <ul>
        <li><strong>Nom :</strong> ${name} ${surname}</li>
        <li><strong>Montant :</strong> ${amount} €</li>
        <li><strong>ID de reçu :</strong> ${receiptNumber || "N/A"}</li>
      </ul>
      <p>Le reçu est joint en pièce jointe.</p>
    `,
        pdfBuffer,
        filename,
      });
    }

    res.json({
      success: true,
      sent: true,
      pdf: pdfBuffer ? Buffer.from(pdfBuffer).toString("base64") : null,
      filename,
      receipt: !!pdfBuffer,
    });
  } catch (err) {
    console.error("Error in /generate-receipt-or-thankyou:", err);
    res.status(500).json({ error: "Server error" });
  }
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
    const webhookEventBody = req.body;

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
        subject: "Vous êtes maintenant abonné(e) !",
        html: `
   <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #eaeaea; border-radius: 10px; background-color: #f9f9f9;">
  <h2 style="color: #2e7d32;"> Bienvenue chez SOS Palestine !</h2>
  <p style="font-size: 16px; color: #333;">
    Merci de vous être abonné à nos actualités. Vous faites désormais partie d'une communauté mondiale unie pour la justice et l'humanité.
  </p>
  <p style="font-size: 15px; color: #555;">
    Nous vous tiendrons informé(e) de nos dernières campagnes, projets et de l'impact concret de votre soutien sur le terrain.
  </p>
  <hr style="margin: 20px 0;" />
  <p style="font-size: 14px; color: #888;">
    Si vous avez des questions, n'hésitez pas à répondre à cet e-mail ou à visiter notre site web :
    <a href="https://sospalestine.fr" style="color: #2e7d32;">sospalestine.fr</a>.
  </p>
  <p style="font-size: 14px; color: #888;">
    – L'équipe SOS Palestine
  </p>
</div>

      `,
      }),
      sendEmail({
        to: "contact@sospalestine.fr",
        subject: "Nouveau/elle abonné(e)",
        html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #fffbe6;">
  <h3 style="color: #d84315;"> Nouvelle inscription à la newsletter</h3>
  <p style="font-size: 16px; color: #333;">
    Un nouvel utilisateur vient de s'abonner à la liste de diffusion.
  </p>
  <table style="margin-top: 10px; font-size: 15px; color: #555;">
    <tr>
      <td><strong>Email :</strong></td>
      <td>${email}</td>
    </tr>
    <tr>
      <td><strong>Date d'abonnement :</strong></td>
      <td>${new Date().toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
      })}</td>
    </tr>
  </table>
  <hr style="margin: 20px 0;" />
  <p style="font-size: 13px; color: #888;">
    Ceci est une notification automatique de <strong>sospalestine.fr</strong>
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
      to: "contact@sospalestine.fr",
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
  const escapedEmail = escapeHtml(email);
  const escapedMessage = escapeHtml(message).replace(/\n/g, "<br/>");

  try {
    await sendEmail({
      to: "contact@sospalestine.fr",
      subject: `📨 New Contact Form Submission from ${escapedEmail}`,
      html: `
       <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background-color: #f4f4f4; color: #333;">
  <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    <div style="background-color: #4CAF50; color: white; padding: 16px 20px; font-size: 18px;">
      Nouveau message reçu
    </div>
    <div style="padding: 20px;">
      <p style="margin: 0 0 10px;"><strong>Email de l’expéditeur :</strong> 
        <a href="mailto:${escapedEmail}" style="color: #4CAF50; text-decoration: none;">${escapedEmail}</a>
      </p>

      <p style="margin: 20px 0 5px;"><strong>Message :</strong></p>
      <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #4CAF50; white-space: pre-line;">
        ${escapedMessage}
      </div>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />

      <p style="font-size: 13px; color: #888; text-align: center;">
        Ce message a été envoyé via le formulaire de contact de votre site web.
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
