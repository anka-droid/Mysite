const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _transporter;
}

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[Email] SMTP not configured — email not sent. To:', to, '|', subject);
    return;
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || `"Kamkhadze PA" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''),
  });
}

function wrapEmail(title, bodyHtml) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body { font-family: 'Georgia', serif; background:#0e0e17; color:#e8e6e0; margin:0; padding:40px 20px; }
  .card { max-width:520px; margin:0 auto; background:#16161f; border:1px solid #2a2a3a; border-radius:12px; padding:40px; }
  .logo { font-size:22px; font-weight:600; letter-spacing:0.05em; margin-bottom:4px; }
  .logo span { color:#3b82f6; }
  .sub { font-size:11px; letter-spacing:0.15em; text-transform:uppercase; color:#6b6b80; margin-bottom:32px; }
  h2 { font-size:20px; font-weight:400; color:#f0ede8; margin:0 0 16px; }
  p  { font-size:14px; color:#9b9baa; line-height:1.7; margin:0 0 16px; }
  .btn { display:inline-block; padding:13px 28px; background:#3b82f6; color:#ffffff; text-decoration:none; border-radius:8px; font-size:14px; font-weight:700; letter-spacing:0.04em; margin:8px 0 24px; }
  .note { font-size:12px; color:#6b6b80; border-top:1px solid #2a2a3a; padding-top:20px; margin-top:24px; line-height:1.6; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">KAMKHADZE<span> PA</span></div>
  <div class="sub">Immigration Law Firm · Case Manager</div>
  <h2>${title}</h2>
  ${bodyHtml}
  <div class="note">
    🔒 This email was sent by the Kamkhadze PA Case Management System.<br>
    If you did not request this, please ignore it — no action is needed.
  </div>
</div>
</body>
</html>`;
}

async function sendPasswordReset({ to, name, resetUrl }) {
  const html = wrapEmail('Reset Your Password', `
    <p>Hello ${name || 'there'},</p>
    <p>Someone requested a password reset for your Kamkhadze PA account.
       Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
    <a class="btn" href="${resetUrl}">Reset Password →</a>
    <p>Or copy this link into your browser:<br>
       <span style="color:#3b82f6;word-break:break-all;font-size:12px">${resetUrl}</span></p>
  `);
  await sendEmail({ to, subject: 'Reset your Kamkhadze PA password', html });
}

async function sendInvite({ to, name, invitedBy, inviteUrl }) {
  const html = wrapEmail('You\'ve Been Invited', `
    <p>Hello ${name || 'there'},</p>
    <p><strong>${invitedBy || 'Ana Kamkhadze'}</strong> has invited you to join the
       <strong>Kamkhadze PA Case Management System</strong>.</p>
    <p>Click the button below to set up your account. This invitation expires in <strong>48 hours</strong>.</p>
    <a class="btn" href="${inviteUrl}">Accept Invitation →</a>
    <p>Or copy this link:<br>
       <span style="color:#3b82f6;word-break:break-all;font-size:12px">${inviteUrl}</span></p>
    <p style="color:#6b6b80;font-size:12px">
      This system contains confidential attorney-client privileged data.
      Do not share your login credentials with anyone.
    </p>
  `);
  await sendEmail({ to, subject: `You've been invited to Kamkhadze PA Case Manager`, html });
}

module.exports = { sendEmail, sendPasswordReset, sendInvite };
