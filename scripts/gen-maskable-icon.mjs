/**
 * Generates public/icons/icon-512-maskable.png — the app icon at 80% of
 * the canvas (≈410px) centered on the brand background color (#1e3a8a).
 *
 * The original icon is expected at public/icons/icon-512.png.
 * Run: node scripts/gen-maskable-icon.mjs
 */
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const SIZE = 512
const ICON_SIZE = Math.round(SIZE * 0.8) // 410px — safe zone for maskable icons
const OFFSET = Math.round((SIZE - ICON_SIZE) / 2)
const BG_COLOR = { r: 30, g: 58, b: 138, alpha: 1 } // #1e3a8a — brand dark blue

const src  = path.join(root, 'public', 'icons', 'icon-512.png')
const dest = path.join(root, 'public', 'icons', 'icon-512-maskable.png')

const icon = await sharp(src)
  .resize(ICON_SIZE, ICON_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer()

await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: BG_COLOR },
})
  .composite([{ input: icon, top: OFFSET, left: OFFSET }])
  .png()
  .toFile(dest)

console.log(`✓ ${dest}`)
