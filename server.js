import express from "express";
import fs from "fs/promises";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

const counterPath = path.join(__dirname, "data", "receiptCounter.json");

// 🔐 Email sending function
async function sendEmailWithAttachment({
  to,
  subject,
  html,
  pdfBuffer,
  filename,
}) {
  const attachments =
    pdfBuffer && filename ? [{ filename, content: pdfBuffer }] : [];

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
    from: `"SOS Palestine" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    attachments,
  });
}

async function getNextReceiptNumber() {
  let counter = { lastReceiptNumber: 1000 };
  try {
    const exists = await fs
      .access(counterPath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      const data = await fs.readFile(counterPath, "utf-8");
      counter = JSON.parse(data);
    }
    counter.lastReceiptNumber += 1;
    await fs.writeFile(counterPath, JSON.stringify(counter, null, 2));
  } catch (err) {
    console.error("Failed to read/write receipt counter:", err);
  }
  return counter.lastReceiptNumber;
}

app.post("/generate-pdf", async (req, res) => {
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

    const receiptNumber = await getNextReceiptNumber();
    const templatePath = path.join(__dirname, "templates", "recu_fiscal.pdf");
    const pdfBytes = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const [page1, page2] = pdfDoc.getPages();

    const drawField = (page, text, x, y) => {
      page.drawText(text || "", {
        x,
        y,
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    };

    // Fill in PDF fields
    drawField(page1, receiptNumber.toString(), 480, 761);
    drawField(page2, name, 350, 740);
    drawField(page2, surname, 60, 740);
    drawField(page2, address, 60, 695);
    drawField(page2, postalCode, 130, 680);
    drawField(page2, city, 280, 680);
    drawField(page2, `${amount} €`, 100, 580);
    drawField(page2, amountText, 180, 550);

    const currentDate = new Date().toLocaleDateString("fr-FR");
    drawField(page2, currentDate, 200, 520);
    drawField(page2, currentDate, 370, 97);

    // Embed signature
    if (pdfDoc.getPageCount() > 1) {
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
    }

    const finalPdfBytes = await pdfDoc.save();
    const filename =
      `Donation_Receipt_${name}_${surname}_#${receiptNumber}`.replace(
        /\s+/g,
        "_"
      ) + ".pdf";

    // Email content
    const donorHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; background-color: #f9f9f9; border-radius: 8px;">
        <h2 style="color: #2e7d32;">Votre reçu fiscal est prêt</h2>
        <p>Salam alaykoum <strong>${name} ${surname}</strong>,</p>
        <p>Au nom de toute l'équipe de l'<strong>Association SOS Humanistes</strong>, nous vous exprimons notre profonde gratitude pour votre généreux don.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td><strong>Montant du don :</strong></td><td>${amount} €</td></tr>
          <tr><td><strong>ID de transaction :</strong></td><td>${receiptNumber}</td></tr>
        </table>
        <p>Grâce à votre don, nous pourrons fournir une aide médicale, de la nourriture, de l'eau potable et d'autres fournitures essentielles aux personnes touchées par le conflit en Palestine.</p>
        <p><strong>بارك الله فيك</strong></p>
        <p>— L'équipe de l'Association SOS Humanistes</p>
        <hr style="margin: 30px 0;">
        <p style="font-size: 14px; color: #666;">
          📞 Tel: +33 7 83 25 53 25<br>
          ☎️ Fixe: 09 51 08 24 54<br>
          ✉️ Email: contact@sospalestine.fr<br>
          🌐 Site: <a href="https://sospalestine.fr" target="_blank">sospalestine.fr</a>
        </p>
        <p><strong>📎 Votre reçu fiscal au format PDF est joint à ce message.</strong></p>
      </div>
    `;

    const adminHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 25px; background-color: #fff8e1; border-radius: 8px;">
        <h2 style="color: #d32f2f;">Nouveau reçu généré</h2>
        <p>Un nouveau reçu fiscal a été généré avec les informations suivantes :</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 15px;">
          <tr><td><strong>Nom du donateur :</strong></td><td>${name} ${surname}</td></tr>
          <tr><td><strong>Adresse :</strong></td><td>${address}, ${postalCode} ${city}</td></tr>
          <tr><td><strong>Email :</strong></td><td>${email}</td></tr>
          <tr><td><strong>Montant :</strong></td><td>${amount} € (${amountText})</td></tr>
          <tr><td><strong>ID reçu :</strong></td><td>#${receiptNumber}</td></tr>
        </table>
        <p><strong>Le reçu PDF est joint à ce message.</strong></p>
        <p style="font-size: 13px; color: #999; margin-top: 30px;">Généré automatiquement par le système SOS Palestine.</p>
      </div>
    `;

    // Send emails
    if (email) {
      await sendEmailWithAttachment({
        to: email,
        subject: "🎁 Votre reçu fiscal SOS Palestine",
        html: donorHtml,
        pdfBuffer: finalPdfBytes,
        filename,
      });

      await sendEmailWithAttachment({
        to: "omarbarakeh20002@gmail.com",
        subject: `📩 Nouveau reçu généré (#${receiptNumber})`,
        html: adminHtml,
        pdfBuffer: finalPdfBytes,
        filename,
      });
    }

    const pdfBase64 = Buffer.from(finalPdfBytes).toString("base64");
    res.json({ pdf: pdfBase64, filename, sent: !!email });
  } catch (err) {
    console.error("PDF generation or email error:", err);
    res.status(500).send("Erreur lors de la génération ou l'envoi du PDF");
  }
});

app.get("/debug-form-fields", async (req, res) => {
  try {
    const pdfBytes = await fs.readFile(
      path.join(__dirname, "templates", "recu_fiscal.pdf")
    );
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields().map((field) => ({
      name: field.getName(),
      type: field.constructor.name,
    }));
    res.json(fields);
  } catch (err) {
    console.error("Error listing form fields:", err);
    res.status(500).send("Failed to list form fields");
  }
});
app.post("/send-thank-you", async (req, res) => {
  try {
    const { name, surname, amount, email } = req.body;

    if (!email || !name || !surname || !amount) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const thankYouHtml = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; background-color: #f0f4c3; border-radius: 8px;">
    <h2 style="color: #2e7d32;">Merci pour votre don !</h2>
    <p>Salam alaykoum <strong>${name} ${surname}</strong>,</p>
    <p>
      Nous vous remercions chaleureusement pour votre généreux don de <strong>${amount} €</strong> à l’Association SOS Humanistes.
    </p>
    <p>
      Votre soutien est inestimable. Grâce à vous, nous pouvons continuer à aider les personnes les plus démunies en Palestine.
    </p>
    <p><strong>بارك الله فيك</strong></p>
    <p>— L'équipe de l'Association SOS Humanistes</p>
    <hr style="margin: 30px 0;">
    <p style="font-size: 14px; color: #666;">
      📞 Tel: +33 7 83 25 53 25<br>
      ☎️ Fixe: 09 51 08 24 54<br>
      ✉️ Email: contact@sospalestine.fr<br>
      🌐 Site: <a href="https://sospalestine.fr" target="_blank">sospalestine.fr</a>
    </p>
  </div>
`;

    await sendEmailWithAttachment({
      to: email,
      subject: "💖 Merci pour votre don à SOS Palestine",
      html: thankYouHtml,
      pdfBuffer: null,
      filename: null,
    });

    res.json({ success: true, message: "Thank-you email sent successfully." });
  } catch (err) {
    console.error("Error sending thank-you email:", err);
    res.status(500).send("Failed to send thank-you email");
  }
});
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

    // 📄 Generate receipt PDF if full data is present
    if (hasFullReceiptData) {
      receiptNumber = await getNextReceiptNumber();
      const pdfBytes = await fs.readFile(
        path.join(__dirname, "templates", "recu_fiscal.pdf")
      );
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();
      const page1 = pages[0];
      const page2 = pages[1];

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

      // 🖊 Signature
      if (pages.length > 1) {
        const sigBytes = await fs.readFile(
          path.join(__dirname, "assets", "signature.png")
        );
        const sigImage = await pdfDoc.embedPng(sigBytes);
        const dims = sigImage.scale(0.35);
        page2.drawImage(sigImage, {
          x: 380,
          y: 20,
          width: dims.width,
          height: dims.height,
        });
      }

      pdfBuffer = await pdfDoc.save();
      filename =
        `Donation_Receipt_${name}_${surname}_#${receiptNumber}.pdf`.replace(
          /\s+/g,
          "_"
        );
    }

    // 📧 Donor email content
    const donorHtml = hasFullReceiptData
      ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; background-color: #f9f9f9; border-radius: 8px;">
        <h2 style="color: #2e7d32;">Votre reçu fiscal est prêt</h2>
        <p>Salam alaykoum <strong>${name} ${surname}</strong>,</p>
        <p>Merci pour votre don de <strong>${amount} €</strong>. Votre reçu est en pièce jointe.</p>
        <p><strong>بارك الله فيك</strong></p>
        <hr />
        <p style="font-size: 14px; color: #666;">📞 +33 7 83 25 53 25 | ✉️ contact@sospalestine.fr</p>
      </div>`
      : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; background-color: #f0f4c3; border-radius: 8px;">
        <h2 style="color: #2e7d32;">Merci pour votre don !</h2>
        <p>Salam alaykoum <strong>${name} ${surname}</strong>,</p>
        <p>Votre don de <strong>${amount} €</strong> est très apprécié.</p>
        <p><strong>بارك الله فيك</strong></p>
        <hr />
        <p style="font-size: 14px; color: #666;">📞 +33 7 83 25 53 25 | ✉️ contact@sospalestine.fr</p>
      </div>`;

    // 📤 Send donor email
    await sendEmailWithAttachment({
      to: email,
      subject: hasFullReceiptData
        ? "🎁 Votre reçu fiscal SOS Palestine"
        : "💖 Merci pour votre don à SOS Palestine",
      html: donorHtml,
      pdfBuffer,
      filename,
    });

    // 📤 Notify admin if full receipt was generated
    if (hasFullReceiptData) {
      const adminHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 25px; background-color: #fff8e1; border-radius: 8px;">
          <h2 style="color: #d32f2f;">Nouveau reçu généré</h2>
          <p>Nom : ${name} ${surname}<br>
          Email : ${email}<br>
          Montant : ${amount} €<br>
          ID Reçu : #${receiptNumber}</p>
        </div>`;

      await sendEmailWithAttachment({
        to: "omarbarakeh20002@gmail.com",
        subject: `📩 Nouveau reçu généré (#${receiptNumber})`,
        html: adminHtml,
        pdfBuffer,
        filename,
      });
    }

    return res.json({
      success: true,
      message: hasFullReceiptData
        ? "Reçu PDF généré et email envoyé."
        : "Email de remerciement envoyé.",
      filename,
    });
  } catch (err) {
    console.error("Error in hybrid email handler:", err);
    res.status(500).json({
      error: "Erreur lors de l'envoi de l'email ou de la génération du reçu",
    });
  }
});

const PORT = 5001;
app.listen(PORT, () => {
  console.log(
    `✅ Receipt generator server running on http://localhost:${PORT}`
  );
});
