import { ENV } from '../../config/env';

export function buildApiUrl(endpoint: string): string {
    const base = ENV.apiBaseUrl.replace(/\/+$/, '');
    const version = ENV.apiVersion.replace(/^\/+|\/+$/g, '');
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    return `${base}/${version}/${cleanEndpoint}`;
}
