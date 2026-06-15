/**
 * Shared response body parser.
 *
 * Attempts JSON.parse, falls back to HTML-stripped error text.
 */

export async function parseResponseBody(response: Response): Promise<any> {
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
