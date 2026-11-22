import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Preload the same optimized candidate that the first hero <picture> displays.
// Resolve it from the home config, not a hardcoded filename.
function flowieHeroPreload() {
  return {
    name: 'flowie-hero-preload',
    apply: 'build',
    transformIndexHtml(html) {
      const home = JSON.parse(readFileSync(new URL('./public/config/home.json', import.meta.url), 'utf8'))
      const image = home.heroSlides?.find(slide => slide.image && !slide.video)?.image
      const placeholder = '<!-- FLOWIE_HERO_PRELOAD -->'
      if (!/^\/hero\/[a-z0-9_./-]+\.(?:jpe?g|png|webp)$/i.test(image || '')) {
        return html.replace(placeholder, '')
      }
      const revision = process.env.VITE_BUILD_SHA ? '?v=' + encodeURIComponent(process.env.VITE_BUILD_SHA) : ''
      const srcset = [320, 640, 1280, 1920]
        .map(width => image + '@' + width + '.avif' + revision + ' ' + width + 'w').join(', ')
      const markup = '<link rel="preload" as="image" type="image/avif" href="' +
        image + '@1280.avif' + revision + '" imagesrcset="' + srcset +
        '" imagesizes="100vw" fetchpriority="high" />'
      return html.replace(placeholder, markup)
    },
  }
}

export default defineConfig({
  plugins: [react(), flowieHeroPreload()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
