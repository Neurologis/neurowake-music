import { createRequire } from 'module';
import { readFileSync, writeFileSync, statSync } from 'fs';
import { resolve } from 'path';

const require = createRequire(import.meta.url);
const sharp = require('./node_modules/sharp/lib/index.js');

const INPUT  = resolve('./public/logoappli.png');
const OUTPUT = resolve('./public/logoappli.png');

const before = statSync(INPUT).size;

const buf = await sharp(INPUT)
  .resize({ width: 400, withoutEnlargement: true })
  .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
  .toBuffer();

writeFileSync(OUTPUT, buf);

const after = statSync(OUTPUT).size;
console.log(`✅ Logo optimisé : ${(before/1024).toFixed(0)} Ko → ${(after/1024).toFixed(0)} Ko`);
