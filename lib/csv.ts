// Small CSV parser: handles quoted fields, embedded commas/newlines, CRLF.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

const NAME_HEADERS = ["name", "full name", "fullname", "participant", "participant name"];
const EMAIL_HEADERS = ["email", "email id", "emailid", "e-mail", "mail", "participant email"];
const PASS_HEADERS = ["pass", "pass type", "passtype", "type", "ticket", "ticket type", "pass_type", "pass name"];

export interface CsvParticipantRow {
  rowNumber: number; // 1-based, counting the header row
  name: string;
  email: string;
  pass: string;
}

export function parseParticipantCsv(text: string):
  | { ok: true; rows: CsvParticipantRow[] }
  | { ok: false; error: string } {
  const grid = parseCsv(text);
  if (grid.length === 0) return { ok: false, error: "The CSV file is empty." };
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.findIndex((h) => NAME_HEADERS.includes(h));
  const emailIdx = header.findIndex((h) => EMAIL_HEADERS.includes(h));
  const passIdx = header.findIndex((h) => PASS_HEADERS.includes(h));
  if (nameIdx === -1 || emailIdx === -1 || passIdx === -1) {
    return {
      ok: false,
      error: `Header row must contain name, email and pass columns (found: ${grid[0].join(", ")}).`,
    };
  }
  const rows: CsvParticipantRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    const name = (cells[nameIdx] ?? "").trim();
    const email = (cells[emailIdx] ?? "").trim();
    const pass = (cells[passIdx] ?? "").trim();
    if (!name && !email && !pass) continue; // skip blank lines
    rows.push({ rowNumber: r + 1, name, email, pass });
  }
  return { ok: true, rows };
}
