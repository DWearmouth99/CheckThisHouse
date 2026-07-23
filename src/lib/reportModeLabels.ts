/**
 * Mode-aware customer-facing labels for the PDF renderer (P6).
 * Do not string-replace the finished PDF — pick labels from this map.
 */

export type ReportMode = 'on_market' | 'recently_sold' | string;

export type ModeLabels = {
  chartBaseCaption: (baseFormatted: string) => string;
  fairPriceBoxTitle: string;
  priceCoverLabel: string;
};

export function modeLabels(mode: ReportMode): ModeLabels {
  const sold = mode === 'recently_sold';
  return {
    chartBaseCaption: (baseFormatted) =>
      sold ? `Base: last sold price (${baseFormatted})` : `Base asking ${baseFormatted}`,
    fairPriceBoxTitle: sold ? 'Was the sale price fair?' : 'Is the asking price fair?',
    priceCoverLabel: sold ? 'Last Sold Price' : 'Asking price',
  };
}
