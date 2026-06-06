// Generador de PDF mínimo y SIN dependencias externas.
// Produce un PDF de varias páginas (tamaño Carta) con título, encabezados y párrafos,
// usando las fuentes estándar Helvetica / Helvetica-Bold con codificación WinAnsi
// (compatible con acentos del español: á é í ó ú ñ ¿ ¡ ü).

const content = require('./legal.content');

// --- Geometría de página (puntos: 1 pulgada = 72 pt) ---
const PAGE_W = 612;   // Carta 8.5"
const PAGE_H = 792;   // Carta 11"
const MARGIN_L = 56;
const MARGIN_R = 56;
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 56;
const USABLE_W = PAGE_W - MARGIN_L - MARGIN_R;

// Reemplaza caracteres fuera de WinAnsi/latin1 por equivalentes seguros
// (guiones largos, comillas tipográficas, puntos suspensivos, etc.).
function sanitize(s) {
  return String(s)
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x00-\xFF]/g, '');
}

// Escapa los caracteres especiales de una cadena literal PDF.
function esc(s) {
  return sanitize(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// Ancho aproximado de una cadena en puntos (factor medio de Helvetica).
function approxWidth(text, size, bold) {
  return text.length * size * (bold ? 0.56 : 0.52);
}

// Divide un párrafo en líneas que caben en el ancho útil.
function wrap(text, size, bold) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (approxWidth(test, size, bold) > USABLE_W && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// Construye la lista de "líneas" a dibujar a partir de los bloques del documento.
// Cada línea: { text, font: 'F1'|'F2', size, gapBefore }
function layout(doc) {
  const lines = [];
  // Título
  for (const l of wrap(doc.title, 18, true)) lines.push({ text: l, font: 'F2', size: 18, gapBefore: 0 });
  // Versión y fecha
  lines.push({ text: `Versión ${content.VERSION} - Vigente desde el ${content.EFFECTIVE_DATE}`, font: 'F1', size: 10, gapBefore: 10 });
  // Secciones
  for (const sec of doc.sections) {
    for (const l of wrap(sec.h, 12.5, true)) lines.push({ text: l, font: 'F2', size: 12.5, gapBefore: 16 });
    for (const para of sec.p) {
      const wrapped = wrap(para, 10.5, false);
      wrapped.forEach((l, i) => lines.push({ text: l, font: 'F1', size: 10.5, gapBefore: i === 0 ? 7 : 1.5 }));
    }
  }
  return lines;
}

// Reparte las líneas en páginas y genera el flujo de contenido de cada una.
function paginate(lines) {
  const pages = [];
  let stream = '';
  let y = PAGE_H - MARGIN_TOP;
  const flush = () => { if (stream) { pages.push(stream); stream = ''; } };

  for (const ln of lines) {
    const lineHeight = ln.size * 1.32;
    y -= ln.gapBefore;
    if (y - lineHeight < MARGIN_BOTTOM) {
      flush();
      y = PAGE_H - MARGIN_TOP;
    }
    y -= lineHeight;
    stream += `BT /${ln.font} ${ln.size} Tf 1 0 0 1 ${MARGIN_L.toFixed(2)} ${y.toFixed(2)} Tm (${esc(ln.text)}) Tj ET\n`;
  }
  flush();
  return pages.length ? pages : [''];
}

// Ensambla un PDF válido (objetos indirectos + tabla xref) a partir de los flujos de página.
function assemble(pageStreams) {
  const objects = []; // cada entrada: Buffer con el cuerpo del objeto (sin "n 0 obj")
  const add = (buf) => { objects.push(Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'latin1')); return objects.length; };

  // Reservamos numeración: 1=Catalog, 2=Pages, 3=Helvetica, 4=Helvetica-Bold,
  // luego por cada página: objeto Página y objeto Contenido.
  const catalogNo = 1, pagesNo = 2, fontNo = 3, fontBoldNo = 4;
  const firstPageObj = 5;
  const pageNos = [];
  for (let i = 0; i < pageStreams.length; i++) pageNos.push(firstPageObj + i * 2);

  // 1) Catalog
  add(`<< /Type /Catalog /Pages ${pagesNo} 0 R >>`);
  // 2) Pages
  add(`<< /Type /Pages /Count ${pageStreams.length} /Kids [${pageNos.map((n) => `${n} 0 R`).join(' ')}] >>`);
  // 3) Fuente Helvetica (F1)
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  // 4) Fuente Helvetica-Bold (F2)
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  // 5..) Páginas y sus contenidos
  for (let i = 0; i < pageStreams.length; i++) {
    const pageNo = firstPageObj + i * 2;
    const contentNo = pageNo + 1;
    add(
      `<< /Type /Page /Parent ${pagesNo} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${fontNo} 0 R /F2 ${fontBoldNo} 0 R >> >> ` +
      `/Contents ${contentNo} 0 R >>`
    );
    const data = Buffer.from(pageStreams[i], 'latin1');
    const head = Buffer.from(`<< /Length ${data.length} >>\nstream\n`, 'latin1');
    const tail = Buffer.from('\nendstream', 'latin1');
    add(Buffer.concat([head, data, tail]));
  }

  // Serialización con cálculo de offsets para la tabla xref.
  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1');
  const chunks = [header];
  let offset = header.length;
  const offsets = [];
  objects.forEach((body, idx) => {
    const objHead = Buffer.from(`${idx + 1} 0 obj\n`, 'latin1');
    const objTail = Buffer.from('\nendobj\n', 'latin1');
    const full = Buffer.concat([objHead, body, objTail]);
    offsets[idx] = offset;
    chunks.push(full);
    offset += full.length;
  });

  const xrefStart = offset;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (let i = 0; i < objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNo} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));

  return Buffer.concat(chunks);
}

function renderPdf(doc) {
  return assemble(paginate(layout(doc)));
}

const buildTermsPdf = () => renderPdf(content.terms);
const buildPrivacyPdf = () => renderPdf(content.privacy);

module.exports = { renderPdf, buildTermsPdf, buildPrivacyPdf };
