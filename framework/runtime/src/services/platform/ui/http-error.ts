/**
 * HttpError — typed error for HTTP handler responses.
 *
 * Thrown by service methods when a request fails due to authorization,
 * validation, or not-found conditions. Handlers catch these and translate
 * to the appropriate HTTP status code.
 */
export class HttpError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
    ) {
        super(message);
    }
}
