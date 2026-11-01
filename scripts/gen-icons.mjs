/**
 * Generates icon-192.png and icon-512.png from public/logo.svg.
 * Run: node scripts/gen-icons.mjs
 */
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const src = path.join(root, 'public', 'logo.svg')

for (const size of [192, 512]) {
  const dest = path.join(root, 'public', 'icons', `icon-${size}.png`)
  await sharp(src).resize(size, size).png().toFile(dest)
  console.log(`✓ ${dest}`)
}
