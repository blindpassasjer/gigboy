import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const svgPath = path.join(publicDir, 'favicon.svg');

// Icon sizes to generate
const sizes = [
  { size: 192, name: 'pwa-192.png' },
  { size: 512, name: 'pwa-512.png' },
  { size: 512, name: 'pwa-maskable-512.png' }, // Will be the same but meant for maskable
];

async function generateIcons() {
  try {
    console.log('Starting icon generation...');
    
    for (const { size, name } of sizes) {
      const outputPath = path.join(publicDir, name);
      console.log(`Generating ${name} (${size}x${size})...`);
      
      await sharp(svgPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png({ quality: 100 })
        .toFile(outputPath);
      
      console.log(`✓ Created ${name}`);
    }

    // Also create an apple-touch-icon (180x180)
    const applePath = path.join(publicDir, 'apple-touch-icon.png');
    console.log('Generating apple-touch-icon.png (180x180)...');
    await sharp(svgPath)
      .resize(180, 180, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png({ quality: 100 })
      .toFile(applePath);
    console.log('✓ Created apple-touch-icon.png');

    console.log('\n✅ All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
