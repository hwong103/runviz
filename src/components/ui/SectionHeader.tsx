import type { ElementType, ReactNode } from 'react';

interface SectionHeaderProps {
    kicker: string;
    title: string;
    titleAs?: ElementType;
    className?: string;
    titleClassName?: string;
    action?: ReactNode;
}

export function SectionHeader({
    kicker,
    title,
    titleAs: TitleTag = 'h2',
    className,
    titleClassName,
    action,
}: SectionHeaderProps) {
    return (
        <div className={['flex flex-wrap items-center gap-3', className].filter(Boolean).join(' ')}>
            <div>
                <p className="rv-kicker mb-2">{kicker}</p>
                <TitleTag className={['rv-section-title', titleClassName].filter(Boolean).join(' ')}>
                    {title}
                </TitleTag>
            </div>
            {action ? <div className="ml-auto self-start">{action}</div> : null}
        </div>
    );
}
