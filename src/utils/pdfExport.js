import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function renderHtmlToPdfBlob(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '794px';
  iframe.style.height = '1123px';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();

  await new Promise((resolve) => {
    iframe.onload = resolve;
    setTimeout(resolve, 800);
  });

  const body = iframe.contentDocument.body;
  const canvas = await html2canvas(body, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    windowWidth: body.scrollWidth,
    windowHeight: body.scrollHeight,
  });

  document.body.removeChild(iframe);

  const imgWidth = 210;
  const pageHeight = 297;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;
  const imgData = canvas.toDataURL('image/png');

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  return pdf;
}

export async function downloadHtmlAsPdf(html, filename) {
  const pdf = await renderHtmlToPdfBlob(html);
  pdf.save(filename);
}
