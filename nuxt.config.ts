export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // NUXT_PUBLIC_WS_URL (build time) overrides the game server URL; empty = same origin in production, :8787 in dev
  runtimeConfig: { public: { wsUrl: '' } },
  modules: [
    '@nuxt/eslint'
  ],
  nitro: {
    preset: 'cloudflare-durable',
    experimental: { websocket: true },
    externals: { inline: [/[\\/]shared[\\/]/] }
  }
})
