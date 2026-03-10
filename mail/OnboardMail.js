// utils/onboardMail.js
import nodemailer from "nodemailer";

const createTransporter = () => {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    throw new Error("Mail credentials missing in environment variables");
  }

  console.log("[MAIL] Using sender:", process.env.MAIL_USER); // debug
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
};

export const sendOnboardEmail = async ({ to, name, plan, startDate, expiresAt }) => {
  console.log("[MAIL] sendOnboardEmail called for:", to, "plan:", plan);

  const transporter = createTransporter();

  const start =
    startDate instanceof Date ? startDate : startDate ? new Date(startDate) : null;
  const expiry =
    expiresAt instanceof Date ? expiresAt : expiresAt ? new Date(expiresAt) : null;

  const startStr = start ? start.toLocaleDateString() : "today";
  const expStr = expiry ? expiry.toLocaleDateString() : "soon";

  const mailOptions = {
    from: process.env.MAIL_USER,
    to,
    subject: `Welcome to Medgyan – Your ${plan} plan is live`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to Medgyan</h2>
        <p>Hello ${name || "User"},</p>
        <p>Your <strong>${plan}</strong> plan has been activated.</p>
        <p>
          <strong>Start date:</strong> ${startStr}<br/>
          <strong>Expiry date:</strong> ${expStr}
        </p>
        <p>
          You now have access to all the features included in your ${plan} subscription.
        </p>
        <p>
          If you have any questions or need help getting started, feel free to reply to this email.
        </p>
        <hr style="margin: 30px 0;">
        <p>Welcome on board!<br/>Team Medgyan</p>
      </div>
    `,
  };

  try {
    console.log("[MAIL] Sending mail to:", mailOptions.to);
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Onboard email sent:", info.response);
  } catch (error) {
    console.error("❌ Onboard mail send error:", error);
  }
};
