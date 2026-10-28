import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Référencement de l'instance publique, activé par SITE_URL (workflow GitHub Pages). Sans lui
// (build local, auto-hébergement), rien n'est ajouté : une copie privée n'a pas à se présenter
// aux moteurs comme l'originale — le .htaccess fourni désactive d'ailleurs l'indexation.
const siteUrl = process.env.SITE_URL?.replace(/\/?$/, '/');

function referencement() {
  const description =
    'Quittances de loyer et reçus de dépôt de garantie en PDF, conformes à la loi : gratuit, sans compte ni cloud, vos données restent dans votre navigateur.';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Easy Quittance',
    description,
    url: siteUrl,
    sameAs: 'https://github.com/stephanfo/easy-quittance',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    isAccessibleForFree: true,
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    // Même @id que sur le site de l'auteur : les moteurs relient ses projets à une seule personne.
    author: { '@type': 'Person', '@id': 'https://stephane.ratelet.fr/#me', name: 'Stéphane Ratelet', url: 'https://stephane.ratelet.fr/' },
  };
  const meta = (property, content) => ({ tag: 'meta', attrs: { property, content }, injectTo: 'head' });
  return {
    name: 'referencement',
    apply: 'build',
    transformIndexHtml() {
      if (!siteUrl) return [];
      return [
        { tag: 'link', attrs: { rel: 'canonical', href: siteUrl }, injectTo: 'head' },
        meta('og:type', 'website'),
        meta('og:url', siteUrl),
        meta('og:title', 'Easy Quittance — quittances de loyer gratuites'),
        meta('og:description', description),
        meta('og:image', `${siteUrl}pwa-512x512.png`),
        meta('og:locale', 'fr_FR'),
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary' }, injectTo: 'head' },
        { tag: 'script', attrs: { type: 'application/ld+json' }, children: JSON.stringify(jsonLd), injectTo: 'head' },
      ];
    },
    generateBundle() {
      if (!siteUrl) return;
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n` });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteUrl}</loc></url></urlset>\n`,
      });
    },
  };
}

export default defineConfig({
  root: 'src',
  base: './',
  publicDir: resolve(__dirname, 'public'),
  plugins: [
    referencement(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      strategies: 'generateSW',
      manifest: {
        name: 'Quittances & Dépôt de garantie',
        short_name: 'Quittance',
        description: 'Générateur de quittances de loyer et de reçus de dépôt de garantie, local-first, gratuit, open-source.',
        lang: 'fr',
        theme_color: '#0071e3',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        categories: ['productivity', 'finance', 'business'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Générer une quittance',
            short_name: 'Quittance',
            description: 'Créer une nouvelle quittance de loyer',
            url: './?tab=generate',
          },
          {
            name: 'Historique',
            short_name: 'Historique',
            description: 'Consulter les documents émis',
            url: './?tab=historique',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,ttf,woff2}'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/index.html'),
    },
  },
});
