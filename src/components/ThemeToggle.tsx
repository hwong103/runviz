import { Monitor, Moon, SunMedium } from 'lucide-react';
import { useTheme, type ThemePreference } from '../hooks/useTheme';

const OPTIONS: Array<{ value: ThemePreference; icon: typeof SunMedium; title: string }> = [
    { value: 'light', icon: SunMedium, title: 'Light mode' },
    { value: 'dark', icon: Moon, title: 'Dark mode' },
    { value: 'system', icon: Monitor, title: 'System preference' },
];

export function ThemeToggle() {
    const { preference, setTheme } = useTheme();

    return (
        <div
            className="flex items-center gap-0.5 rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl"
            role="group"
            aria-label="Theme"
        >
            {OPTIONS.map(({ value, icon: Icon, title }) => (
                <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    aria-pressed={preference === value}
                    title={title}
                    aria-label={title}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 ${
                        preference === value
                            ? 'bg-[var(--rv-blue)] text-white shadow-[0_6px_16px_rgba(74,122,255,0.28)]'
                            : 'text-[var(--rv-text-faint)] hover:-translate-y-0.5 hover:text-[var(--rv-text)]'
                    }`}
                    style={preference === value ? { color: '#fff' } : undefined}
                >
                    <Icon className="h-4 w-4" />
                </button>
            ))}
        </div>
    );
}
