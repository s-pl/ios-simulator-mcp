import { defineConfig } from 'vitepress';

const repository = 'https://github.com/s-pl/ios-simulator-mcp';

export default defineConfig({
  lang: 'es-ES',
  title: 'ios-simulator-mcp',
  description: 'Servidor MCP para controlar el Simulador de iOS desde un agente.',
  // The site is served from https://s-pl.github.io/ios-simulator-mcp/
  base: '/ios-simulator-mcp/',
  cleanUrls: true,
  lastUpdated: true,

  themeConfig: {
    nav: [
      { text: 'Guía', link: '/guia/instalacion', activeMatch: '/guia/' },
      { text: 'Referencia', link: '/referencia/herramientas', activeMatch: '/referencia/' },
      { text: 'Proyecto', link: '/proyecto/arquitectura', activeMatch: '/proyecto/' },
    ],

    sidebar: [
      {
        text: 'Guía',
        items: [
          { text: 'Instalación', link: '/guia/instalacion' },
          { text: 'Configuración', link: '/guia/configuracion' },
          { text: 'Primeros pasos', link: '/guia/primeros-pasos' },
          { text: 'Conceptos clave', link: '/guia/conceptos' },
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

    socialLinks: [{ icon: 'github', link: repository }],
    search: {
      provider: 'local',
      options: {
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
    editLink: {
      pattern: `${repository}/edit/main/docs/:path`,
      text: 'Editar esta página en GitHub',
    },
    footer: {
      message: 'Publicado bajo licencia MIT.',
      copyright: 'Copyright © 2026 Samuel Ponce Luna',
    },

    // Interface texts of the default theme, translated.
    outline: { label: 'En esta página', level: [2, 3] },
    docFooter: { prev: 'Anterior', next: 'Siguiente' },
    lastUpdated: { text: 'Última actualización' },
    returnToTopLabel: 'Volver arriba',
    sidebarMenuLabel: 'Menú',
    darkModeSwitchLabel: 'Apariencia',
    lightModeSwitchTitle: 'Cambiar a modo claro',
    darkModeSwitchTitle: 'Cambiar a modo oscuro',
  },
});
