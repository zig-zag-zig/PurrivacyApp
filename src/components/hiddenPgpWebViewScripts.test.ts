import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * APP-SEC-010 regression guard: the inline JavaScript that runs inside the
 * hidden PGP WebView lives in a template literal inside a .tsx file. The TS
 * compiler does NOT check that string, so TypeScript-only syntax (e.g.
 * `value as Type`) can silently break the entire script at WebView parse
 * time — which once took down all PGP operations at runtime while every unit
 * test stayed green (caught only by on-device E2E).
 *
 * This test extracts every <script> body from the PGP_HTML template literal
 * (with interpolations neutralized) and requires each to parse as plain
 * JavaScript via the Function constructor (parse only — nothing executes).
 */

const FILE = resolve(__dirname, 'HiddenPGPWebView.tsx');
const source = readFileSync(FILE, 'utf8');

function extractPgpHtmlTemplate(src: string): string {
    // Bounded by </html> rather than the closing backtick: the template body
    // itself contains escaped backticks (\`) in inner template literals,
    // which would terminate a naive backtick search early.
    const match = src.match(/const PGP_HTML = `([\s\S]*?<\/html>)[^`]*`;/s);
    if (!match) {
        throw new Error('PGP_HTML template literal not found in HiddenPGPWebView.tsx');
    }
    return match[1];
}

function extractScriptBodies(html: string): string[] {
    const bodies: string[] = [];
    const re = /<script>([\s\S]*?)<\/script>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        bodies.push(m[1]);
    }
    return bodies;
}

describe('HiddenPGPWebView inline JavaScript syntax (APP-SEC-010)', () => {
    const html = extractPgpHtmlTemplate(source);

    it('contains inline script blocks', () => {
        const bodies = extractScriptBodies(html);
        expect(bodies.length).toBeGreaterThanOrEqual(1);
    });

    it('every inline script block parses as plain JavaScript', () => {
        const bodies = extractScriptBodies(html);
        for (const [index, body] of bodies.entries()) {
            // Reproduce what TypeScript evaluation produces from the template
            // literal: unescape template escapes (\`, \${, \\) and neutralize
            // TS-side interpolations (${openpgpScript} etc.) to inert literals.
            const unescaped = body
                .replace(/\\\\/g, '\u0000')
                .replace(/\\`/g, '`')
                .replace(/\\\$/g, '$')
                .replace(/\u0000/g, '\\');
            const neutralized = unescaped.replace(/\$\{[^}]*\}/g, '0');
            expect(
                () => new Function(neutralized),
                `script block #${index} must parse as plain JS`,
            ).not.toThrow();
        }
    });

    it('does not contain TypeScript cast syntax that would break the WebView', () => {
        const bodies = extractScriptBodies(html).join('\n');
        expect(bodies).not.toMatch(/\bas\s+\{?\s*(unknown|string|number|boolean|object|Error)\b/);
        expect(bodies).not.toMatch(/\bas\s+const\b/);
    });
});
