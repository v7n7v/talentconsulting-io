/** Clean text exports. Filename/title metadata never adds content to the document. */
import { Document, Paragraph, TextRun, Packer } from 'docx';
export type ExportFormat = 'docx' | 'txt';
interface ExportOptions { title?: string; author?: string; format: ExportFormat }

export async function exportDocument(text: string, options: ExportOptions): Promise<{ blob: Blob; filename: string }> {
  const safeTitle = (options.title || 'document').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').toLowerCase().slice(0, 50) || 'document';
  const filename = `${safeTitle}_${new Date().toISOString().split('T')[0]}.${options.format}`;
  if (options.format === 'txt') return { blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), filename };
  // Keep literal list markers and empty lines. This preserves text, not imported layout.
  const document = new Document({
    creator: options.author || 'Taco', title: options.title || 'Writing document',
    sections: [{ children: text.split(/\r\n|\n|\r/).map(line => new Paragraph({
      children: [new TextRun({ text: line, size: 24, font: 'Calibri' })],
      spacing: { after: 0, line: 300 },
    })) }],
  });
  const buffer = await Packer.toBuffer(document);
  return { blob: new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), filename };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  URL.revokeObjectURL(url);
}
