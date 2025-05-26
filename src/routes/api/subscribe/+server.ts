// src/routes/api/subscribe/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { SubscriptionRequestBody, SubscriptionResponse, ErrorResponse, SubscriberStatus } from '$lib/types';
import db from '$lib/server/db';
import { v4 as uuidv4 } from 'uuid';
import { sendConfirmationEmail } from '$lib/server/email';

export const POST: RequestHandler = async ({ request }) => {
    console.log('[API] Starting subscription request processing');

    try {
        // Parse request body
        let requestBody: SubscriptionRequestBody;
        try {
            requestBody = await request.json();
            console.log('[API] Request body parsed successfully');
        } catch (parseError) {
            console.error('[API] Failed to parse request body:', parseError);
            const errorResponse: ErrorResponse = { message: 'Invalid request format.' };
            return json(errorResponse, { status: 400 });
        }

        const { email } = requestBody;
        console.log(`[API] Processing subscription for email: ${email}`);

        // Validate email presence
        if (!email) {
            console.log('[API] Email validation failed - missing email');
            const errorResponse: ErrorResponse = { message: 'Email address is required.' };
            return json(errorResponse, { status: 400 });
        }

        // Validate email format
        const emailRegex: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('[API] Email validation failed - invalid format');
            const errorResponse: ErrorResponse = { message: 'Please enter a valid email address format.' };
            return json(errorResponse, { status: 400 });
        }

        // Database operations
        try {
            console.log('[API] Starting database operations');

            // Test database connection first
            try {
                await db.query('SELECT 1');
                console.log('[API] Database connection verified');
            } catch (dbTestError) {
                console.error('[API] Database connection failed:', dbTestError);
                const errorResponse: ErrorResponse = { message: 'Database service unavailable. Please try again later.' };
                return json(errorResponse, { status: 503 });
            }

            const token = uuidv4();
            console.log(`[API] Generated token: ${token.substring(0, 8)}...`);

            const result = await db.query(
                `INSERT INTO subscribers(email, status, confirmation_token, created_at, updated_at)
                 VALUES($1, 'pending', $2, NOW(), NOW())
                 ON CONFLICT (email) DO UPDATE SET
                    confirmation_token = EXCLUDED.confirmation_token,
                    status = CASE
                                 WHEN subscribers.status = 'unsubscribed' THEN 'pending'
                                 ELSE subscribers.status
                             END,
                    updated_at = NOW()
                 RETURNING id, status, email`,
                [email, token]
            );

            console.log(`[API] Database query completed. Rows affected: ${result.rowCount}`);

            if (result.rowCount && result.rowCount > 0 && result.rows[0]) {
                const subscriberStatus: SubscriberStatus = result.rows[0].status;
                const subscriberEmail: string = result.rows[0].email;
                const subscriberId: number = result.rows[0].id;

                console.log(`[API] Subscriber ${subscriberId} status: ${subscriberStatus}`);

                if (subscriberStatus === 'confirmed') {
                    console.log(`[API] Email already confirmed: ${subscriberEmail}`);
                    const successResponse: SubscriptionResponse = {
                        message: 'You are already subscribed and confirmed!'
                    };
                    return json(successResponse, { status: 200 });
                } else {
                    // Status is 'pending' - send confirmation email
                    console.log(`[API] Sending confirmation email to: ${subscriberEmail}`);

                    try {
                        await sendConfirmationEmail({ to: subscriberEmail, token: token });
                        console.log(`[API] Confirmation email sent successfully to: ${subscriberEmail}`);

                        const successResponse: SubscriptionResponse = {
                            message: 'Please check your email to confirm your subscription!'
                        };
                        return json(successResponse, { status: 200 });

                    } catch (emailSendError: unknown) {
                        console.error('[API] Failed to send confirmation email:', emailSendError);

                        // Log more details about the email error
                        if (emailSendError instanceof Error) {
                            console.error('[API] Email error details:', {
                                message: emailSendError.message,
                                stack: emailSendError.stack
                            });
                        }

                        // Return error since email confirmation is crucial
                        const errorResponse: ErrorResponse = {
                            message: 'Failed to send confirmation email. Please try again or contact support.'
                        };
                        return json(errorResponse, { status: 500 });
                    }
                }
            } else {
                console.error(`[API] Database operation failed - no rows returned for: ${email}`);
                const errorResponse: ErrorResponse = {
                    message: 'Failed to process subscription request. Please try again.'
                };
                return json(errorResponse, { status: 500 });
            }

        } catch (dbError: unknown) {
            console.error('[API] Database error during subscription:', dbError);

            // Log more details about database error
            if (dbError instanceof Error) {
                console.error('[API] Database error details:', {
                    message: dbError.message,
                    stack: dbError.stack
                });
            }

            const errorResponse: ErrorResponse = {
                message: 'Database error occurred. Please try again later.'
            };
            return json(errorResponse, { status: 500 });
        }

    } catch (apiError: unknown) {
        console.error('[API] Unexpected API error:', apiError);

        // Log more details about the error
        if (apiError instanceof Error) {
            console.error('[API] API error details:', {
                message: apiError.message,
                stack: apiError.stack
            });
        }

        const errorResponse: ErrorResponse = {
            message: 'Internal server error occurred. Please try again later.'
        };
        return json(errorResponse, { status: 500 });
    }
};