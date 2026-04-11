import { useMemo } from 'react';

import type { Plugin } from 'chart.js';
import { Bar } from 'react-chartjs-2';

export function RankChart({
    labels,
    data,
    highlightBin,
    rankLabel,
    barColor,
    barBorder,
    badgeColor,
    tickColor,
}: {
    labels: Array<string | number>;
    data: number[];
    highlightBin: number;
    rankLabel: string;
    barColor: string;
    barBorder: string;
    badgeColor: string;
    tickColor: string;
}) {
    const badgePlugin = useMemo<Plugin<'bar'>>(() => ({
        id: 'rankBadge',
        afterDraw(chart) {
            const meta = chart.getDatasetMeta(0);
            const bar = meta.data[highlightBin];
            if (!bar) return;

            const { ctx } = chart;
            const x = bar.x;
            const y = bar.y - 8;
            const fontSize = 12;
            const paddingH = 10;
            const paddingV = 5;

            ctx.save();
            ctx.font = `600 ${fontSize}px sans-serif`;

            const textWidth = ctx.measureText(rankLabel).width;
            const rectW = textWidth + paddingH * 2;
            const rectH = fontSize + paddingV * 2;
            const rectX = x - rectW / 2;
            const rectY = y - rectH;
            const radius = rectH / 2;

            ctx.beginPath();
            ctx.moveTo(rectX + radius, rectY);
            ctx.lineTo(rectX + rectW - radius, rectY);
            ctx.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + radius);
            ctx.lineTo(rectX + rectW, rectY + rectH - radius);
            ctx.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - radius, rectY + rectH);
            ctx.lineTo(rectX + radius, rectY + rectH);
            ctx.quadraticCurveTo(rectX, rectY + rectH, rectX, rectY + rectH - radius);
            ctx.lineTo(rectX, rectY + radius);
            ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
            ctx.closePath();

            ctx.strokeStyle = badgeColor.replace('rgb(', 'rgba(').replace(')', ', 0.3)');
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = badgeColor.replace('rgb(', 'rgba(').replace(')', ', 0.12)');
            ctx.fill();

            ctx.fillStyle = badgeColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(rankLabel, x, rectY + rectH / 2);
            ctx.restore();
        },
    }), [badgeColor, highlightBin, rankLabel]);

    const chartKey = useMemo(
        () => [
            labels.join('|'),
            data.join('|'),
            highlightBin,
            rankLabel,
            barColor,
            barBorder,
            badgeColor,
            tickColor,
        ].join('::'),
        [badgeColor, barBorder, barColor, data, highlightBin, labels, rankLabel, tickColor]
    );

    return (
        <Bar
            key={chartKey}
            redraw
            data={{
                labels,
                datasets: [{
                    data,
                    backgroundColor: barColor,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: barBorder,
                }],
            }}
            options={{
                maintainAspectRatio: false,
                layout: { padding: { top: 36, left: 10, right: 10, bottom: 0 } },
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: {
                    y: { display: false },
                    x: {
                        display: true,
                        ticks: { color: tickColor, font: { size: 9, weight: 'bold' } },
                        grid: { display: false },
                        border: { display: false },
                    },
                },
            }}
            plugins={[badgePlugin]}
        />
    );
}
