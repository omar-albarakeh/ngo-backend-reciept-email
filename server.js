// const express = require("express");
// const fs = require("fs");
// const cors = require("cors");
// const { PDFDocument } = require("pdf-lib");
// const path = require("path");
// const counterPath = path.join(__dirname, "data", "receiptCounter.json");

// const app = express();
// app.use(express.json({ limit: "10mb" }));
// app.use(cors());

// function safeSetTextField(form, fieldName, value) {
//   try {
//     const field = form.getTextField(fieldName);
//     if (field) {
//       field.setText(value || "");
//     } else {
//       console.warn(`Text field not found: ${fieldName}`);
//     }
//   } catch (err) {
//     console.error(`Error setting field '${fieldName}':`, err.message);
//   }
// }

// function safeCheckBox(form, fieldName) {
//   try {
//     const field = form.getCheckBox(fieldName);
//     if (field) {
//       field.check();
//     } else {
//       console.warn(`Checkbox not found: ${fieldName}`);
//     }
//   } catch (err) {
//     console.error(`Error checking box '${fieldName}':`, err.message);
//   }
// }

// function getNextReceiptNumber() {
//   const counterPath = path.join(__dirname, "receiptCounter.json");
//   let counter = { lastReceiptNumber: 1000 };

//   try {
//     if (fs.existsSync(counterPath)) {
//       counter = JSON.parse(fs.readFileSync(counterPath, "utf-8"));
//     }
//     counter.lastReceiptNumber += 1;
//     fs.writeFileSync(counterPath, JSON.stringify(counter, null, 2));
//   } catch (err) {
//     console.error("Failed to read/write receipt counter:", err);
//   }

//   return counter.lastReceiptNumber;
// }

// app.post("/generate-pdf", async (req, res) => {
//   try {
//     const {
//       name,
//       surname,
//       address,
//       postalCode,
//       city,
//       amount,
//       amountText,
//       donationDate,
//     } = req.body;

//     const receiptNumber = getNextReceiptNumber();

//     const formPdfBytes = fs.readFileSync("./templates/recu_fiscal.pdf");
//     const pdfDoc = await PDFDocument.load(formPdfBytes);
//     const form = pdfDoc.getForm();

//     // Fill in user fields
//     safeSetTextField(form, "Nom", name);
//     safeSetTextField(form, "Prénoms", surname);
//     safeSetTextField(form, "Adresse_2", address);
//     safeSetTextField(form, "Code Postal_2", postalCode);
//     safeSetTextField(form, "Commune_2", city);
//     safeSetTextField(form, "Euros", amount);
//     safeSetTextField(form, "Somme en toutes lettres", amountText);
//     safeSetTextField(form, "date1", donationDate);

//     // Add current date to additional fields
//     const currentDate = new Date().toLocaleDateString("fr-FR");
//     safeSetTextField(form, "date4", currentDate);
//     safeSetTextField(form, "date5", currentDate);

//     // Set receipt number
//     safeSetTextField(form, "Numéro dordre du reçu", receiptNumber.toString());

//     // Check checkboxes
//     form.getCheckBox("Virement prélèvement carte bancaire").check();
//     safeCheckBox(form, "200 du CGI");
//     safeCheckBox(form, "Numéraire");
//     safeCheckBox(form, "Oeuvre ou organisme dintérêt général");
//     safeCheckBox(
//       form,
//       "Etablissement denseignement supérieur ou denseignement artistique public ou privé dintérêt général à"
//     );

//     // Add signature image above date5 field
//     const pages = pdfDoc.getPages();
//     const firstPage = pages[1];

//     const signatureImageBytes = fs.readFileSync("./assets/signature.png");
//     const signatureImage = await pdfDoc.embedPng(signatureImageBytes);
//     const sigDims = signatureImage.scale(0.35); // adjust as needed

//     // Manually adjust X, Y to match position above date5
//     const sigX = 380; // example X
//     const sigY = 20; // example Y

//     firstPage.drawImage(signatureImage, {
//       x: sigX,
//       y: sigY,
//       width: sigDims.width,
//       height: sigDims.height,
//     });

//     const pdfBytes = await pdfDoc.save({ updateFieldAppearances: false });

//     const pdfBase64 = Buffer.from(pdfBytes).toString("base64");
//     const filename =
//       `Donation_Receipt_${name}_${surname}_${donationDate}_#${receiptNumber}.pdf`.replace(
//         /\s+/g,
//         "_"
//       );

//     res.json({ pdf: pdfBase64, filename });
//   } catch (err) {
//     console.error("PDF generation error:", err);
//     res.status(500).send("Error generating PDF");
//   }
// });

// app.get("/debug-form-fields", async (req, res) => {
//   try {
//     const formPdfBytes = fs.readFileSync("./templates/recu_fiscal.pdf");
//     const pdfDoc = await PDFDocument.load(formPdfBytes);
//     const form = pdfDoc.getForm();

//     const fields = form.getFields();
//     const fieldNames = fields.map((field) => ({
//       name: field.getName(),
//       type: field.constructor.name,
//     }));

//     res.json(fieldNames);
//   } catch (err) {
//     console.error("Error listing form fields:", err);
//     res.status(500).send("Failed to list form fields");
//   }
// });

// const PORT = 5000;
// app.listen(PORT, () =>
//   console.log(`Server running on http://localhost:${PORT}`)
// );

/*app.post("/generate-pdf", async (req, res) => {
  try {
    const {
      name,
      surname,
      address,
      postalCode,
      city,
      amount,
      amountText,
      donationDate,
      email,
    } = req.body;

    const formPdfBytes = fs.readFileSync("./templates/recu_fiscal.pdf");
    const pdfDoc = await PDFDocument.load(formPdfBytes);
    const form = pdfDoc.getForm();

    // Fill form fields
    form.getTextField("Nom").setText(name || "");
    form.getTextField("Prénoms").setText(surname || "");
    form.getTextField("Adresse_2").setText(address || "");
    form.getTextField("Code Postal_2").setText(postalCode || "");
    form.getTextField("Commune_2").setText(city || "");
    form.getTextField("Euros").setText(amount || "");
    form.getTextField("Somme en toutes lettres").setText(amountText || "");
    form.getTextField("date1").setText(donationDate || "");

    // Checkboxes
    form.getCheckBox("200 du CGI").check();
    form.getCheckBox("Numéraire").check();

    form.updateFieldAppearances();
    form.flatten();

    const pdfBytes = await pdfDoc.save();
    const filename = `Donation_Receipt_${name}_${surname}_${donationDate}.pdf`.replace(/\s+/g, "_");

    // Create email transport with IONOS
    const transporter = nodemailer.createTransport({
      host: "smtp.ionos.com",
      port: 587,
      secure: false,
      auth: {
        user: "your-email@yourdomain.com",  // Replace with your IONOS email
        pass: "your-password",              // Replace with your IONOS email password
      },
    });

    await transporter.sendMail({
      from: '"Support Team" <your-email@yourdomain.com>',
      to: email,
      subject: "Your Donation Receipt",
      text: `Hello ${name},\n\nThank you for your donation. Please find your receipt attached.\n\nBest regards,\nSupport Team`,
      attachments: [
        {
          filename,
          content: Buffer.from(pdfBytes),
          contentType: "application/pdf",
        },
      ],
    });

    res.json({ success: true, message: "PDF generated and email sent" });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send("Error generating or sending PDF");
  }
});
*/

// const express = require("express");
// const fs = require("fs");
// const cors = require("cors");
// const path = require("path");
// const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

// const app = express();
// app.use(express.json({ limit: "10mb" }));
// app.use(cors());

// const counterPath = path.join(__dirname, "data", "receiptCounter.json");

// function getNextReceiptNumber() {
//   let counter = { lastReceiptNumber: 1000 };

//   try {
//     if (fs.existsSync(counterPath)) {
//       counter = JSON.parse(fs.readFileSync(counterPath, "utf-8"));
//     }
//     counter.lastReceiptNumber += 1;
//     fs.writeFileSync(counterPath, JSON.stringify(counter, null, 2));
//   } catch (err) {
//     console.error("Failed to read/write receipt counter:", err);
//   }

//   return counter.lastReceiptNumber;
// }

// app.post("/generate-pdf", async (req, res) => {
//   try {
//     const {
//       name,
//       surname,
//       address,
//       postalCode,
//       city,
//       amount,
//       amountText,
//       donationDate,
//     } = req.body;

//     const receiptNumber = getNextReceiptNumber();

//     const pdfBytes = fs.readFileSync("./templates/_recu_fiscal.pdf");
//     const pdfDoc = await PDFDocument.load(pdfBytes);
//     const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
//     const pages = pdfDoc.getPages();

//     const page1 = pages[0]; // First page
//     const page2 = pages[1]; // Second page

//     const drawField = (page, text, x, y) => {
//       page.drawText(text || "", {
//         x,
//         y,
//         size: 12,
//         font: helvetica,
//         color: rgb(0, 0, 0),
//       });
//     };

//     drawField(page1, receiptNumber.toString(), 480, 761);

//     drawField(page2, name, 350, 740);
//     drawField(page2, surname, 60, 740);
//     drawField(page2, address, 60, 695);
//     drawField(page2, postalCode, 130, 680);
//     drawField(page2, city, 280, 680);
//     drawField(page2, `${amount} €`, 100, 580);
//     drawField(page2, amountText, 180, 550);
//     drawField(page2, new Date().toLocaleDateString("fr-FR"), 200, 520);
//     drawField(page2, new Date().toLocaleDateString("fr-FR"), 370, 97);

//     if (pages.length > 1) {
//       const secondPage = pages[1];
//       const sigBytes = fs.readFileSync("./assets/signature.png");
//       const sigImage = await pdfDoc.embedPng(sigBytes);
//       const sigDims = sigImage.scale(0.35);

//       secondPage.drawImage(sigImage, {
//         x: 380,
//         y: 20,
//         width: sigDims.width,
//         height: sigDims.height,
//       });
//     }

//     const finalPdfBytes = await pdfDoc.save();
//     const pdfBase64 = Buffer.from(finalPdfBytes).toString("base64");
//     const filename =
//       `Donation_Receipt_${name}_${surname}_${donationDate}_#${receiptNumber}.pdf`.replace(
//         /\s+/g,
//         "_"
//       );

//     res.json({ pdf: pdfBase64, filename });
//   } catch (err) {
//     console.error("PDF generation error:", err);
//     res.status(500).send("Error generating PDF");
//   }
// });

// app.get("/debug-form-fields", async (req, res) => {
//   try {
//     const pdfBytes = fs.readFileSync("./templates/recu_fiscal.pdf");
//     const pdfDoc = await PDFDocument.load(pdfBytes);
//     const form = pdfDoc.getForm();

//     const fields = form.getFields().map((field) => ({
//       name: field.getName(),
//       type: field.constructor.name,
//     }));

//     res.json(fields);
//   } catch (err) {
//     console.error("Error listing form fields:", err);
//     res.status(500).send("Failed to list form fields");
//   }
// });

// const PORT = 5000;
// app.listen(PORT, () =>
//   console.log(`✅ Server running at http://localhost:${PORT}`)
// );

// const express = require("express");
// const fs = require("fs");
// const cors = require("cors");
// const path = require("path");
// const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

// const app = express();
// app.use(express.json({ limit: "10mb" }));
// app.use(cors());

// const counterPath = path.join(__dirname, "data", "receiptCounter.json");

// function getNextReceiptNumber() {
//   let counter = { lastReceiptNumber: 1000 };

//   try {
//     if (fs.existsSync(counterPath)) {
//       counter = JSON.parse(fs.readFileSync(counterPath, "utf-8"));
//     }
//     counter.lastReceiptNumber += 1;
//     fs.writeFileSync(counterPath, JSON.stringify(counter, null, 2));
//   } catch (err) {
//     console.error("Failed to read/write receipt counter:", err);
//   }

//   return counter.lastReceiptNumber;
// }

// app.post("/generate-pdf", async (req, res) => {
//   try {
//     const { name, surname, address, postalCode, city, amount, amountText } =
//       req.body;

//     const receiptNumber = getNextReceiptNumber();

//     const pdfBytes = fs.readFileSync("./templates/_recu_fiscal.pdf");
//     const pdfDoc = await PDFDocument.load(pdfBytes);
//     const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
//     const pages = pdfDoc.getPages();

//     const page1 = pages[0];
//     const page2 = pages[1];

//     const drawField = (page, text, x, y) => {
//       page.drawText(text || "", {
//         x,
//         y,
//         size: 12,
//         font: helvetica,
//         color: rgb(0, 0, 0),
//       });
//     };

//     drawField(page1, receiptNumber.toString(), 480, 761);
//     drawField(page2, name, 350, 740);
//     drawField(page2, surname, 60, 740);
//     drawField(page2, address, 60, 695);
//     drawField(page2, postalCode, 130, 680);
//     drawField(page2, city, 280, 680);
//     drawField(page2, `${amount} €`, 100, 580);
//     drawField(page2, amountText, 180, 550);

//     const currentDate = new Date().toLocaleDateString("fr-FR");
//     drawField(page2, currentDate, 200, 520); // Date of donation
//     drawField(page2, currentDate, 370, 97); // Signature date

//     if (pages.length > 1) {
//       const secondPage = pages[1];
//       const sigBytes = fs.readFileSync("./assets/signature.png");
//       const sigImage = await pdfDoc.embedPng(sigBytes);
//       const sigDims = sigImage.scale(0.35);

//       secondPage.drawImage(sigImage, {
//         x: 380,
//         y: 20,
//         width: sigDims.width,
//         height: sigDims.height,
//       });
//     }

//     const finalPdfBytes = await pdfDoc.save();
//     const pdfBase64 = Buffer.from(finalPdfBytes).toString("base64");
//     const filename =
//       `Donation_Receipt_${name}_${surname}_#${receiptNumber}.pdf`.replace(
//         /\s+/g,
//         "_"
//       );

//     res.json({ pdf: pdfBase64, filename });
//   } catch (err) {
//     console.error("PDF generation error:", err);
//     res.status(500).send("Error generating PDF");
//   }
// });

// app.get("/debug-form-fields", async (req, res) => {
//   try {
//     const pdfBytes = fs.readFileSync("./templates/recu_fiscal.pdf");
//     const pdfDoc = await PDFDocument.load(pdfBytes);
//     const form = pdfDoc.getForm();

//     const fields = form.getFields().map((field) => ({
//       name: field.getName(),
//       type: field.constructor.name,
//     }));

//     res.json(fields);
//   } catch (err) {
//     console.error("Error listing form fields:", err);
//     res.status(500).send("Failed to list form fields");
//   }
// });

// const PORT = 5000;
// app.listen(PORT, () =>
//   console.log(`✅ Server running at http://localhost:${PORT}`)
// );

// import express from "express";
// import fs from "fs/promises";
// import cors from "cors";
// import path from "path";
// import { fileURLToPath } from "url";
// import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// // Emulate __dirname in ES6
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const app = express();
// app.use(express.json({ limit: "10mb" }));
// app.use(cors());

// const counterPath = path.join(__dirname, "data", "receiptCounter.json");

// async function getNextReceiptNumber() {
//   let counter = { lastReceiptNumber: 1000 };

//   try {
//     const exists = await fs
//       .access(counterPath)
//       .then(() => true)
//       .catch(() => false);
//     if (exists) {
//       const data = await fs.readFile(counterPath, "utf-8");
//       counter = JSON.parse(data);
//     }
//     counter.lastReceiptNumber += 1;
//     await fs.writeFile(counterPath, JSON.stringify(counter, null, 2));
//   } catch (err) {
//     console.error("Failed to read/write receipt counter:", err);
//   }

//   return counter.lastReceiptNumber;
// }

// app.post("/generate-pdf", async (req, res) => {
//   try {
//     const { name, surname, address, postalCode, city, amount, amountText } =
//       req.body;
//     const receiptNumber = await getNextReceiptNumber();

//     const pdfBytes = await fs.readFile(
//       path.join(__dirname, "templates", "recu_fiscal.pdf")
//     );
//     const pdfDoc = await PDFDocument.load(pdfBytes);
//     const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
//     const pages = pdfDoc.getPages();

//     const page1 = pages[0];
//     const page2 = pages[1];

//     const drawField = (page, text, x, y) => {
//       page.drawText(text || "", {
//         x,
//         y,
//         size: 12,
//         font: helvetica,
//         color: rgb(0, 0, 0),
//       });
//     };

//     drawField(page1, receiptNumber.toString(), 480, 761);
//     drawField(page2, name, 350, 740);
//     drawField(page2, surname, 60, 740);
//     drawField(page2, address, 60, 695);
//     drawField(page2, postalCode, 130, 680);
//     drawField(page2, city, 280, 680);
//     drawField(page2, `${amount} €`, 100, 580);
//     drawField(page2, amountText, 180, 550);

//     const currentDate = new Date().toLocaleDateString("fr-FR");
//     drawField(page2, currentDate, 200, 520); // Date of donation
//     drawField(page2, currentDate, 370, 97); // Signature date

//     if (pages.length > 1) {
//       const sigBytes = await fs.readFile(
//         path.join(__dirname, "assets", "signature.png")
//       );
//       const sigImage = await pdfDoc.embedPng(sigBytes);
//       const sigDims = sigImage.scale(0.35);

//       page2.drawImage(sigImage, {
//         x: 380,
//         y: 20,
//         width: sigDims.width,
//         height: sigDims.height,
//       });
//     }

//     const finalPdfBytes = await pdfDoc.save();
//     const pdfBase64 = Buffer.from(finalPdfBytes).toString("base64");
//     const filename =
//       `Donation_Receipt_${name}_${surname}_#${receiptNumber}.pdf`.replace(
//         /\s+/g,
//         "_"
//       );

//     res.json({ pdf: pdfBase64, filename });
//   } catch (err) {
//     console.error("PDF generation error:", err);
//     res.status(500).send("Error generating PDF");
//   }
// });

// app.get("/debug-form-fields", async (req, res) => {
//   try {
//     const pdfBytes = await fs.readFile(
//       path.join(__dirname, "templates", "recu_fiscal.pdf")
//     );
//     const pdfDoc = await PDFDocument.load(pdfBytes);
//     const form = pdfDoc.getForm();

//     const fields = form.getFields().map((field) => ({
//       name: field.getName(),
//       type: field.constructor.name,
//     }));

//     res.json(fields);
//   } catch (err) {
//     console.error("Error listing form fields:", err);
//     res.status(500).send("Failed to list form fields");
//   }
// });

// const PORT = 5001;
// app.listen(PORT, () => {
//   console.log(`✅ Server running at http://localhost:${PORT}`);
// });

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
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: false, // true for 465, false for 587
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
    attachments: [
      {
        filename,
        content: pdfBuffer,
      },
    ],
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

    const pdfBytes = await fs.readFile(
      path.join(__dirname, "templates", "recu_fiscal.pdf")
    );
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    const page1 = pages[0];
    const page2 = pages[1];

    const drawField = (page, text, x, y) => {
      page.drawText(text || "", {
        x,
        y,
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    };

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

    if (pages.length > 1) {
      const sigBytes = await fs.readFile(
        path.join(__dirname, "assets", "signature.png")
      );
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
      `Donation_Receipt_${name}_${surname}_#${receiptNumber}.pdf`.replace(
        /\s+/g,
        "_"
      );

    // ✅ Email with PDF attachment
    if (email) {
      const donorHtml = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; background-color: #f9f9f9; border-radius: 8px;">
    <h2 style="color: #2e7d32;"> Votre reçu fiscal est prêt</h2>
    <p>Salam alaykoum <strong>${name} ${surname}</strong>,</p>
    <p>
      Au nom de toute l'équipe de l'<strong>Association SOS Humanistes</strong>, nous vous exprimons notre profonde gratitude pour votre généreux don.
    </p>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 8px;"> <strong>Montant du don :</strong></td>
        <td style="padding: 8px;">${amount} €</td>
      </tr>
      <tr>
        <td style="padding: 8px;"> <strong>ID de transaction :</strong></td>
        <td style="padding: 8px;">${receiptNumber}</td>
      </tr>
    </table>
    <p>
      Grâce à votre don, nous pourrons fournir une aide médicale, de la nourriture, de l'eau potable et d'autres fournitures essentielles aux personnes touchées par le conflit en Palestine.
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
    <p><strong>📎 Votre reçu fiscal au format PDF est joint à ce message.</strong></p>
  </div>
`;
      const adminHtml = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 25px; background-color: #fff8e1; border-radius: 8px;">
    <h2 style="color: #d32f2f;"> Nouveau reçu généré</h2>
    <p>Un nouveau reçu fiscal a été généré avec les informations suivantes :</p>

    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 15px;">
      <tr>
        <td style="padding: 8px;"><strong> Nom du donateur :</strong></td>
        <td style="padding: 8px;">${name} ${surname}</td>
      </tr>
      <tr>
        <td style="padding: 8px;"><strong> Adresse :</strong></td>
        <td style="padding: 8px;">${address}, ${postalCode} ${city}</td>
      </tr>
      <tr>
        <td style="padding: 8px;"><strong> Email :</strong></td>
        <td style="padding: 8px;">${email}</td>
      </tr>
      <tr>
        <td style="padding: 8px;"><strong> Montant :</strong></td>
        <td style="padding: 8px;">${amount} € (${amountText})</td>
      </tr>
      <tr>
        <td style="padding: 8px;"><strong> ID reçu :</strong></td>
        <td style="padding: 8px;">#${receiptNumber}</td>
      </tr>
    </table>

    <p><strong>Le reçu PDF est joint à ce message.</strong></p>

    <p style="font-size: 13px; color: #999; margin-top: 30px;">
      Généré automatiquement par le système SOS Palestine.
    </p>
  </div>
`;

      await sendEmailWithAttachment({
        to: email,
        subject: "🎁 Votre reçu fiscal SOS Palestine",
        html: donorHtml, // ✅ Correct key name
        pdfBuffer: finalPdfBytes,
        filename,
      });

      // Optionally notify admin too
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

    const hasFullReceiptData = address && postalCode && city && amountText;

    let finalPdfBytes = null;
    let filename = null;
    let receiptNumber = null;

    if (hasFullReceiptData) {
      // Generate receipt number
      receiptNumber = await getNextReceiptNumber();

      // Load and edit PDF
      const pdfBytes = await fs.readFile(
        path.join(__dirname, "templates", "recu_fiscal.pdf")
      );
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();
      const page1 = pages[0];
      const page2 = pages[1];

      const drawField = (page, text, x, y) => {
        page.drawText(text || "", {
          x,
          y,
          size: 12,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
      };

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

      if (pages.length > 1) {
        const sigBytes = await fs.readFile(
          path.join(__dirname, "assets", "signature.png")
        );
        const sigImage = await pdfDoc.embedPng(sigBytes);
        const sigDims = sigImage.scale(0.35);
        page2.drawImage(sigImage, {
          x: 380,
          y: 20,
          width: sigDims.width,
          height: sigDims.height,
        });
      }

      finalPdfBytes = await pdfDoc.save();
      filename =
        `Donation_Receipt_${name}_${surname}_#${receiptNumber}.pdf`.replace(
          /\s+/g,
          "_"
        );
    }

    // HTML for thank you or receipt
    const donorHtml = hasFullReceiptData
      ? `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; background-color: #f9f9f9; border-radius: 8px;">
      <h2 style="color: #2e7d32;"> Votre reçu fiscal est prêt</h2>
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

    await sendEmailWithAttachment({
      to: email,
      subject: hasFullReceiptData
        ? "🎁 Votre reçu fiscal SOS Palestine"
        : "💖 Merci pour votre don à SOS Palestine",
      html: donorHtml,
      pdfBuffer: finalPdfBytes,
      filename,
    });

    if (hasFullReceiptData) {
      const adminHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 25px; background-color: #fff8e1; border-radius: 8px;">
          <h2 style="color: #d32f2f;"> Nouveau reçu généré</h2>
          <p>Nom: ${name} ${surname} <br>Email: ${email} <br>Montant: ${amount} € <br>ID: #${receiptNumber}</p>
        </div>`;

      await sendEmailWithAttachment({
        to: "omarbarakeh20002@gmail.com",
        subject: `📩 Nouveau reçu généré (#${receiptNumber})`,
        html: adminHtml,
        pdfBuffer: finalPdfBytes,
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
