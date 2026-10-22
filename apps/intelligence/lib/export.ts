/** Client-side CSV/PDF generation for the demo export adapter. Values carry units and a snapshot header. */
export function toCsv(rows: string[][], comments: string[] = []): string {
  const escape = (cell: string) => (/[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return [...comments, ...rows.map((row) => row.map(escape).join(","))].join("\r\n") + "\r\n";
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadCsv(filename: string, rows: string[][], comments: string[] = []): void {
  downloadBlob(filename, new Blob([toCsv(rows, comments)], { type: "text/csv;charset=utf-8" }));
}

/** Minimal single-page text PDF (Helvetica) so summaries export without a runtime dependency. */
export function makePdf(title: string, lines: string[]): Blob {
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E]/g, (c) => (c === "₹" ? "Rs " : c === "·" || c === "/" ? c : "?"));
  const content = [`BT /F1 16 Tf 50 790 Td (${esc(title)}) Tj ET`, ...lines.slice(0, 52).map((line, i) => `BT /F1 10 Tf 50 ${765 - i * 14} Td (${esc(line)}) Tj ET`)].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([body], { type: "application/pdf" });
}
