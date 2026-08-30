/**
 * Shared response body parser.
 *
 * Attempts JSON.parse, falls back to HTML-stripped error text.
 * Returns `unknown` — the request path narrows the parsed value with
 * runtime guards before trusting any field.
 */

export async function parseResponseBody(response: Response): Promise<unknown> {
    const responseText = await response.text().catch(() => '');
    if (!responseText) {
        return {};
    }

    try {
        return JSON.parse(responseText);
    } catch {
        return {
            error: response.ok
                ? responseText
                : responseText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() ||
                `HTTP error! Status: ${response.status}`,
        };
    }
}
