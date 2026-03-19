/**
 * Logo.dev Integration Service
 * 
 * Fetches brand logos for shoe manufacturers using Logo.dev API.
 * Falls back to short brand marks if logos can't be loaded.
 */

// Optional Logo.dev publishable key.
// If absent, logo URLs are disabled and UI falls back to brand marks.
const LOGO_DEV_TOKEN = import.meta.env.VITE_LOGO_DEV_TOKEN;

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

// Fallback brand marks (used when logo fails to load)
const BRAND_FALLBACK_MARKS: Record<string, string> = {
    'hoka': 'HK',
    'nike': 'NK',
    'adidas': 'AD',
    'saucony': 'SC',
    'brooks': 'BK',
    'asics': 'AS',
    'new balance': 'NB',
    'on': 'ON',
    'mizuno': 'MZ',
    'altra': 'AL',
    'salomon': 'SL',
    'puma': 'PM',
    'reebok': 'RB',
    'under armour': 'UA',
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
export function getBrandLogoUrl(brandName?: string, size: number = 64, theme?: 'light' | 'dark'): string | null {
    if (!LOGO_DEV_TOKEN) return null;
    if (!brandName) return null;

    const brandKey = findBrandKey(brandName);
    if (!brandKey) return null;

    const domain = BRAND_DOMAINS[brandKey];
    if (!domain) return null;

    // Using domain lookup for more reliable logos
    let url = `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&format=png&size=${size}`;
    if (theme) {
        url += `&theme=${theme}`;
    }
    return url;
}

/**
 * Get fallback brand mark for a brand
 */
export function getBrandFallbackEmoji(brandName?: string): string {
    if (!brandName) return 'RV';

    const brandKey = findBrandKey(brandName);
    if (!brandKey) {
        return brandName
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part[0]?.toUpperCase() ?? '')
            .join('') || 'RV';
    }

    return BRAND_FALLBACK_MARKS[brandKey] || 'RV';
}

/**
 * Check if we have logo support for a brand
 */
export function hasBrandLogo(brandName?: string): boolean {
    if (!brandName) return false;
    return findBrandKey(brandName) !== null;
}
