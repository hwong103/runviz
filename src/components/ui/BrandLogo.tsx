import { useState } from 'react';
import { getBrandFallbackEmoji, getBrandLogoUrl } from '../../services/logoService';
import { useTheme } from '../../hooks/useTheme';

interface BrandLogoProps {
    brandName?: string;
    className?: string;
    fallbackMode?: 'emoji' | 'none';
    size?: number;
    theme?: 'light' | 'dark';
}

export function BrandLogo({
    brandName,
    className,
    fallbackMode = 'emoji',
    size = 48,
    theme,
}: BrandLogoProps) {
    const { resolved } = useTheme();
    const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
    const logoUrl = getBrandLogoUrl(brandName, size, theme ?? resolved);

    if (!logoUrl || failedLogoUrl === logoUrl) {
        if (fallbackMode === 'none') return null;

        return (
            <span className={['inline-flex items-center justify-center rounded-md bg-white/5 text-[10px] font-black leading-none text-[var(--rv-text-faint)]', className].filter(Boolean).join(' ')}>
                {getBrandFallbackEmoji(brandName)}
            </span>
        );
    }

    return (
        <img
            src={logoUrl}
            alt={brandName || 'Brand'}
            className={['block object-contain', className].filter(Boolean).join(' ')}
            onError={() => setFailedLogoUrl(logoUrl)}
        />
    );
}
