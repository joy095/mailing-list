// src/lib/server/email.ts

import nodemailer from 'nodemailer';

if (!import.meta.env.VITE_SMTP_USERNAME || !import.meta.env.VITE_SMTP_PASSWORD) {
    console.error('[Email Service] SMTP credentials not configured. Email sending will fail.');
}

// Create transporter with better configuration
const transporter = nodemailer.createTransport({
    host: import.meta.env.VITE_SMTP_HOST,
    port: parseInt(import.meta.env.VITE_SMTP_PORT || '587'),
    secure: parseInt(import.meta.env.VITE_SMTP_PORT || '587') === 465, // true for 465, false for other ports
    auth: {
        user: import.meta.env.VITE_SMTP_USERNAME,
        pass: import.meta.env.VITE_SMTP_PASSWORD,
    },
    logger: true,
    debug: true,
    // Add connection timeout
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 5000,    // 5 seconds
    socketTimeout: 10000,     // 10 seconds
});

// Test transporter configuration at startup
transporter.verify((error: any) => {
    if (error) {
        console.error('[Email Service] SMTP configuration error:', error);
    } else {
        console.log('[Email Service] SMTP server is ready to send emails');
    }
});

const FROM_EMAIL = import.meta.env.VITE_SMTP_USERNAME;

export async function sendConfirmationEmail({ to, token }: { to: string; token: string }) {
    console.log(`[Email Service] Starting email send process for: ${to}`);

    // Check if email service is configured
    if (!import.meta.env.VITE_SMTP_USERNAME || !import.meta.env.VITE_SMTP_PASSWORD) {
        console.error('[Email Service] Email credentials not configured');
        throw new Error('Email service not configured - missing SMTP credentials');
    }

    if (!import.meta.env.VITE_BASE_URL) {
        console.error('[Email Service] Base URL not configured');
        throw new Error('Email service not configured - missing base URL');
    }

    // Construct confirmation link
    const confirmationLink = `${import.meta.env.VITE_BASE_URL}/confirm-subscription?token=${token}`;
    console.log(`[Email Service] Confirmation link: ${confirmationLink}`);

    // Email content
    const emailSubject = 'Confirm Your Subscription to Our Mailing List';
    const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Confirm Your Subscription</h2>
            <p>Hello,</p>
            <p>Thank you for subscribing to our mailing list!</p>
            <p>Please click the button below to confirm your subscription:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${confirmationLink}" 
                   style="background-color: #007cba; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 4px; display: inline-block;">
                    Confirm My Subscription
                </a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="${confirmationLink}">${confirmationLink}</a></p>
            <p>If you did not subscribe to this mailing list, you can safely ignore this email.</p>
            <p>Thank you,<br>Your Team</p>
        </div>
    `;

    const emailText = `
Hello,

Thank you for subscribing to our mailing list!

Please click the link below to confirm your subscription:
${confirmationLink}

If you did not subscribe to this mailing list, you can safely ignore this email.

Thank you,
Your Team
    `.trim();

    try {
        console.log(`[Email Service] Sending email to: ${to}`);

        const mailOptions = {
            from: `"Your Newsletter" <${FROM_EMAIL}>`,
            to: to,
            subject: emailSubject,
            html: emailHtml,
            text: emailText,
        };

        console.log('[Email Service] Mail options prepared:', {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject
        });

        const info = await transporter.sendMail(mailOptions);

        console.log('[Email Service] Email sent successfully:', {
            messageId: info.messageId,
            response: info.response,
            accepted: info.accepted,
            rejected: info.rejected
        });

        return info;

    } catch (error: any) {
        console.error('[Email Service] Detailed error sending email:', {
            error: error.message,
            code: error.code,
            command: error.command,
            response: error.response,
            responseCode: error.responseCode
        });

        // Provide more specific error messages
        let userFriendlyMessage = 'Failed to send confirmation email';

        if (error.code === 'EAUTH') {
            userFriendlyMessage = 'Email authentication failed - please contact support';
        } else if (error.code === 'ECONNECTION') {
            userFriendlyMessage = 'Email service connection failed - please try again';
        } else if (error.code === 'ETIMEDOUT') {
            userFriendlyMessage = 'Email service timeout - please try again';
        }

        // Create a new error with user-friendly message but preserve original error details
        const emailError = new Error(`${userFriendlyMessage}. Original error: ${error.message}`);
        emailError.cause = error;

        throw emailError;
    }
}
