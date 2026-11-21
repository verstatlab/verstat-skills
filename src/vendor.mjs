import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasOwn } from './jsonschema.mjs';

export function readVendorManifest(vendorDir) {
  const file = join(vendorDir, 'vendor.json');
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function readChecksums(vendorDir) {
  const file = join(vendorDir, 'SHA256SUMS');
  const sums = new Map();
  if (!existsSync(file)) return sums;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{64}) [ *](.+)$/);
    if (m) sums.set(m[2], m[1]);
  }
  return sums;
}

function verifiedBytes(vendorDir, sums, rel) {
  const file = join(vendorDir, rel);
  if (!existsSync(file)) throw new Error(`vendor file ${rel} is missing`);
  const data = readFileSync(file);
  const expected = sums.get(rel);
  if (!expected) throw new Error(`vendor file ${rel} has no checksum in vendor/SHA256SUMS`);
  const actual = createHash('sha256').update(data).digest('hex');
  if (actual !== expected) throw new Error(`vendor file ${rel} does not match its checksum in vendor/SHA256SUMS`);
  return data;
}

function verifiedFile(vendorDir, sums, rel) {
  return verifiedBytes(vendorDir, sums, rel).toString('utf8');
}

export function loadVendorLibs(vendorDir, names) {
  const manifest = readVendorManifest(vendorDir);
  const sums = readChecksums(vendorDir);
  return names.map((name) => {
    if (!hasOwn(manifest, name)) throw new Error(`unknown vendor library "${name}" (not in vendor/vendor.json)`);
    const lib = manifest[name];
    if (lib.kind === 'font') throw new Error(`vendor entry "${name}" is a font; fonts are embedded in every page and cannot be a block dep`);
    if (!Array.isArray(lib.files) || typeof lib.license !== 'string') {
      throw new Error(`vendor library "${name}" needs "files" (an array) and "license" (a path) in vendor/vendor.json`);
    }
    const scripts = lib.files.filter((rel) => !rel.endsWith('.css'));
    const sheets = lib.files.filter((rel) => rel.endsWith('.css'));
    return {
      name,
      package: lib.package || name,
      version: lib.version,
      scripts: scripts.map((rel) => ({ file: rel, code: verifiedFile(vendorDir, sums, rel) })),
      styles: sheets.map((rel) => ({ file: rel, css: verifiedFile(vendorDir, sums, rel) })),
      license: verifiedFile(vendorDir, sums, lib.license),
    };
  });
}

export function loadVendorFonts(vendorDir) {
  const manifest = readVendorManifest(vendorDir);
  const sums = readChecksums(vendorDir);
  const fonts = [];
  for (const [name, entry] of Object.entries(manifest)) {
    if (entry.kind !== 'font') continue;
    if (!Array.isArray(entry.faces) || typeof entry.license !== 'string') {
      throw new Error(`vendor font "${name}" needs "faces" (an array) and "license" (a path) in vendor/vendor.json`);
    }
    fonts.push({
      name,
      label: entry.label || name,
      faces: entry.faces.map((face) => {
        if (!face || typeof face.file !== 'string' || typeof face.family !== 'string' || !Number.isInteger(face.weight)) {
          throw new Error(`vendor font "${name}": each face needs "file", "family" (strings) and "weight" (an integer)`);
        }
        if (face.style !== undefined && face.style !== 'normal' && face.style !== 'italic') {
          throw new Error(`vendor font "${name}": a face's "style" is "normal" or "italic"`);
        }
        return {
          family: face.family,
          weight: face.weight,
          style: face.style || 'normal',
          data: verifiedBytes(vendorDir, sums, face.file).toString('base64'),
        };
      }),
      license: verifiedFile(vendorDir, sums, entry.license),
    });
  }
  return fonts;
}
