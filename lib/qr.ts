import qrcode from "qrcode-generator";

// Payload embedded in every QR code. The pass type travels inside the code
// itself so a scanned code is self-describing even before any DB lookup.
export interface QrPayload {
  v: 1;
  t: string; // check-in token
  p: string; // pass type name
  n: string; // participant name
}

export function encodePayload(p: QrPayload): string {
  return JSON.stringify(p);
}

export function decodePayload(text: string): QrPayload | null {
  try {
    const obj = JSON.parse(text);
    if (obj && obj.v === 1 && typeof obj.t === "string" && typeof obj.p === "string") {
      return { v: 1, t: obj.t, p: obj.p, n: typeof obj.n === "string" ? obj.n : "" };
    }
    return null;
  } catch {
    return null;
  }
}

// --- minimal PNG encoder (RGBA, filter 0, zlib via CompressionStream) ---

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(4 + 4 + data.length + 4);
  out.set(u32(data.length), 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  out.set(u32(crc32(crcInput)), 8 + data.length);
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

export async function qrPng(text: string, scale = 8, border = 4): Promise<Uint8Array> {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const modules = qr.getModuleCount();
  const dim = (modules + border * 2) * scale;

  const stride = dim * 4 + 1;
  const raw = new Uint8Array(stride * dim);
  // white background
  for (let y = 0; y < dim; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < dim; x++) {
      const o = rowStart + 1 + x * 4;
      raw[o] = 255; raw[o + 1] = 255; raw[o + 2] = 255; raw[o + 3] = 255;
    }
  }
  // dark modules
  for (let my = 0; my < modules; my++) {
    for (let mx = 0; mx < modules; mx++) {
      if (!qr.isDark(my, mx)) continue;
      for (let dy = 0; dy < scale; dy++) {
        const y = (my + border) * scale + dy;
        const rowStart = y * stride;
        for (let dx = 0; dx < scale; dx++) {
          const x = (mx + border) * scale + dx;
          const o = rowStart + 1 + x * 4;
          raw[o] = 17; raw[o + 1] = 17; raw[o + 2] = 17; raw[o + 3] = 255;
        }
      }
    }
  }

  const ihdr = new Uint8Array(13);
  ihdr.set(u32(dim), 0);
  ihdr.set(u32(dim), 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const idat = await deflate(raw);
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = new Uint8Array(
    sig.length + (12 + 13) + (12 + idat.length) + 12
  );
  let off = 0;
  png.set(sig, off); off += sig.length;
  const ihdrChunk = chunk("IHDR", ihdr);
  png.set(ihdrChunk, off); off += ihdrChunk.length;
  const idatChunk = chunk("IDAT", idat);
  png.set(idatChunk, off); off += idatChunk.length;
  png.set(chunk("IEND", new Uint8Array(0)), off);
  return png;
}
