// Test-only ZIP helpers. rawStoredZip writes entry names verbatim (no
// validation), which yazl refuses to do, to simulate hostile packages.
import { createWriteStream } from "node:fs";
import { crc32 } from "node:zlib";
import yazl from "yazl";
import yauzl from "yauzl";

export async function writeZip(
  path: string,
  entries: Array<{ name: string; data: Buffer | string; compress?: boolean }>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const out = createWriteStream(path);
    out.on("close", () => resolve());
    out.on("error", reject);
    zip.outputStream.pipe(out);
    for (const e of entries) {
      const data = typeof e.data === "string" ? Buffer.from(e.data, "utf-8") : e.data;
      zip.addBuffer(data, e.name, { compress: e.compress ?? false });
    }
    zip.end();
  });
}

export function rawStoredZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf-8");
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, e.data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(e.data.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += 30 + name.length + e.data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, eocd]);
}

export async function listEntries(path: string): Promise<Array<{ fileName: string; compressionMethod: number }>> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err);
      const out: Array<{ fileName: string; compressionMethod: number }> = [];
      zip.on("entry", (e: yauzl.Entry) => {
        out.push({ fileName: e.fileName, compressionMethod: e.compressionMethod });
        zip.readEntry();
      });
      zip.on("end", () => resolve(out));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}
