/**
 * Logo.dev Integration Service
 * 
 * Fetches brand logos for shoe manufacturers using Logo.dev API.
 * Falls back to emojis if logos can't be loaded.
 */

// Logo.dev publishable key
const LOGO_DEV_TOKEN = 'pk_YOjQY2c3QbS2MH1RiYG5Jw';

// Brand name to domain mapping
const BRAND_DOMAINS: Record<string, string> = {
    'hoka': 'hoka.com',
    'nike': 'nike.com',
    'adidas': 'adidas.com',
    'saucony': 'saucony.com',
    'brooks': 'brooksrunning.com',
    'asics': 'asics.com',
    'new balance': 'newbalance.com',
    'on': 'on.com', // On Running
    'mizuno': 'mizuno.com',
    'altra': 'altrarunning.com',
    'salomon': 'salomon.com',
    'puma': 'puma.com',
    'reebok': 'reebok.com',
    'under armour': 'underarmour.com',
};

// Fallback emojis for brands (used when logo fails to load)
const BRAND_FALLBACK_EMOJIS: Record<string, string> = {
    'hoka': '🦅',
    'nike': '✔️',
    'adidas': '👟',
    'saucony': '🏃',
    'brooks': '🧢',
    'asics': '🌀',
    'new balance': 'NB',
    'on': '⭕',
    'mizuno': '🌊',
    'altra': '🏔️',
    'salomon': '⛰️',
    'puma': '🐆',
    'reebok': '💪',
    'under armour': '🛡️',
};

/**
 * Normalize brand name for lookup
 */
function normalizeBrandName(brandName: string): string {
    return brandName.toLowerCase().trim();
}

/**
 * Find matching brand key from brand name
 */
function findBrandKey(brandName: string): string | null {
    const normalized = normalizeBrandName(brandName);

    // Direct match
    if (BRAND_DOMAINS[normalized]) {
        return normalized;
    }

    // Partial match (e.g., "HOKA ONE ONE" matches "hoka")
    for (const key of Object.keys(BRAND_DOMAINS)) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return key;
        }
    }

    return null;
}

/**
 * Get Logo.dev URL for a brand
 */
export function getBrandLogoUrl(brandName?: string, size: number = 64): string | null {
    if (!brandName) return null;

    const brandKey = findBrandKey(brandName);
    if (!brandKey) return null;

    const domain = BRAND_DOMAINS[brandKey];
    if (!domain) return null;

    // Using domain lookup for more reliable logos
    return `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&format=png&size=${size}`;
}

/**
 * Get fallback emoji for a brand
 */
export function getBrandFallbackEmoji(brandName?: string): string {
    if (!brandName) return '👟';

    const brandKey = findBrandKey(brandName);
    if (!brandKey) return '👟';

    return BRAND_FALLBACK_EMOJIS[brandKey] || '👟';
}

/**
 * Check if we have logo support for a brand
 */
export function hasBrandLogo(brandName?: string): boolean {
    if (!brandName) return false;
    return findBrandKey(brandName) !== null;
}
