// src/routes/api/subscribe/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// Import necessary types for request/response bodies and subscriber data
import type { SubscriptionRequestBody, SubscriptionResponse, ErrorResponse, SubscriberStatus } from '$lib/types';
import db from '$lib/server/db'; // Import the database connection pool
import { v4 as uuidv4 } from 'uuid'; // Import uuid for generating unique tokens
import { sendConfirmationEmail } from '$lib/server/email'; // Import the email sending function

/**
 * Handles POST requests to the /api/subscribe endpoint.
 * This is the entry point for new subscription requests.
 * It validates the email, interacts with the database to save the subscriber
 * with a 'pending' status and confirmation token, and sends a confirmation email.
 * @type {import('./$types').RequestHandler}
 */
export const POST: RequestHandler = async ({ request }) => {
    try {
        // Parse the JSON body from the incoming request
        const requestBody: SubscriptionRequestBody = await request.json();
        const { email } = requestBody;

        // 1. Basic validation: Check if email is provided
        if (!email) {
            const errorResponse: ErrorResponse = { message: 'Email address is required.' };
            // Return a 400 Bad Request status if email is missing
            return json(errorResponse, { status: 400 });
        }

        // 2. Basic validation: Check if email format is valid
        const emailRegex: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            const errorResponse: ErrorResponse = { message: 'Please enter a valid email address format.' };
            // Return a 400 Bad Request status for invalid email format
            return json(errorResponse, { status: 400 });
        }

        try {
            // Generate a unique confirmation token for this subscription attempt
            const token = uuidv4();

            // 3. Database Operation: Insert or Update subscriber using ON CONFLICT
            // This SQL query attempts to INSERT a new subscriber.
            // If an email conflict occurs (email already exists due to UNIQUE constraint),
            // it executes the DO UPDATE clause instead of failing.
            const result = await db.query(
                `INSERT INTO subscribers(email, status, confirmation_token)
                 VALUES($1, 'pending', $2)
                 ON CONFLICT (email) DO UPDATE SET
                    confirmation_token = EXCLUDED.confirmation_token, -- Update token with the new one
                    status = CASE -- Update status based on the existing status
                                WHEN subscribers.status = 'unsubscribed' THEN 'pending' -- If previously unsubscribed, set to pending again
                                ELSE subscribers.status -- Otherwise, keep the existing status (pending or confirmed)
                             END
                 RETURNING id, status, email`, // Return data about the affected row
                [email, token] // Parameterized query values to prevent SQL injection
            );

            // 4. Process the database query result
            // result.rowCount indicates how many rows were affected (1 for insert or update)
            if (result.rowCount && result.rowCount > 0) {
                const subscriberStatus: SubscriberStatus = result.rows[0]?.status;
                const subscriberEmail: string = result.rows[0]?.email;

                // Check the status of the affected subscriber
                if (subscriberStatus === 'confirmed') {
                    // If the subscriber was already confirmed, inform the user
                    console.log(`Email already confirmed: ${subscriberEmail}`);
                    const successResponse: SubscriptionResponse = { message: 'You are already subscribed and confirmed!' };
                    return json(successResponse, { status: 200 });
                } else {
                    // If the status is 'pending' (new subscription or re-subscription after unsubscribe)
                    // Send the confirmation email
                    await sendConfirmationEmail({ to: subscriberEmail, token: token });
                    console.log(`Successfully processed subscription for (pending confirmation): ${subscriberEmail}`);
                    const successResponse: SubscriptionResponse = { message: 'Please check your email to confirm your subscription!' };
                    return json(successResponse, { status: 200 });
                }
            } else {
                // This case should ideally not be reached with the ON CONFLICT clause,
                // but serves as a fallback for unexpected query results.
                console.error(`Failed to insert or update subscriber for: ${email}. Database query returned no rows.`);
                const errorResponse: ErrorResponse = { message: 'Failed to process subscription request. Please try again.' };
                return json(errorResponse, { status: 500 }); // Return 500 Internal Server Error
            }

        } catch (dbOrEmailError: unknown) {
            // Catch errors specifically from database operations or email sending
            // Log the detailed error on the server side
            const errorMessage = (dbOrEmailError instanceof Error) ? dbOrEmailError.message : 'An unknown database or email error occurred.';
            console.error('Database or email sending error during subscription:', errorMessage);

            // Return a generic error message to the client for security
            const errorResponse: ErrorResponse = { message: 'Failed to subscribe. Please try again later.' };
            return json(errorResponse, { status: 500 }); // Return 500 Internal Server Error
        }

    } catch (apiError: unknown) {
        // Catch any other errors during the initial request processing (e.g., invalid JSON)
        const errorMessage = (apiError instanceof Error) ? apiError.message : 'An unknown API processing error occurred.';
        console.error('API processing error:', errorMessage);

        // Return a generic internal server error
        const errorResponse: ErrorResponse = { message: 'Internal server error occurred.' };
        return json(errorResponse, { status: 500 }); // Return 500 Internal Server Error
    }
};
