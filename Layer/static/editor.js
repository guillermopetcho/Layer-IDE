(function () {
  window.LayerDashEngine = function (config) {
    const instanceId = config.instanceId;
    const commTarget = config.commTarget;
    const initialRoot = config.rootPath;
    const initialFile = config.initialFile;
    const kaggleDetected = !!config.kaggleDetected;

    const wrapper = document.getElementById('layer-dash-' + instanceId);
    if (!wrapper) return;

    // DOM Elements
    const sidebarEl = wrapper.querySelector('.layer-sidebar');
    const treeEl = wrapper.querySelector('.layer-file-tree');
    const searchInput = wrapper.querySelector('.layer-search-input');
    const splitterV = wrapper.querySelector('.layer-splitter-v');
    const splitterH = wrapper.querySelector('.layer-splitter-h');
    const mainEl = wrapper.querySelector('.layer-main');
    const tabsEl = wrapper.querySelector('.layer-tabs');
    const editorContainer = wrapper.querySelector('.layer-editor-container');
    const emptyState = wrapper.querySelector('.layer-empty-state');
    const emptyBootEl = wrapper.querySelector('.layer-empty-boot');
    const emptyReadyEl = wrapper.querySelector('.layer-empty-ready');
    const breadcrumbsEl = wrapper.querySelector('.layer-breadcrumbs');
    const statusTextEl = wrapper.querySelector('.layer-status-text');
    const statusLangEl = wrapper.querySelector('.layer-status-lang');
    const cursorPosEl = wrapper.querySelector('.layer-cursor-pos');
    const connDotEl = wrapper.querySelector('.layer-conn-dot');
    const terminalEl = wrapper.querySelector('.layer-terminal');
    const terminalContentEl = wrapper.querySelector('.layer-terminal-content');
    const execTimerEl = wrapper.querySelector('.layer-exec-timer');
    const clearTermBtn = wrapper.querySelector('.layer-btn-clear-term');
    const saveBtn = wrapper.querySelector('.layer-btn-save');
    const runBtn = wrapper.querySelector('.layer-btn-run');
    const formatBtn = wrapper.querySelector('.layer-btn-format');
    const fullscreenBtn = wrapper.querySelector('.layer-btn-fullscreen');
    const helpBtn = wrapper.querySelector('.layer-btn-help');
    const helpModal = wrapper.querySelector('.layer-help-modal');
    const helpModalClose = wrapper.querySelector('.layer-help-modal .layer-modal-close');
    const themeSelect = wrapper.querySelector('.layer-theme-select');
    const contextMenuEl = wrapper.querySelector('.layer-context-menu');
    const newFileBtn = wrapper.querySelector('.layer-btn-new-file');
    const newFolderBtn = wrapper.querySelector('.layer-btn-new-folder');
    const refreshBtn = wrapper.querySelector('.layer-btn-refresh');

    // Reflect the auto-detected Kaggle root in the header so it's obvious
    // *why* the IDE opened where it did, instead of it looking arbitrary.
    if (kaggleDetected && breadcrumbsEl) {
      const badge = document.createElement('span');
      badge.className = 'layer-kaggle-badge';
      badge.textContent = '🅺 Kaggle';
      badge.title = 'Raíz detectada automáticamente: /kaggle/working';
      breadcrumbsEl.after(badge);
    }

    // --- Theming ---
    // The theme selector used to only restyle Monaco's own canvas, leaving
    // the rest of the chrome (header, sidebar, tabs, status bar) stuck in
    // dark mode. Toggling data-theme here drives the CSS variables that
    // color the whole widget, in addition to Monaco's own theme.
    const THEME_MAP = { 'vs-dark': 'dark', 'vs': 'light', 'hc-black': 'contrast' };
    function applyTheme(themeValue) {
      wrapper.setAttribute('data-theme', THEME_MAP[themeValue] || 'dark');
      if (window.monaco) monaco.editor.setTheme(themeValue);
    }

    let monacoEditor = null;
    let comm = null;
    let openTabs = []; // { rel_path, name, model, is_dirty, language, is_image, image_src }
    let activeTabPath = null;
    let currentTreeItems = [];
    let imageViewerEl = null;
    let usingMonaco = true;
    let fallbackTextarea = null;
    let fallbackCurrentModel = null;

    // --- Helper Functions to locate environment frames ---
    function getAccessibleFrames() {
      const frames = [window];
      try {
        if (window.parent && window.parent !== window) frames.push(window.parent);
      } catch (e) {}
      try {
        if (window.top && window.top !== window && !frames.includes(window.top)) frames.push(window.top);
      } catch (e) {}
      return frames;
    }

    function findColabKernel() {
      for (const win of getAccessibleFrames()) {
        try {
          if (win.google && win.google.colab && win.google.colab.kernel) {
            return win.google.colab.kernel;
          }
        } catch (e) {}
      }
      return null;
    }

    function findJupyterKernel() {
      for (const win of getAccessibleFrames()) {
        try {
          if (win.Jupyter && win.Jupyter.notebook && win.Jupyter.notebook.kernel) {
            return win.Jupyter.notebook.kernel;
          }
          if (win.IPython && win.IPython.notebook && win.IPython.notebook.kernel) {
            return win.IPython.notebook.kernel;
          }
          if (win._jupyterlab_kernel) {
            return win._jupyterlab_kernel;
          }
        } catch (e) {}
      }
      return null;
    }

    function findIpywidgetsCommClass() {
      for (const win of getAccessibleFrames()) {
        try {
          if (win.ipywidgets && win.ipywidgets.Comm) {
            return win.ipywidgets.Comm;
          }
        } catch (e) {}
      }
      return null;
    }

    // Runs only when every known comm mechanism has failed, to capture
    // *why* in the browser console: whether each accessible frame is same-
    // origin at all, and which (if any) global names on it look related to
    // a notebook kernel. This environment isn't reproducible outside a real
    // notebook session, so this is how we find out what a given platform
    // (e.g. Kaggle's own notebook frontend) actually exposes, instead of
    // guessing blindly at global names to check for.
    function diagnoseCommEnvironment() {
      const labels = ['window (this iframe)', 'window.parent', 'window.top'];
      const winRefs = [
        window,
        (function () { try { return window.parent; } catch (e) { return null; } })(),
        (function () { try { return window.top; } catch (e) { return null; } })(),
      ];

      const report = winRefs.map((win, idx) => {
        const label = labels[idx];
        if (!win) return { frame: label, reachable: false };
        if (win === window && idx > 0) return { frame: label, sameAs: 'window' };

        let crossOrigin = false;
        try {
          void win.location.href; // throws for a cross-origin window
        } catch (e) {
          crossOrigin = true;
        }

        let matchingGlobals = [];
        if (!crossOrigin) {
          try {
            matchingGlobals = Object.keys(win).filter((k) =>
              /jupyter|ipython|colab|kernel|comm|kaggle|widget/i.test(k)
            );
          } catch (e) {
            matchingGlobals = ['<error enumerating: ' + e.message + '>'];
          }
        }

        return { frame: label, reachable: true, crossOrigin, matchingGlobals };
      });

      console.warn(
        'Layer IDE: no comm channel found. Diagnostic report (please copy this if reporting an issue):\n' +
          JSON.stringify(report, null, 2)
      );
      return report;
    }

    // --- Connection Status Indicator ---
    // Reflects whether the last RPC round-trip actually succeeded, so a
    // dead comm channel (a real, recurring pain point on Kaggle) shows up
    // as a visible red dot in the status bar instead of only surfacing
    // through individual error toasts.
    function setConnectionStatus(connected) {
      if (!connDotEl) return;
      connDotEl.classList.toggle('connected', connected === true);
      connDotEl.classList.toggle('disconnected', connected === false);
      connDotEl.title = connected
        ? 'Conectado al kernel'
        : 'Sin canal de comunicación con el kernel';
    }

    // --- Communication Bridge ---
    function sendCommMessage(action, payload = {}) {
      return sendCommMessageRaw(action, payload).then(
        (res) => { setConnectionStatus(true); return res; },
        (err) => { setConnectionStatus(false); throw err; }
      );
    }

    function sendCommMessageRaw(action, payload = {}) {
      return new Promise((resolve, reject) => {
        const msgData = { action: action, ...payload };

        // 1. Check Google Colab Kernel (Current, Parent, Top frames)
        const colabKernel = findColabKernel();
        if (colabKernel) {
          colabKernel
            .invokeFunction('layer_dash_' + instanceId, [msgData], {})
            .then((res) => {
              if (res && res.data && res.data['application/json']) {
                resolve(res.data['application/json']);
              } else if (res && res.data && res.data['text/plain']) {
                try {
                  resolve(JSON.parse(res.data['text/plain']));
                } catch (e) { resolve(res); }
              } else {
                resolve(res);
              }
            })
            .catch((err) => reject(err));
          return;
        }

        // 2. Check Custom Window Bridge if set on any accessible frame
        for (const win of getAccessibleFrames()) {
          try {
            if (win['layer_bridge_' + instanceId]) {
              win['layer_bridge_' + instanceId](msgData, resolve, reject);
              return;
            }
          } catch (e) {}
        }

        // 3. Check Jupyter Notebook / Kaggle Kernel Comm
        if (!comm) {
          const jupyterKernel = findJupyterKernel();
          if (jupyterKernel && jupyterKernel.comm_manager) {
            try {
              comm = jupyterKernel.comm_manager.new_comm(commTarget, { instanceId: instanceId });
            } catch (e) {
              console.warn('Layer IDE: Failed to initialize kernel new_comm:', e);
            }
          }
          if (!comm) {
            const CommClass = findIpywidgetsCommClass();
            if (CommClass) {
              try {
                comm = new CommClass(commTarget, { instanceId: instanceId });
              } catch (e) {
                console.warn('Layer IDE: Failed to initialize ipywidgets.Comm:', e);
              }
            }
          }
        }

        if (comm) {
          const msgId = 'msg_' + Math.random().toString(36).substr(2, 9);
          msgData._msgId = msgId;

          const handler = (msg) => {
            const res = msg.content ? msg.content.data : msg;
            if (res && (res._msgId === msgId || !res._msgId)) {
              if (typeof comm.un_msg === 'function') comm.un_msg(handler);
              if (res.error) reject(new Error(res.error));
              else resolve(res);
            }
          };

          if (typeof comm.on_msg === 'function') comm.on_msg(handler);
          comm.send(msgData);

          setTimeout(() => {
            if (typeof comm.un_msg === 'function') comm.un_msg(handler);
            reject(new Error('Backend response timeout for action: ' + action));
          }, 15000);
          return;
        }

        // 4. Kernel.execute Fallback (works in Kaggle / JupyterLab when comm target isn't open)
        const jupyterKernel = findJupyterKernel();
        if (jupyterKernel && typeof jupyterKernel.execute === 'function') {
          const payloadJsonStr = JSON.stringify(JSON.stringify(msgData));
          const pyCmd = `import builtins, json; print("___LAYER_RPC___" + json.dumps(builtins._layer_rpc_call("${instanceId}", ${payloadJsonStr})) + "___END_LAYER_RPC___")`;

          let completed = false;
          try {
            jupyterKernel.execute(
              pyCmd,
              {
                iopub: {
                  output: function(msg) {
                    if (completed) return;
                    if (msg.msg_type === 'stream' && msg.content && msg.content.text) {
                      const text = msg.content.text;
                      if (text.includes('___LAYER_RPC___')) {
                        completed = true;
                        try {
                          const jsonStr = text.split('___LAYER_RPC___')[1].split('___END_LAYER_RPC___')[0];
                          const res = JSON.parse(jsonStr);
                          if (res.error) reject(new Error(res.error));
                          else resolve(res);
                        } catch (err) {
                          reject(err);
                        }
                      }
                    } else if (msg.msg_type === 'error') {
                      completed = true;
                      reject(new Error(msg.content.evalue || 'Python execution error'));
                    }
                  }
                }
              },
              { silent: true, store_history: false }
            );
          } catch(e) {
            reject(e);
            return;
          }

          setTimeout(() => {
            if (!completed) {
              completed = true;
              reject(new Error('Kernel RPC execution timeout for action: ' + action));
            }
          }, 15000);
          return;
        }

        // 5. Direct error if all connection methods failed
        diagnoseCommEnvironment();
        showToast('No notebook comm channel or kernel connection detected. Ver la consola del navegador (F12) para el diagnóstico.', 'error');
        reject(new Error('No notebook comm channel available.'));
      });
    }

    // --- Toast Notifications ---
    let toastContainer = null;
    const TOAST_ICONS = { success: '✓', error: '✕', info: 'ℹ' };

    function showToast(message, type = 'info') {
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'layer-toast-container';
        wrapper.appendChild(toastContainer);
      }

      const toast = document.createElement('div');
      toast.className = 'layer-toast layer-toast-' + type;

      const iconEl = document.createElement('span');
      iconEl.className = 'layer-toast-icon';
      iconEl.textContent = TOAST_ICONS[type] || TOAST_ICONS.info;

      const textEl = document.createElement('span');
      textEl.textContent = message;

      toast.appendChild(iconEl);
      toast.appendChild(textEl);
      toastContainer.appendChild(toast);

      requestAnimationFrame(() => toast.classList.add('visible'));

      setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    }

    // Switches the empty-state overlay from its "Cargando editor..." boot
    // spinner to the normal "select a file" copy, then hides the whole
    // overlay — called once Monaco (or the fallback editor) is actually
    // usable. The "ready" copy stays wired up so closeTab() can still show
    // it again later when the user closes their last open tab.
    function markEditorReady() {
      if (emptyBootEl) emptyBootEl.style.display = 'none';
      if (emptyReadyEl) emptyReadyEl.style.display = 'flex';
      emptyState.style.display = 'none';
    }

    // --- Resizable Drag Splitters ---
    let isDraggingV = false;
    let isDraggingH = false;

    if (splitterV) {
      splitterV.addEventListener('mousedown', (e) => {
        isDraggingV = true;
        splitterV.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
      });
    }

    if (splitterH) {
      splitterH.addEventListener('mousedown', (e) => {
        isDraggingH = true;
        splitterH.classList.add('dragging');
        document.body.style.cursor = 'row-resize';
      });
    }

    document.addEventListener('mousemove', (e) => {
      if (isDraggingV) {
        const wrapperRect = wrapper.getBoundingClientRect();
        let newWidth = e.clientX - wrapperRect.left;
        newWidth = Math.max(120, Math.min(newWidth, wrapperRect.width - 200));
        sidebarEl.style.width = newWidth + 'px';
        if (monacoEditor) monacoEditor.layout();
      }
      if (isDraggingH) {
        const mainRect = mainEl.getBoundingClientRect();
        let newHeight = mainRect.bottom - e.clientY;
        newHeight = Math.max(60, Math.min(newHeight, mainRect.height - 100));
        terminalEl.style.height = newHeight + 'px';
        if (monacoEditor) monacoEditor.layout();
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDraggingV) {
        isDraggingV = false;
        if (splitterV) splitterV.classList.remove('dragging');
        document.body.style.cursor = '';
      }
      if (isDraggingH) {
        isDraggingH = false;
        if (splitterH) splitterH.classList.remove('dragging');
        document.body.style.cursor = '';
      }
    });

    // --- Context Menu ---
    function hideContextMenu() {
      if (contextMenuEl) contextMenuEl.style.display = 'none';
    }

    document.addEventListener('click', hideContextMenu);

    function showContextMenu(e, items) {
      e.preventDefault();
      e.stopPropagation();
      contextMenuEl.innerHTML = '';
      items.forEach((item) => {
        if (item === 'divider') {
          const div = document.createElement('div');
          div.className = 'layer-context-menu-divider';
          contextMenuEl.appendChild(div);
        } else {
          const el = document.createElement('div');
          el.className = 'layer-context-menu-item';
          el.innerHTML = `<span>${item.icon || ''}</span> <span>${item.label}</span>`;
          el.addEventListener('click', (evt) => {
            evt.stopPropagation();
            hideContextMenu();
            item.action();
          });
          contextMenuEl.appendChild(el);
        }
      });

      const wrapperRect = wrapper.getBoundingClientRect();
      let left = e.clientX - wrapperRect.left;
      let top = e.clientY - wrapperRect.top;

      contextMenuEl.style.left = left + 'px';
      contextMenuEl.style.top = top + 'px';
      contextMenuEl.style.display = 'block';
    }

    // --- Initialize Monaco Editor ---
    // Monaco loads asynchronously from a CDN. Some notebook environments
    // (notably Kaggle's sandboxed output iframes) can block or fail that
    // external request, which used to leave the whole IDE silently blank
    // because every other step (file tree, tabs, initial file) only ran
    // inside Monaco's success callback. This now always resolves to either
    // Monaco or a working plain-text fallback within a bounded time.
    function initMonaco() {
      if (window.monaco) {
        setupEditorInstance();
        return;
      }

      let settled = false;
      const timeoutId = setTimeout(() => finishFailure('timeout loading editor assets'), 8000);

      function finishSuccess() {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        setupEditorInstance();
      }

      function finishFailure(reason) {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        console.warn('Layer IDE: Monaco Editor could not be loaded (' + reason + '). Falling back to a basic text editor.');
        showToast('No se pudo cargar Monaco Editor (¿CDN bloqueado en este entorno?). Usando editor básico.', 'error');
        setupFallbackEditor();
      }

      if (!window.require) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/require.js/2.3.6/require.min.js';
        script.onload = () => loadMonacoCDN(finishSuccess, finishFailure);
        script.onerror = () => finishFailure('require.js failed to load');
        document.head.appendChild(script);
      } else {
        loadMonacoCDN(finishSuccess, finishFailure);
      }
    }

    function loadMonacoCDN(onSuccess, onFailure) {
      try {
        window.require.config({
          paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }
        });
        window.require(['vs/editor/editor.main'], onSuccess, () => onFailure('monaco-editor AMD module failed to load'));
      } catch (e) {
        onFailure('exception while requesting monaco-editor: ' + e.message);
      }
    }

    // --- Fallback Plain-Text Editor (used when Monaco is unavailable) ---
    // Implements just enough of the Monaco editor API surface that the rest
    // of this file already calls (getValue/setValue/setModel/getSelection/
    // executeEdits/trigger/layout) so file editing, saving, running and the
    // AI copilot keep working without syntax highlighting.
    function setupFallbackEditor() {
      usingMonaco = false;
      markEditorReady();

      const wrap = document.createElement('div');
      wrap.className = 'layer-fallback-wrap';

      const gutter = document.createElement('div');
      gutter.className = 'layer-fallback-gutter';
      gutter.textContent = '1';

      fallbackTextarea = document.createElement('textarea');
      fallbackTextarea.className = 'layer-fallback-editor';
      fallbackTextarea.spellcheck = false;
      fallbackTextarea.setAttribute('autocomplete', 'off');

      wrap.appendChild(gutter);
      wrap.appendChild(fallbackTextarea);
      editorContainer.appendChild(wrap);

      function syncGutter() {
        const lineCount = fallbackTextarea.value.split('\n').length;
        let lines = '';
        for (let i = 1; i <= lineCount; i++) lines += i + '\n';
        gutter.textContent = lines;
      }

      fallbackTextarea.addEventListener('scroll', () => {
        gutter.scrollTop = fallbackTextarea.scrollTop;
      });

      fallbackTextarea.addEventListener('input', () => {
        syncGutter();
        if (fallbackCurrentModel) fallbackCurrentModel.value = fallbackTextarea.value;
        if (activeTabPath) {
          const tab = openTabs.find((t) => t.rel_path === activeTabPath);
          if (tab && !tab.is_dirty) {
            tab.is_dirty = true;
            renderTabs();
          }
        }
      });

      fallbackTextarea.addEventListener('keydown', (e) => {
        const ctrlOrCmd = e.ctrlKey || e.metaKey;
        if (ctrlOrCmd && e.key.toLowerCase() === 's') {
          e.preventDefault();
          saveActiveFile();
        } else if (ctrlOrCmd && e.key === 'Enter') {
          e.preventDefault();
          runActiveFile();
        }
      });

      monacoEditor = {
        getValue: () => fallbackTextarea.value,
        setValue: (v) => { fallbackTextarea.value = v || ''; syncGutter(); },
        layout: () => {},
        getDomNode: () => wrap,
        setModel: (modelLike) => {
          fallbackCurrentModel = modelLike || { value: '' };
          fallbackTextarea.value = fallbackCurrentModel.value || '';
          syncGutter();
        },
        getModel: () => ({
          getValueInRange: () => fallbackTextarea.value.substring(fallbackTextarea.selectionStart, fallbackTextarea.selectionEnd),
        }),
        getSelection: () => {
          const start = fallbackTextarea.selectionStart;
          const end = fallbackTextarea.selectionEnd;
          return { isEmpty: () => start === end, start, end };
        },
        executeEdits: (source, edits) => {
          const edit = edits && edits[0];
          if (!edit) return;
          const start = fallbackTextarea.selectionStart;
          const end = fallbackTextarea.selectionEnd;
          const value = fallbackTextarea.value;
          fallbackTextarea.value = value.slice(0, start) + edit.text + value.slice(end);
          fallbackTextarea.dispatchEvent(new Event('input'));
        },
        trigger: (source, handlerId, payload) => {
          const start = fallbackTextarea.selectionStart;
          const value = fallbackTextarea.value;
          const text = (payload && payload.text) || '';
          fallbackTextarea.value = value.slice(0, start) + text + value.slice(start);
          fallbackTextarea.dispatchEvent(new Event('input'));
        },
        onDidChangeCursorPosition: () => {},
        onDidChangeModelContent: () => {},
        addCommand: () => {},
      };

      if (searchInput) searchInput.value = '';
      populateModelHub();

      // Load File Explorer Tree regardless of which editor backend is active
      loadFullTree();

      if (initialFile) {
        openFile(initialFile);
      }
    }

    function setupEditorInstance() {
      markEditorReady();
      monacoEditor = monaco.editor.create(editorContainer, {
        value: '',
        language: 'python',
        theme: themeSelect ? themeSelect.value : 'vs-dark',
        automaticLayout: true,
        fontSize: 13,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        renderWhitespace: 'selection',
        smoothScrolling: true,
        cursorBlinking: 'smooth',
      });

      // Cursor position listener
      monacoEditor.onDidChangeCursorPosition((e) => {
        cursorPosEl.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
      });

      // Change content / dirty listener
      monacoEditor.onDidChangeModelContent(() => {
        if (activeTabPath) {
          const tab = openTabs.find((t) => t.rel_path === activeTabPath);
          if (tab && !tab.is_dirty) {
            tab.is_dirty = true;
            renderTabs();
          }
        }
      });

      // Keybinding: Ctrl+S / Cmd+S (Save)
      monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        saveActiveFile();
      });

      // Keybinding: Ctrl+Enter (Run Script)
      monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        runActiveFile();
      });

      if (searchInput) searchInput.value = '';
      populateModelHub();

      // Load File Explorer Tree
      loadFullTree();

      if (initialFile) {
        openFile(initialFile);
      }
    }

    // --- Search Filter Listener ---
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (!query) {
          renderTreeItems(currentTreeItems, treeEl);
        } else {
          const filtered = currentTreeItems.filter((item) => item.name.toLowerCase().includes(query));
          renderTreeItems(filtered, treeEl);
        }
      });
    }

    // --- File Tree Renderer ---
    // Loads the full recursive tree in one RPC call so the whole workspace
    // (e.g. /kaggle/working) is visible expanded as soon as the IDE opens,
    // instead of requiring the user to click into every folder manually.
    function loadFullTree() {
      sendCommMessage('list_tree', { rel_path: '' })
        .then((data) => {
          if (data.error) {
            showToast(data.error, 'error');
            return;
          }
          currentTreeItems = data.items;
          renderTreeItems(data.items, treeEl);
          if (data.truncated) {
            showToast(
              `Directorio muy grande: se muestran ${data.scanned_entries} elementos (algunas subcarpetas se cargarán al hacer click).`,
              'info'
            );
          }
        })
        .catch((err) => showToast('Failed to load file tree: ' + err.message, 'error'));
    }

    // Kept for targeted single-level refreshes (e.g. re-fetching a lazily
    // loaded subfolder that the recursive scan above had to skip).
    function loadTree(relPath = '') {
      if (relPath === '') {
        loadFullTree();
        return;
      }
      sendCommMessage('list_dir', { rel_path: relPath })
        .then((data) => {
          if (data.error) {
            showToast(data.error, 'error');
            return;
          }
          renderTreeItems(data.items, treeEl);
        })
        .catch((err) => showToast('Failed to load file tree: ' + err.message, 'error'));
    }

    function renderTreeItems(items, container) {
      container.innerHTML = '';
      if (!items || items.length === 0) {
        container.innerHTML = '<div class="layer-tree-empty"><span>📭</span><span>Empty folder</span></div>';
        return;
      }

      items.forEach((item) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'layer-tree-item';
        if (item.rel_path === activeTabPath) itemEl.classList.add('active');

        const arrow = document.createElement('span');
        arrow.className = 'layer-tree-arrow';
        arrow.textContent = item.is_dir ? '▶' : '';

        const icon = document.createElement('span');
        icon.className = 'layer-tree-icon';
        icon.textContent = item.is_dir ? '📁' : getFileIcon(item.name);

        const label = document.createElement('span');
        label.textContent = item.name;

        itemEl.appendChild(arrow);
        itemEl.appendChild(icon);
        itemEl.appendChild(label);

        // Directories from the recursive list_tree scan already carry their
        // children (possibly an empty array) — render them expanded right
        // away instead of waiting for a click.
        let subContainer = null;
        if (item.is_dir && Array.isArray(item.children)) {
          subContainer = document.createElement('div');
          subContainer.className = 'layer-subtree';
          subContainer.style.paddingLeft = '12px';
          renderTreeItems(item.children, subContainer);
          arrow.classList.add('expanded');
        }

        // Click event
        itemEl.addEventListener('click', (e) => {
          e.stopPropagation();
          wrapper.querySelectorAll('.layer-tree-item').forEach((el) => el.classList.remove('active'));
          itemEl.classList.add('active');

          if (item.is_dir) {
            arrow.classList.toggle('expanded');
            if (subContainer) {
              // Already rendered (recursive scan) — just show/hide it.
              subContainer.style.display = subContainer.style.display === 'none' ? 'block' : 'none';
              return;
            }
            // Not preloaded (recursive scan hit its safety cap before this
            // folder) — fall back to fetching this one level on demand.
            let lazyContainer = itemEl.nextElementSibling;
            if (lazyContainer && lazyContainer.classList.contains('layer-subtree')) {
              lazyContainer.style.display = lazyContainer.style.display === 'none' ? 'block' : 'none';
            } else {
              lazyContainer = document.createElement('div');
              lazyContainer.className = 'layer-subtree';
              lazyContainer.style.paddingLeft = '12px';
              itemEl.after(lazyContainer);
              sendCommMessage('list_dir', { rel_path: item.rel_path }).then((res) => {
                renderTreeItems(res.items, lazyContainer);
              });
            }
          } else {
            openFile(item.rel_path);
          }
        });

        // Context Menu (Right Click)
        itemEl.addEventListener('contextmenu', (e) => {
          showContextMenu(e, [
            {
              label: 'Rename',
              icon: '✏️',
              action: () => renameTreeItem(item.rel_path, item.name),
            },
            {
              label: 'Duplicate',
              icon: '📋',
              action: () => duplicateTreeItem(item.rel_path),
            },
            {
              label: 'Copy Relative Path',
              icon: '🔗',
              action: () => {
                navigator.clipboard.writeText(item.rel_path);
                showToast('Copied path: ' + item.rel_path, 'success');
              },
            },
            'divider',
            {
              label: 'Delete',
              icon: '🗑️',
              action: () => deleteTreeItem(item.rel_path, item.name),
            },
          ]);
        });

        container.appendChild(itemEl);
        if (subContainer) container.appendChild(subContainer);
      });
    }

    function renameTreeItem(oldRelPath, oldName) {
      const newName = prompt('Enter new name for ' + oldName + ':', oldName);
      if (newName && newName !== oldName) {
        const parentPath = oldRelPath.includes('/') ? oldRelPath.substring(0, oldRelPath.lastIndexOf('/')) : '';
        const newRelPath = parentPath ? parentPath + '/' + newName : newName;
        sendCommMessage('rename_item', { old_rel_path: oldRelPath, new_rel_path: newRelPath }).then((res) => {
          if (res.error) showToast(res.error, 'error');
          else {
            showToast('Renamed to ' + newName, 'success');
            loadTree();
          }
        });
      }
    }

    function duplicateTreeItem(relPath) {
      sendCommMessage('duplicate_item', { rel_path: relPath }).then((res) => {
        if (res.error) showToast(res.error, 'error');
        else {
          showToast('Duplicated to ' + res.new_rel_path, 'success');
          loadTree();
        }
      });
    }

    function deleteTreeItem(relPath, name) {
      if (confirm(`Are you sure you want to delete '${name}'?`)) {
        sendCommMessage('delete_item', { rel_path: relPath }).then((res) => {
          if (res.error) showToast(res.error, 'error');
          else {
            showToast('Deleted ' + name, 'success');
            closeTab(relPath);
            loadTree();
          }
        });
      }
    }

    function getFileIcon(filename) {
      const ext = filename.split('.').pop().toLowerCase();
      switch (ext) {
        case 'py': return '🐍';
        case 'js': case 'ts': return '📜';
        case 'html': return '🌐';
        case 'css': return '🎨';
        case 'json': return '⚙️';
        case 'md': return '📝';
        case 'sql': return '🗄️';
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'webp': return '🖼️';
        default: return '📄';
      }
    }

    // --- Tab & File Management ---
    function openFile(relPath) {
      const existingTab = openTabs.find((t) => t.rel_path === relPath);
      if (existingTab) {
        switchTab(relPath);
        return;
      }

      statusTextEl.textContent = 'Opening ' + relPath + '...';
      sendCommMessage('read_file', { rel_path: relPath })
        .then((data) => {
          if (data.error) {
            showToast(data.error, 'error');
            statusTextEl.textContent = 'Ready';
            return;
          }

          let tab = {
            rel_path: relPath,
            name: relPath.split('/').pop(),
            is_dirty: false,
            language: data.language || 'plaintext',
            is_image: data.is_image || false,
            mime_type: data.mime_type || '',
            image_src: data.is_image ? `data:${data.mime_type};base64,${data.content}` : null,
          };

          if (!data.is_image) {
            tab.model = usingMonaco
              ? monaco.editor.createModel(data.content, data.language)
              : { value: data.content, language: data.language };
          }

          openTabs.push(tab);
          switchTab(relPath);
          renderTabs();
          statusTextEl.textContent = 'Opened ' + relPath;
        })
        .catch((err) => {
          showToast('Error opening file: ' + err.message, 'error');
          statusTextEl.textContent = 'Ready';
        });
    }

    function switchTab(relPath) {
      const tab = openTabs.find((t) => t.rel_path === relPath);
      if (!tab) return;

      activeTabPath = relPath;
      breadcrumbsEl.textContent = relPath;
      if (statusLangEl) statusLangEl.textContent = tab.language;

      if (tab.is_image) {
        if (monacoEditor) monacoEditor.getDomNode().style.display = 'none';
        if (!imageViewerEl) {
          imageViewerEl = document.createElement('div');
          imageViewerEl.className = 'layer-image-viewer';
          editorContainer.appendChild(imageViewerEl);
        }
        imageViewerEl.style.display = 'flex';
        imageViewerEl.innerHTML = `<img src="${tab.image_src}" alt="${tab.name}" />`;
      } else {
        if (imageViewerEl) imageViewerEl.style.display = 'none';
        if (monacoEditor) {
          monacoEditor.getDomNode().style.display = 'block';
          monacoEditor.setModel(tab.model);
        }
      }

      renderTabs();

      // Highlight in tree if exists
      wrapper.querySelectorAll('.layer-tree-item').forEach((el) => el.classList.remove('active'));
    }

    function closeTab(relPath, e) {
      if (e) e.stopPropagation();
      const index = openTabs.findIndex((t) => t.rel_path === relPath);
      if (index === -1) return;

      const tab = openTabs[index];
      if (tab.is_dirty) {
        if (!confirm(`File '${tab.name}' has unsaved changes. Close anyway?`)) {
          return;
        }
      }

      if (tab.model && typeof tab.model.dispose === 'function') tab.model.dispose();
      openTabs.splice(index, 1);

      if (activeTabPath === relPath) {
        if (openTabs.length > 0) {
          const nextTab = openTabs[Math.max(0, index - 1)];
          switchTab(nextTab.rel_path);
        } else {
          activeTabPath = null;
          if (monacoEditor) {
            monacoEditor.setModel(usingMonaco ? monaco.editor.createModel('', 'plaintext') : { value: '' });
          }
          if (imageViewerEl) imageViewerEl.style.display = 'none';
          emptyState.style.display = 'flex';
          breadcrumbsEl.textContent = '';
        }
      }
      renderTabs();
    }

    function renderTabs() {
      tabsEl.innerHTML = '';
      openTabs.forEach((tab) => {
        const tabEl = document.createElement('div');
        tabEl.className = 'layer-tab';
        if (tab.rel_path === activeTabPath) tabEl.classList.add('active');
        if (tab.is_dirty) tabEl.classList.add('dirty');

        const nameEl = document.createElement('span');
        nameEl.className = 'layer-tab-name';
        nameEl.textContent = tab.name;

        const dirtyEl = document.createElement('span');
        dirtyEl.className = 'layer-tab-dirty';

        const closeEl = document.createElement('span');
        closeEl.className = 'layer-tab-close';
        closeEl.textContent = '×';
        closeEl.addEventListener('click', (e) => closeTab(tab.rel_path, e));

        tabEl.appendChild(nameEl);
        tabEl.appendChild(dirtyEl);
        tabEl.appendChild(closeEl);

        // Middle click to close tab
        tabEl.addEventListener('auxclick', (e) => {
          if (e.button === 1) closeTab(tab.rel_path, e);
        });

        tabEl.addEventListener('click', () => switchTab(tab.rel_path));
        tabsEl.appendChild(tabEl);
      });
    }

    // --- Actions: Save & Run & Format ---
    function saveActiveFile() {
      if (!activeTabPath) return;
      const tab = openTabs.find((t) => t.rel_path === activeTabPath);
      if (!tab || tab.is_image) return;

      const content = monacoEditor.getValue();
      statusTextEl.textContent = 'Saving ' + tab.name + '...';

      sendCommMessage('write_file', { rel_path: activeTabPath, content: content })
        .then((res) => {
          if (res.error) {
            showToast(res.error, 'error');
            statusTextEl.textContent = 'Save failed';
            return;
          }
          tab.is_dirty = false;
          renderTabs();
          showToast('Saved ' + tab.name + ' successfully', 'success');
          statusTextEl.textContent = 'Saved ' + tab.name;
        })
        .catch((err) => showToast('Save error: ' + err.message, 'error'));
    }

    function formatActiveFile() {
      if (!activeTabPath) return;
      const tab = openTabs.find((t) => t.rel_path === activeTabPath);
      if (!tab || tab.is_image) return;

      const content = monacoEditor.getValue();
      statusTextEl.textContent = 'Formatting ' + tab.name + '...';

      sendCommMessage('format_code', { rel_path: activeTabPath, content: content })
        .then((res) => {
          if (res.error) {
            showToast(res.error, 'error');
            statusTextEl.textContent = 'Format unavailable';
            return;
          }
          if (res.formatted_content) {
            monacoEditor.setValue(res.formatted_content);
            showToast('Formatted ' + tab.name, 'success');
            statusTextEl.textContent = 'Formatted ' + tab.name;
          }
        })
        .catch((err) => showToast('Format error: ' + err.message, 'error'));
    }

    function runActiveFile() {
      if (!activeTabPath) {
        showToast('No active file to run', 'error');
        return;
      }
      if (!activeTabPath.endsWith('.py')) {
        showToast('Only Python (.py) files can be executed.', 'error');
        return;
      }

      saveActiveFile();
      if (splitterH) splitterH.style.display = 'block';
      terminalEl.style.display = 'flex';
      terminalContentEl.innerHTML = '<span style="color:#60a5fa">⚡ Executing ' + activeTabPath + '...</span>\n';
      statusTextEl.textContent = 'Running ' + activeTabPath + '...';
      const startTime = Date.now();

      const timerInterval = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        if (execTimerEl) execTimerEl.textContent = `${elapsed}s`;
      }, 100);

      sendCommMessage('run_script', { rel_path: activeTabPath })
        .then((res) => {
          clearInterval(timerInterval);
          if (res.error) {
            terminalContentEl.innerHTML += `<span class="layer-terminal-stderr">Error: ${res.error}</span>\n`;
            statusTextEl.textContent = 'Execution error';
            return;
          }
          if (res.stdout) {
            terminalContentEl.innerHTML += `<span class="layer-terminal-stdout">${escapeHtml(res.stdout)}</span>`;
          }
          if (res.stderr) {
            terminalContentEl.innerHTML += `<span class="layer-terminal-stderr">${escapeHtml(res.stderr)}</span>`;
          }
          terminalContentEl.innerHTML += `\n<span style="color:var(--layer-text-muted)">[Process exited with code ${res.returncode}]</span>\n`;
          terminalContentEl.scrollTop = terminalContentEl.scrollHeight;
          statusTextEl.textContent = 'Finished execution';
        })
        .catch((err) => {
          clearInterval(timerInterval);
          terminalContentEl.innerHTML += `<span class="layer-terminal-stderr">Execution error: ${err.message}</span>\n`;
          statusTextEl.textContent = 'Execution failed';
        });
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // --- Header & Modal Listeners ---
    if (saveBtn) saveBtn.addEventListener('click', saveActiveFile);
    if (runBtn) runBtn.addEventListener('click', runActiveFile);
    if (formatBtn) formatBtn.addEventListener('click', formatActiveFile);
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadTree());
    if (clearTermBtn) clearTermBtn.addEventListener('click', () => { terminalContentEl.innerHTML = ''; });

    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));
      applyTheme(themeSelect.value);
    }

    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        wrapper.classList.toggle('fullscreen');
        if (monacoEditor) monacoEditor.layout();
      });
    }

    if (helpBtn && helpModal) {
      helpBtn.addEventListener('click', () => { helpModal.style.display = 'flex'; });
    }
    if (helpModalClose && helpModal) {
      helpModalClose.addEventListener('click', () => { helpModal.style.display = 'none'; });
    }

    if (newFileBtn) {
      newFileBtn.addEventListener('click', () => {
        const name = prompt('Enter new file name (e.g. script.py or src/utils.py):');
        if (name) {
          sendCommMessage('create_file', { rel_path: name }).then((res) => {
            if (res.error) showToast(res.error, 'error');
            else {
              showToast('Created file ' + name, 'success');
              loadTree();
              openFile(name);
            }
          });
        }
      });
    }

    if (newFolderBtn) {
      newFolderBtn.addEventListener('click', () => {
        const name = prompt('Enter new folder name:');
        if (name) {
          sendCommMessage('create_dir', { rel_path: name }).then((res) => {
            if (res.error) showToast(res.error, 'error');
            else {
              showToast('Created folder ' + name, 'success');
              loadTree();
            }
          });
        }
      });
    }

    // --- AI Copilot Elements & Logic ---
    const aiBtn = wrapper.querySelector('.layer-btn-ai');
    const aiDrawer = wrapper.querySelector('.layer-ai-drawer');
    const aiCloseBtn = wrapper.querySelector('.layer-ai-close');
    const aiLoadModelBtn = wrapper.querySelector('.layer-btn-load-model');
    const aiBadge = wrapper.querySelector('.layer-ai-badge');
    const aiChatHistory = wrapper.querySelector('.layer-ai-chat-history');
    const aiPromptInput = wrapper.querySelector('.layer-ai-prompt');
    const aiSendBtn = wrapper.querySelector('.layer-ai-send');
    const aiExplainBtn = wrapper.querySelector('.layer-ai-btn-explain');
    const aiRefactorBtn = wrapper.querySelector('.layer-ai-btn-refactor');
    const aiFixBtn = wrapper.querySelector('.layer-ai-btn-fix');
    const aiTestsBtn = wrapper.querySelector('.layer-ai-btn-tests');

    const aiModelSelect = wrapper.querySelector('.layer-ai-model-select');

    function populateModelHub() {
      if (!aiModelSelect) return;
      sendCommMessage('ai_get_models').then((res) => {
        if (res && res.models) {
          aiModelSelect.innerHTML = '';
          res.models.forEach((m) => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            opt.title = m.desc;
            aiModelSelect.appendChild(opt);
          });
          // Add Custom Model option
          const customOpt = document.createElement('option');
          customOpt.value = 'custom';
          customOpt.textContent = '➕ Custom HuggingFace Model...';
          aiModelSelect.appendChild(customOpt);
        }
      }).catch(() => {});
    }

    function toggleAIDrawer() {
      if (aiDrawer) {
        const isHidden = aiDrawer.style.display === 'none';
        aiDrawer.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) {
          updateAIStatus();
          populateModelHub();
        }
        if (monacoEditor) monacoEditor.layout();
      }
    }

    function updateAIStatus() {
      sendCommMessage('ai_get_status').then((res) => {
        if (res && aiBadge) {
          if (res.loaded) {
            aiBadge.textContent = `Model: ${res.model_name} (${res.device.toUpperCase()})`;
            aiBadge.style.backgroundColor = '#059669';
            aiBadge.style.color = '#ffffff';
          } else if (res.is_loading) {
            aiBadge.textContent = 'Loading model...';
            aiBadge.style.backgroundColor = '#d97706';
          } else {
            aiBadge.textContent = 'Model: Not Loaded';
            aiBadge.style.backgroundColor = '#374151';
          }
        }
      }).catch(() => {});
    }

    function sendAIPrompt(taskType = 'chat', customPrompt = '') {
      const userPrompt = customPrompt || (aiPromptInput ? aiPromptInput.value.trim() : '');
      if (!userPrompt && taskType === 'chat') return;

      let codeContext = '';
      if (monacoEditor) {
        const selection = monacoEditor.getSelection();
        if (selection && !selection.isEmpty()) {
          codeContext = monacoEditor.getModel().getValueInRange(selection);
        } else {
          codeContext = monacoEditor.getValue();
        }
      }

      appendAIMessage('user', userPrompt || taskType);
      if (aiPromptInput) aiPromptInput.value = '';
      statusTextEl.textContent = 'AI generating response...';

      sendCommMessage('ai_instruct', {
        prompt: userPrompt,
        code_context: codeContext,
        task_type: taskType
      }).then((res) => {
        if (res.error) {
          appendAIMessage('system', 'Error: ' + res.error);
          statusTextEl.textContent = 'AI Error';
        } else if (res.response) {
          appendAIMessage('assistant', res.response);
          statusTextEl.textContent = 'AI response generated';
        }
      }).catch((err) => {
        appendAIMessage('system', 'AI Request failed: ' + err.message);
        statusTextEl.textContent = 'AI Failed';
      });
    }

    function appendAIMessage(role, text) {
      if (!aiChatHistory) return;
      const msgEl = document.createElement('div');
      msgEl.className = `layer-ai-msg layer-ai-msg-${role}`;
      msgEl.textContent = text;
      
      if (role === 'assistant' && monacoEditor) {
        const insertBtn = document.createElement('button');
        insertBtn.className = 'layer-btn';
        insertBtn.style.marginTop = '6px';
        insertBtn.style.fontSize = '10px';
        insertBtn.textContent = '📥 Insert into Editor';
        insertBtn.addEventListener('click', () => {
          const selection = monacoEditor.getSelection();
          if (selection && !selection.isEmpty()) {
            monacoEditor.executeEdits('ai', [{ range: selection, text: text, forceMoveMarkers: true }]);
          } else {
            monacoEditor.trigger('keyboard', 'type', { text: text });
          }
          showToast('Inserted AI output', 'success');
        });
        msgEl.appendChild(document.createElement('br'));
        msgEl.appendChild(insertBtn);
      }

      aiChatHistory.appendChild(msgEl);
      aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
    }

    if (aiBtn) aiBtn.addEventListener('click', toggleAIDrawer);
    if (aiCloseBtn) aiCloseBtn.addEventListener('click', toggleAIDrawer);
    if (aiSendBtn) aiSendBtn.addEventListener('click', () => sendAIPrompt('chat'));
    if (aiExplainBtn) aiExplainBtn.addEventListener('click', () => sendAIPrompt('explain'));
    if (aiRefactorBtn) aiRefactorBtn.addEventListener('click', () => sendAIPrompt('refactor', 'Optimize and refactor code'));
    if (aiFixBtn) aiFixBtn.addEventListener('click', () => sendAIPrompt('fix', 'Fix bugs in code'));
    if (aiTestsBtn) aiTestsBtn.addEventListener('click', () => sendAIPrompt('generate_tests', 'Generate pytest unit tests'));

    if (aiLoadModelBtn) {
      aiLoadModelBtn.addEventListener('click', () => {
        let modelName = aiModelSelect ? aiModelSelect.value : 'Qwen/Qwen2.5-Coder-1.5B-Instruct';
        if (modelName === 'custom') {
          modelName = prompt('Enter custom HuggingFace model repo ID:', 'Qwen/Qwen2.5-Coder-7B-Instruct');
        }
        if (modelName) {
          if (aiBadge) {
            aiBadge.textContent = 'Downloading & Loading ' + modelName + '...';
            aiBadge.style.backgroundColor = '#d97706';
          }
          statusTextEl.textContent = 'Loading AI Model on GPU...';
          sendCommMessage('ai_load_model', { model_name: modelName }).then((res) => {
            if (res.error) showToast(res.error, 'error');
            else {
              showToast('Loaded AI Model: ' + modelName, 'success');
              updateAIStatus();
              statusTextEl.textContent = 'AI Model Ready on GPU';
            }
          }).catch((err) => showToast('Load error: ' + err.message, 'error'));
        }
      });
    }

    // Initialize Monaco
    initMonaco();
  };
})();
