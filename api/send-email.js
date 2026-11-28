// Vercel Serverless Function — Envío de correos vía Gmail SMTP
// Credenciales en variables de entorno: SMTP_USER, SMTP_PASS
const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { to, subject, message, attachmentBase64, attachmentName } = req.body || {};

  if (!to || !subject) {
    return res.status(400).json({ error: 'Faltan campos: to, subject' });
  }

  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS;
  if (!SMTP_USER || !SMTP_PASS) {
    return res.status(500).json({ error: 'SMTP no configurado en el servidor (SMTP_USER / SMTP_PASS)' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // TLS via STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const mailOptions = {
      from: `"FACTURACION UROEXPERTOS" <${SMTP_USER}>`,
      to,
      subject,
      html: `
        <div style="font-family:Arial,sans-serif;font-size:14px;color:#1e2a3a;line-height:1.6">
          <p>${(message || '').replace(/\n/g, '<br>')}</p>
          <br>
          <hr style="border:none;border-top:1px solid #e0e0e0">
          <p style="font-size:12px;color:#888">
            Este correo fue enviado automáticamente desde el sistema BOE — UroExpertos.<br>
            <strong>facturacion@uroexpertos.com</strong>
          </p>
        </div>`,
    };

    if (attachmentBase64 && attachmentName) {
      mailOptions.attachments = [{
        filename: attachmentName,
        content: attachmentBase64,
        encoding: 'base64',
      }];
    }

    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error('SMTP error:', err);
    return res.status(500).json({ error: err.message });
  }
};
