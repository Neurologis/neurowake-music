const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

const INPUT  = path.resolve(__dirname, '../public/logoappli.png');
const OUTPUT = path.resolve(__dirname, '../public/logoappli.png');

const before = fs.statSync(INPUT).size;

sharp(INPUT)
  .resize({ width: 400, withoutEnlargement: true })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer()
  .then(buf => {
    fs.writeFileSync(OUTPUT, buf);
    const after = fs.statSync(OUTPUT).size;
    console.log('✅ Logo optimisé : ' + Math.round(before/1024) + ' Ko → ' + Math.round(after/1024) + ' Ko');
  })
  .catch(err => { console.error('❌', err.message); process.exit(1); });
