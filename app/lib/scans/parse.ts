// Parses an RFID scan export (CSV: epc[,area][,read_at]). Uploaded files are untrusted:
// every row is validated and bad rows are reported, never silently stored.

export interface ParsedRead {
  epc: string;
  area: string | null;
  readAt: Date;
}
export interface ParseResult {
  reads: ParsedRead[];
  errors: string[];
  duplicates: number;
}

const EPC = /^[0-9A-F]{24}$/; // 96-bit EPC as hex
const MAX_ERRORS = 20;

export function parseScanCsv(text: string, fallbackTime: Date, maxRows = 100_000): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { reads: [], errors: ["File is empty"], duplicates: 0 };

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const col = { epc: header.indexOf("epc"), area: header.indexOf("area"), readAt: header.indexOf("read_at") };
  if (col.epc < 0) return { reads: [], errors: ['Missing an "epc" column in the header row'], duplicates: 0 };
  if (lines.length - 1 > maxRows) {
    return { reads: [], errors: [`Too many rows (${lines.length - 1}); the limit is ${maxRows}`], duplicates: 0 };
  }

  const reads: ParsedRead[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  const bad = (line: number, msg: string) => {
    if (errors.length < MAX_ERRORS) errors.push(`Row ${line}: ${msg}`);
  };

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const epc = (cells[col.epc] ?? "").toUpperCase();
    if (!EPC.test(epc)) {
      bad(i + 1, `"${epc.slice(0, 30)}" is not a 24-character hex EPC`);
      continue;
    }
    let readAt = fallbackTime;
    if (col.readAt >= 0 && cells[col.readAt]) {
      readAt = new Date(cells[col.readAt]);
      if (Number.isNaN(readAt.getTime())) {
        bad(i + 1, `invalid read_at "${cells[col.readAt].slice(0, 40)}"`);
        continue;
      }
    }
    // Wands read the same tag many times per pass; keep the first read.
    if (seen.has(epc)) {
      duplicates++;
      continue;
    }
    seen.add(epc);
    const area = col.area >= 0 ? cells[col.area]?.slice(0, 64) || null : null;
    reads.push({ epc, area, readAt });
  }
  return { reads, errors, duplicates };
}
