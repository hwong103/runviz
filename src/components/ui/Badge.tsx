import type { ReactNode } from 'react';

type BadgeTone = 'neutral' | 'blue' | 'gold' | 'emerald' | 'sky' | 'orange' | 'rose' | 'strava';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
    children: ReactNode;
    className?: string;
    tone?: BadgeTone;
    size?: BadgeSize;
    icon?: ReactNode;
}

export function Badge({
    children,
    className,
    tone = 'neutral',
    size = 'sm',
    icon,
}: BadgeProps) {
    const classes = [
        'rv-badge',
        size === 'md' ? 'rv-badge-md' : 'rv-badge-sm',
        `rv-badge-${tone}`,
        className,
    ].filter(Boolean).join(' ');

    return (
        <span className={classes}>
            {icon}
            <span>{children}</span>
        </span>
    );
}
