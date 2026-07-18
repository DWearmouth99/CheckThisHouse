import jsPDF from 'jspdf';
import { toPng } from 'html-to-image';

export const generatePDF = async (containerId: string, filename: string, onProgress?: (p: number) => void) => {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error("PDF container not found");
    return;
  }

  // Temporarily move the container into view if needed, but usually absolute positioning off-screen works.
  container.style.display = 'block';

  const pages = container.querySelectorAll('.pdf-page');
  if (pages.length === 0) {
    console.error("No pages found in container");
    return;
  }

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const pageEl = pages[i] as HTMLElement;
    
    const dataUrl = await toPng(pageEl, {
      quality: 1,
      pixelRatio: 2,
      backgroundColor: '#ffffff'
    });

    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const imgWidth = pdfWidth;
    const imgHeight = (img.height * imgWidth) / img.width;
    
    pdf.addImage(dataUrl, 'PNG', 0, 0, imgWidth, imgHeight);
    
    if (onProgress) onProgress(Math.round(((i + 1) / pages.length) * 100));
  }

  pdf.save(filename);
};
