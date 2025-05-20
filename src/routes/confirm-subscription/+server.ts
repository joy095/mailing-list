// src/routes/confirm-subscription/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';// Import types for response bodies
import type { ErrorResponse, SubscriptionResponse } from '$lib/types';
import db from '$lib/server/db'; // Import the database connection pool

/**
 * Handles GET requests to the /confirm-subscription endpoint.
 * This endpoint is accessed when a user clicks the confirmation link in their email.
 * It extracts the token from the URL, verifies it against the database,
 * and updates the subscriber's status to 'confirmed'.
 * @type {import('./$types').RequestHandler}
 */
export const GET: RequestHandler = async ({ url }) => {
    // Extract the 'token' query parameter from the URL
    const token = url.searchParams.get('token');

    // 1. Validate: Check if the token is present in the URL
    if (!token) {
        // If token is missing, return an error.
        // In a real application, you might redirect to a specific error page instead of returning JSON.
        console.warn('Confirmation attempt with missing token');
        const errorResponse: ErrorResponse = { message: 'Confirmation token is missing from the link.' };
        return json(errorResponse, { status: 400 }); // Return 400 Bad Request
    }

    try {
        // 2. Database Operation: Find the subscriber by token and update status
        // This query attempts to update a subscriber record:
        // - Sets status to 'confirmed'.
        // - Sets confirmation_token to NULL (to invalidate the token after use).
        // It only performs the update if the confirmation_token matches AND the current status is 'pending'.
        const result = await db.query(
            `UPDATE subscribers
             SET status = 'confirmed', confirmation_token = NULL
             WHERE confirmation_token = $1 AND status = 'pending' -- Only update if token matches AND status is pending
             RETURNING id, email`, // Return id and email of the confirmed subscriber
            [token] // Parameterized query value
        );

        // 3. Process the database query result
        // result.rowCount will be 1 if a subscriber was found and updated, 0 otherwise.
        if (result.rowCount && result.rowCount > 0) {
            // If a row was updated, the confirmation was successful
            const confirmedEmail = result.rows[0]?.email;
            console.log(`Subscription successfully confirmed for: ${confirmedEmail}`);
            const successResponse: SubscriptionResponse = { message: 'Your subscription has been successfully confirmed!' };
            // In a real application, you would typically redirect the user to a success page:
            // throw redirect(303, '/subscription-confirmed');
            return json(successResponse, { status: 200 }); // Return 200 OK
        } else {
            // If no row was updated, the token was either invalid, expired, or already used,
            // or the subscriber was not in 'pending' status.
            console.warn(`Invalid, expired, or already used confirmation token: ${token}`);
            const errorResponse: ErrorResponse = { message: 'Invalid or expired confirmation link, or subscription already confirmed.' };
            return json(errorResponse, { status: 404 }); // Return 404 Not Found (as the token didn't match an active pending subscriber)
        }

    } catch (dbError: unknown) {
        // Catch any database errors during the update process
        const errorMessage = (dbError instanceof Error) ? dbError.message : 'An unknown database error occurred during confirmation.';
        console.error('Database error during confirmation:', errorMessage);

        // Return a generic error message to the client
        const errorResponse: ErrorResponse = { message: 'An error occurred during confirmation. Please try again.' };
        return json(errorResponse, { status: 500 }); // Return 500 Internal Server Error
    }
};
