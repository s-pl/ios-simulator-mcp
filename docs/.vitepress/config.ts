import { defineConfig, type DefaultTheme } from 'vitepress';

const repository = 'https://github.com/s-pl/ios-simulator-mcp';

/** Navigation and interface texts of the Spanish edition, served at the site root. */
const spanish: DefaultTheme.Config = {
  nav: [
    { text: 'Guía', link: '/guia/instalacion', activeMatch: '^/guia/' },
    { text: 'Referencia', link: '/referencia/herramientas', activeMatch: '^/referencia/' },
    { text: 'Proyecto', link: '/proyecto/arquitectura', activeMatch: '^/proyecto/' },
  ],
  sidebar: [
    {
      text: 'Guía',
      items: [
        { text: 'Instalación', link: '/guia/instalacion' },
        { text: 'Configuración', link: '/guia/configuracion' },
        { text: 'Primeros pasos', link: '/guia/primeros-pasos' },
        { text: 'Conceptos clave', link: '/guia/conceptos' },
        { text: 'Trabajar rápido', link: '/guia/rendimiento' },
        { text: 'Limitaciones conocidas', link: '/guia/limitaciones' },
        { text: 'Solución de problemas', link: '/guia/solucion-de-problemas' },
      ],
    },
    {
      text: 'Referencia',
      items: [
        { text: 'Herramientas', link: '/referencia/herramientas' },
        { text: 'Códigos de error', link: '/referencia/errores' },
      ],
    },
    {
      text: 'Proyecto',
      items: [
        { text: 'Arquitectura', link: '/proyecto/arquitectura' },
        { text: 'Desarrollo', link: '/proyecto/desarrollo' },
      ],
    },
  ],
  editLink: { pattern: `${repository}/edit/main/docs/:path`, text: 'Editar esta página en GitHub' },
  footer: { message: 'Publicado bajo licencia MIT.', copyright: 'Copyright © 2026 Samuel Ponce Luna' },
  outline: { label: 'En esta página', level: [2, 3] },
  docFooter: { prev: 'Anterior', next: 'Siguiente' },
  lastUpdated: { text: 'Última actualización' },
  returnToTopLabel: 'Volver arriba',
  sidebarMenuLabel: 'Menú',
  darkModeSwitchLabel: 'Apariencia',
  lightModeSwitchTitle: 'Cambiar a modo claro',
  darkModeSwitchTitle: 'Cambiar a modo oscuro',
  langMenuLabel: 'Cambiar idioma',
};

/** Navigation of the English edition, served under /en/. */
const english: DefaultTheme.Config = {
  nav: [
    { text: 'Guide', link: '/en/guide/installation', activeMatch: '^/en/guide/' },
    { text: 'Reference', link: '/en/reference/tools', activeMatch: '^/en/reference/' },
    { text: 'Project', link: '/en/project/architecture', activeMatch: '^/en/project/' },
  ],
  sidebar: [
    {
      text: 'Guide',
      items: [
        { text: 'Installation', link: '/en/guide/installation' },
        { text: 'Configuration', link: '/en/guide/configuration' },
        { text: 'Getting started', link: '/en/guide/getting-started' },
        { text: 'Key concepts', link: '/en/guide/concepts' },
        { text: 'Working fast', link: '/en/guide/performance' },
        { text: 'Known limitations', link: '/en/guide/limitations' },
        { text: 'Troubleshooting', link: '/en/guide/troubleshooting' },
      ],
    },
    {
      text: 'Reference',
      items: [
        { text: 'Tools', link: '/en/reference/tools' },
        { text: 'Error codes', link: '/en/reference/errors' },
      ],
    },
    {
      text: 'Project',
      items: [
        { text: 'Architecture', link: '/en/project/architecture' },
        { text: 'Development', link: '/en/project/development' },
      ],
    },
  ],
  editLink: { pattern: `${repository}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
  footer: { message: 'Released under the MIT License.', copyright: 'Copyright © 2026 Samuel Ponce Luna' },
  outline: { level: [2, 3] },
};

export default defineConfig({
  title: 'ios-simulator-mcp',
  // The site is served from https://s-pl.github.io/ios-simulator-mcp/
  base: '/ios-simulator-mcp/',
  cleanUrls: true,
  lastUpdated: true,

  locales: {
    root: {
      label: 'Español',
      lang: 'es-ES',
      description: 'Servidor MCP para controlar el Simulador de iOS desde un agente.',
      themeConfig: spanish,
    },
    en: {
      label: 'English',
      lang: 'en-US',
      description: 'MCP server to control the iOS Simulator from an agent.',
      themeConfig: english,
    },
  },

  themeConfig: {
    socialLinks: [{ icon: 'github', link: repository }],
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar' },
              modal: {
                noResultsText: 'Sin resultados para',
                resetButtonTitle: 'Borrar la búsqueda',
                footer: { selectText: 'seleccionar', navigateText: 'navegar', closeText: 'cerrar' },
              },
            },
          },
        },
      },
    },
  },
});
