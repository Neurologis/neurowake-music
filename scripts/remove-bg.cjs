/**
 * Supprime le fond blanc/quasi-blanc des PNG (tolérance 30/255)
 * et optimise logoappli.png à 400px max.
 */
const path = require('path');
const fs   = require('fs');

// Charger sharp depuis son chemin exact dans .pnpm
const sharpPath = path.resolve(
  __dirname,
  '../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp'
);
const sharp = require(sharpPath);

const PUBLIC = path.resolve(__dirname, '../public');
const TOLERANCE = 30; // seuil blanc : R,G,B > 255-30 = 225

async function removeWhiteBg(filePath, resizeWidth) {
  const img = sharp(filePath).ensureAlpha(); // force canal alpha

  const { data, info } = await img
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info; // channels = 4 (RGBA)
  const pixels = new Uint8Array(data);

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    // Si le pixel est blanc ou quasi-blanc → transparent
    if (r >= 255 - TOLERANCE && g >= 255 - TOLERANCE && b >= 255 - TOLERANCE) {
      pixels[i + 3] = 0; // alpha = 0
    }
  }

  // Reconstruction depuis le buffer raw modifié
  let pipeline = sharp(Buffer.from(pixels), {
    raw: { width, height, channels: 4 },
  });

  // Redimensionner uniquement si resizeWidth est fourni
  if (resizeWidth) {
    pipeline = pipeline.resize({
      width:             resizeWidth,
      withoutEnlargement: true,
      kernel:            sharp.kernel.lanczos3,
    });
  }

  await pipeline
    .png({ quality: 100, compressionLevel: 6 })
    .toFile(filePath + '.tmp');

  // Remplacer l'original par le fichier temporaire
  fs.renameSync(filePath + '.tmp', filePath);

  const sizeKo = Math.round(fs.statSync(filePath).size / 1024);
  console.log(`✅ ${path.basename(filePath)} → ${sizeKo} Ko`);
}

(async () => {
  try {
    await removeWhiteBg(path.join(PUBLIC, 'logoappli.png'), 400);
    await removeWhiteBg(path.join(PUBLIC, 'Matin.png'),     null);
    await removeWhiteBg(path.join(PUBLIC, 'Repas.png'),     null);
    console.log('\n🎉 Tous les PNG ont été traités.');
  } catch (err) {
    console.error('❌ Erreur :', err.message);
    process.exit(1);
  }
})();
