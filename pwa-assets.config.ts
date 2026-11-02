import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#56745B' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#56745B' } },
  },
  images: ['public/logo.svg'],
})
