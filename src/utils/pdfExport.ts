import jsPDF from 'jspdf';
import { toPng } from 'html-to-image';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

export const generatePDF = async (
  containerId: string,
  filename: string,
  onProgress?: (p: number) => void
) => {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('PDF container not found');
    return;
  }

  const pages = container.querySelectorAll('.pdf-page');
  if (pages.length === 0) {
    console.error('No pages found in container');
    return;
  }

  const previous = {
    display: container.style.display,
    opacity: container.style.opacity,
    position: container.style.position,
    left: container.style.left,
    top: container.style.top,
    pointerEvents: container.style.pointerEvents,
    zIndex: container.style.zIndex,
  };

  // Bring off-screen / invisible report into a capturable state
  container.style.display = 'block';
  container.style.opacity = '1';
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '-1';

  // Allow fonts / images / layout to settle before rasterising
  await document.fonts.ready;
  const imgs = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          // Safety timeout so a blocked Rightmove image can't hang export
          setTimeout(done, 4000);
        })
    )
  );
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  try {
    for (let i = 0; i < pages.length; i++) {
      if (i > 0) pdf.addPage();
      const pageEl = pages[i] as HTMLElement;

      const dataUrl = await toPng(pageEl, {
        quality: 1,
        pixelRatio: 2.5,
        backgroundColor: '#ffffff',
        cacheBust: true,
        style: {
          opacity: '1',
          transform: 'none',
        },
      });

      // Fit full page into A4 without overflow or letterboxing stretch
      pdf.addImage(dataUrl, 'PNG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, 'FAST');

      if (onProgress) onProgress(Math.round(((i + 1) / pages.length) * 100));
    }

    const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(safeName);
  } finally {
    container.style.display = previous.display;
    container.style.opacity = previous.opacity;
    container.style.position = previous.position;
    container.style.left = previous.left;
    container.style.top = previous.top;
    container.style.pointerEvents = previous.pointerEvents;
    container.style.zIndex = previous.zIndex;
  }
};
