import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs/promises";
import path from "path";
import nodemailer from "nodemailer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import dotenv from "dotenv";
dotenv.config();

import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

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

    const donorHtml = hasFullReceiptData
      ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; background-color: #f9f9f9; border-radius: 8px;">
        <h2 style="color: #2e7d32;">Votre reçu fiscal est prêt</h2>
        <p>Salam alaykoum <strong>${name} ${surname}</strong>,</p>
        <p>Merci pour votre don de <strong>${amount} €</strong>.</p>
        <p>Le reçu est en pièce jointe.</p>
        <p>— L'équipe de l'Association SOS Humanistes</p>
      </div>
    `
      : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; background-color: #f0f4c3; border-radius: 8px;">
        <h2 style="color: #2e7d32;">Merci pour votre don !</h2>
        <p>Salam alaykoum <strong>${name} ${surname}</strong>,</p>
        <p>Nous vous remercions pour votre don de <strong>${amount} €</strong>.</p>
        <p><strong>بارك الله فيك</strong></p>
        <p>— L'équipe de l'Association SOS Humanistes</p>
      </div>
    `;

    const subject = hasFullReceiptData
      ? "🎁 Votre reçu fiscal SOS Palestine"
      : "💖 Merci pour votre don à SOS Palestine";

    await sendEmailWithAttachment({
      to: email,
      subject,
      html: donorHtml,
      pdfBuffer,
      filename,
    });

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

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
