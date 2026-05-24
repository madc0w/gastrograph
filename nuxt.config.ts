// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: '2025-07-15',
	devtools: { enabled: true },
	nitro: {
		preset: 'node-server',
	},
	runtimeConfig: {
		mongodbUri: process.env.MONGODB_URI,
		mongodbDb: process.env.MONGODB_DB || 'gastrograph',
	},
});
