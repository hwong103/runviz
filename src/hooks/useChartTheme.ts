import { useTheme } from './useTheme';

export interface ChartTheme {
    tickColor: string;
    gridColor: string;
    axisColor: string;
    tooltipBg: string;
    tooltipTitle: string;
    tooltipBody: string;
    tooltipBorder: string;
    legendColor: string;
    panelBg: string;
    panelBorder: string;
    primaryLine: string;
    primaryFill: string;
    secondaryLine: string;
    secondaryFill: string;
    tertiaryLine: string;
    tertiaryFill: string;
    accentBg: string;
    accentBorder: string;
}

const THEMES: Record<'dark' | 'light', ChartTheme> = {
    dark: {
        tickColor: 'rgba(245, 239, 227, 0.46)',
        gridColor: 'rgba(245, 239, 227, 0.06)',
        axisColor: 'rgba(245, 239, 227, 0.42)',
        tooltipBg: 'rgba(4, 23, 35, 0.94)',
        tooltipTitle: '#f5efe3',
        tooltipBody: 'rgba(245, 239, 227, 0.76)',
        tooltipBorder: 'rgba(245, 239, 227, 0.08)',
        legendColor: 'rgba(245, 239, 227, 0.64)',
        panelBg: 'rgba(0, 0, 0, 0.15)',
        panelBorder: 'rgba(255, 255, 255, 0.08)',
        primaryLine: '#13C38B',
        primaryFill: 'rgba(19, 195, 139, 0.12)',
        secondaryLine: '#FF8E2B',
        secondaryFill: 'rgba(255, 142, 43, 0.12)',
        tertiaryLine: '#D9B36A',
        tertiaryFill: 'rgba(217, 179, 106, 0.1)',
        accentBg: 'rgba(255, 255, 255, 0.04)',
        accentBorder: 'rgba(255, 255, 255, 0.08)',
    },
    light: {
        tickColor: 'rgba(26, 22, 16, 0.5)',
        gridColor: 'rgba(40, 85, 216, 0.08)',
        axisColor: 'rgba(26, 22, 16, 0.46)',
        tooltipBg: 'rgba(255, 253, 249, 0.98)',
        tooltipTitle: '#1a1610',
        tooltipBody: 'rgba(26, 22, 16, 0.74)',
        tooltipBorder: 'rgba(40, 85, 216, 0.14)',
        legendColor: 'rgba(26, 22, 16, 0.68)',
        panelBg: 'rgba(0, 0, 0, 0.04)',
        panelBorder: 'rgba(0, 0, 0, 0.1)',
        primaryLine: '#2a9970',
        primaryFill: 'rgba(42, 153, 112, 0.14)',
        secondaryLine: '#c05c1a',
        secondaryFill: 'rgba(192, 92, 26, 0.12)',
        tertiaryLine: '#2855d8',
        tertiaryFill: 'rgba(40, 85, 216, 0.11)',
        accentBg: 'rgba(0, 0, 0, 0.04)',
        accentBorder: 'rgba(0, 0, 0, 0.1)',
    },
};

export function useChartTheme(): ChartTheme {
    const { resolved } = useTheme();
    return THEMES[resolved];
}
