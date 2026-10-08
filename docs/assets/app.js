// Behaviour of the documentation site: tool reference, filter, navigation.
(function () {
  'use strict';

  /** Group shown for each tool, in display order. Unknown tools fall into "Otras". */
  var GROUPS = [
    { title: 'Dispositivos', tools: ['list_devices', 'boot_device', 'shutdown_device', 'erase_device', 'open_simulator_app'] },
    { title: 'Apps', tools: ['install_app', 'uninstall_app', 'launch_app', 'terminate_app', 'list_apps', 'open_url', 'get_app_container'] },
    { title: 'Interfaz (requiere idb)', tools: ['ui_describe_screen', 'ui_describe_point', 'ui_tap', 'ui_swipe', 'ui_type_text', 'ui_press_button', 'ui_press_key'] },
    { title: 'Multimedia', tools: ['screenshot', 'start_recording', 'stop_recording', 'add_media'] },
    { title: 'Entorno', tools: ['set_appearance', 'set_location', 'set_status_bar', 'set_permission', 'send_push_notification'] },
    { title: 'Logs', tools: ['get_logs'] },
  ];

  function el(tag, attributes, children) {
    var node = document.createElement(tag);
    Object.keys(attributes || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attributes[key];
      else node.setAttribute(key, attributes[key]);
    });
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }

  function badge(tool) {
    if (tool.destructive) return el('span', { class: 'badge danger', text: 'destructiva' });
    if (tool.readOnly) return el('span', { class: 'badge read', text: 'lectura' });
    return el('span', { class: 'badge write', text: 'modifica' });
  }

  function parameterTable(parameters) {
    if (parameters.length === 0) return el('p', { class: 'muted', text: 'Sin parámetros.' });
    var rows = parameters.map(function (parameter) {
      var name = el('td', {}, [el('code', { text: parameter.name })]);
      if (parameter.required) {
        name.appendChild(document.createTextNode(' '));
        name.appendChild(el('span', { class: 'required', text: 'obligatorio' }));
      }
      return el('tr', {}, [
        name,
        el('td', {}, [el('code', { text: parameter.type })]),
        el('td', { text: parameter.description }),
      ]);
    });
    return el('table', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Parámetro' }), el('th', { text: 'Tipo' }), el('th', { text: 'Descripción' }),
      ])]),
      el('tbody', {}, rows),
    ]);
  }

  function toolCard(tool) {
    var searchable = [tool.name, tool.title, tool.description]
      .concat(tool.parameters.map(function (parameter) { return parameter.name; }))
      .join(' ').toLowerCase();
    return el('details', { class: 'tool', id: 'tool-' + tool.name, 'data-search': searchable }, [
      el('summary', {}, [
        el('code', { text: tool.name }),
        el('span', { class: 'tool-title', text: tool.title }),
        badge(tool),
      ]),
      el('div', { class: 'tool-body' }, [el('p', { text: tool.description }), parameterTable(tool.parameters)]),
    ]);
  }

  function renderTools() {
    var container = document.getElementById('tools');
    var tools = window.TOOLS;
    if (!container) return;
    if (!Array.isArray(tools)) {
      container.replaceChildren(el('p', { class: 'muted', text: 'No se pudo cargar la referencia. Consulta el README del repositorio.' }));
      return;
    }

    var byName = {};
    tools.forEach(function (tool) { byName[tool.name] = tool; });
    var grouped = GROUPS.map(function (group) {
      return {
        title: group.title,
        tools: group.tools.map(function (name) {
          var tool = byName[name];
          delete byName[name];
          return tool;
        }).filter(Boolean),
      };
    });
    var rest = Object.keys(byName).map(function (name) { return byName[name]; });
    if (rest.length > 0) grouped.push({ title: 'Otras', tools: rest });

    container.replaceChildren.apply(container, grouped.map(function (group) {
      return el('div', { class: 'tool-group' }, [el('h3', { text: group.title })].concat(group.tools.map(toolCard)));
    }));
  }

  function setUpFilter() {
    var input = document.getElementById('tool-filter');
    if (!input) return;
    input.addEventListener('input', function () {
      var needle = input.value.trim().toLowerCase();
      document.querySelectorAll('.tool-group').forEach(function (group) {
        var visible = 0;
        group.querySelectorAll('.tool').forEach(function (tool) {
          var match = !needle || tool.getAttribute('data-search').indexOf(needle) !== -1;
          tool.hidden = !match;
          if (match) visible += 1;
        });
        group.hidden = visible === 0;
      });
    });
  }

  /** Opens the tool a link such as #tool-ui_tap points to. */
  function openLinkedTool() {
    var target = location.hash.indexOf('#tool-') === 0 ? document.getElementById(location.hash.slice(1)) : null;
    if (target) {
      target.open = true;
      target.scrollIntoView();
    }
  }

  function setUpNavigation() {
    var sidebar = document.getElementById('sidebar');
    var toggle = document.getElementById('menu-toggle');
    var links = Array.prototype.slice.call(sidebar.querySelectorAll('a[href^="#"]'));

    toggle.addEventListener('click', function () {
      toggle.setAttribute('aria-expanded', String(sidebar.classList.toggle('open')));
    });
    links.forEach(function (link) {
      link.addEventListener('click', function () {
        sidebar.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });

    if (!('IntersectionObserver' in window)) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (link) {
          link.classList.toggle('active', link.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-15% 0px -75% 0px' });
    document.querySelectorAll('main section[id]').forEach(function (section) { observer.observe(section); });
  }

  if (window.SERVER_VERSION) {
    document.getElementById('version').textContent = 'v' + window.SERVER_VERSION;
  }
  renderTools();
  setUpFilter();
  setUpNavigation();
  openLinkedTool();
  window.addEventListener('hashchange', openLinkedTool);
})();
