import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'en-US',
  title: 'PiVo Ortho',
  description:
    'A local-first browser low-poly modeling, texturing and animation editor. No account, no telemetry, no cloud.',
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Tutorials', link: '/tutorials/' },
      { text: 'Guide', link: '/guide' },
      { text: 'Formats', link: '/formats' },
      { text: 'API', link: '/api' },
      {
        text: 'Verification',
        items: [
          { text: 'Overview', link: '/verification' },
          { text: 'Specification', link: '/SPECIFICATION' },
          { text: 'Module contract', link: '/CONTRACT' },
          { text: 'Coverage', link: '/COVERAGE' },
        ],
      },
      { text: 'Limitations', link: '/limitations' },
    ],
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Installation & running', link: '/getting-started' },
          { text: 'User guide', link: '/guide' },
        ],
      },
      {
        text: 'Tutorials',
        items: [
          { text: 'Overview', link: '/tutorials/' },
          { text: '1. Create your first cube model', link: '/tutorials/first-model' },
          { text: '2. Paint and adjust the cube\'s texture', link: '/tutorials/paint-cube' },
          { text: '3. Rotate the cube and export a GIF', link: '/tutorials/animate-export' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'File formats', link: '/formats' },
          { text: 'Core & IO API', link: '/api' },
        ],
      },
      {
        text: 'Project',
        items: [
          { text: 'Verification', link: '/verification' },
          { text: 'Limitations', link: '/limitations' },
          { text: 'Specification', link: '/SPECIFICATION' },
          { text: 'Module contract', link: '/CONTRACT' },
          { text: 'Coverage matrix', link: '/COVERAGE' },
          { text: 'Test report', link: '/TEST-REPORT' },
        ],
      },
    ],
    search: {
      provider: 'local',
    },
    footer: {
      message: 'PiVo Ortho is released under the MIT License.',
      copyright: 'Copyright © 2026 Bookklik Technologies',
    },
  },
})
