// src/lib/server/email.ts
import nodemailer from 'nodemailer';

// Create a Nodemailer transporter using SMTP
// Configure this with your email service provider's details.
const transporter = nodemailer.createTransport({
    host: import.meta.env.VITE_SMTP_HOST,
    port: parseInt(import.meta.env.VITE_SMTP_PORT || '587'), // Default to 587 if port is not specified
    secure: import.meta.env.VITE_SMTP_PORT === '465', // true for port 465 (SSL), false for other ports (like 587 - TLS)
    auth: {
        user: import.meta.env.VITE_SMTP_USERNAME, // Your SMTP address
        pass: import.meta.env.VITE_SMTP_PASSWORD, // Your email password or App Password
    },
});

// Optional: Verify connection configuration (good for debugging during setup)
// This attempts to connect to the SMTP server and logs the result.
transporter.verify(function (error) {
    if (error) {
        console.error("Nodemailer transporter verification error:", error);
        // Depending on your setup, you might want to exit the process or log a critical error here.
    } else {
        console.log("Nodemailer server is ready to take our messages");
    }
});

// Interface for parameters needed to send a confirmation email
interface SendConfirmationEmailParams {
    to: string; // Recipient email address
    token: string; // The unique confirmation token
}

// Function to send the subscription confirmation email
export async function sendConfirmationEmail({ to, token }: SendConfirmationEmailParams): Promise<void> {
    // Construct the confirmation link using the public site URL and the token
    const confirmationLink = `${import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5173'}/confirm-subscription?token=${token}`;

    try {
        // Send the email
        await transporter.sendMail({
            from: `"Your Site Name" <${import.meta.env.VITE_EMAIL_USER}>`, // Sender address (display name <email>)
            to: to, // List of receivers (the subscriber's email)
            subject: "Please Confirm Your Subscription", // Subject line
            html: `
                <p>Hello,</p>
                <p>Thank you for subscribing to our mailing list!</p>
                <p>Please click the link below to confirm your subscription:</p>
                <p><a href="${confirmationLink}">Confirm My Subscription</a></p>
                <p>If you did not sign up for this list, please ignore this email.</p>
                <p>Best regards,<br>Your Team</p>
            `, // HTML body of the email
            // You can also add a text body: text: "Please confirm your subscription by visiting: " + confirmationLink,
        });
        console.log(`Confirmation email sent successfully to ${to}`);
    } catch (error) {
        // Log errors if sending the email fails
        console.error(`Failed to send confirmation email to ${to}:`, error);
        // Re-throw the error so the calling function (the API endpoint) can handle it.
        throw new Error('Failed to send confirmation email');
    }
}
