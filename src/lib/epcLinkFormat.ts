/**
 * EPC certificate URL presentation (P7).
 */

export function shortenEpcCertificateUrl(url: string): string {
  const m = String(url).match(/energy-certificate\/([A-Za-z0-9-]+)/i);
  if (m) return `gov.uk EPC certificate ${m[1]}`;
  return 'gov.uk EPC certificate';
}

/** Replace full find-energy-certificate URLs in prose with short labels. */
export function scrubEpcUrlsInText(text: string): string {
  return String(text || '')
    .replace(
      /https?:\/\/find-energy-certificate\.service\.gov\.uk\/energy-certificate\/([A-Za-z0-9-]+)/gi,
      (_full, id: string) => `gov.uk EPC certificate ${id}`
    )
    .replace(
      /https?:\/\/find-energy-certificate\.service\.gov\.uk\/?/gi,
      'gov.uk Find an energy certificate'
    );
}

export function epcCertificateLinkLabel(): string {
  return 'View EPC certificate on gov.uk';
}
