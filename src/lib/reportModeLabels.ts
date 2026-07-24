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

export function modeLabels(mode: ReportMode, hasLiveAsking = true): ModeLabels {
  const sold = mode === 'recently_sold';
  const estimated = !sold && !hasLiveAsking;
  return {
    chartBaseCaption: (baseFormatted) =>
      sold
        ? `Base: last sold price (${baseFormatted})`
        : estimated
          ? `Base estimated value ${baseFormatted}`
          : `Base asking ${baseFormatted}`,
    fairPriceBoxTitle: sold
      ? 'Was the sale price fair?'
      : estimated
        ? 'Is the estimated value fair?'
        : 'Is the asking price fair?',
    priceCoverLabel: sold
      ? 'Last Sold Price'
      : estimated
        ? 'Estimated value'
        : 'Asking price',
  };
}
