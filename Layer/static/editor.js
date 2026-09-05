(function () {
  window.LayerDashEngine = function (config) {
    const instanceId = config.instanceId;
    const commTarget = config.commTarget;
    const initialRoot = config.rootPath;
    const initialFile = config.initialFile;

    const wrapper = document.getElementById('layer-dash-' + instanceId);
    if (!wrapper) return;

    // DOM Elements
    const treeEl = wrapper.querySelector('.layer-file-tree');
    const tabsEl = wrapper.querySelector('.layer-tabs');
    const editorContainer = wrapper.querySelector('.layer-editor-container');
    const emptyState = wrapper.querySelector('.layer-empty-state');
    const breadcrumbsEl = wrapper.querySelector('.layer-breadcrumbs');
    const statusTextEl = wrapper.querySelector('.layer-status-text');
    const cursorPosEl = wrapper.querySelector('.layer-cursor-pos');
    const terminalEl = wrapper.querySelector('.layer-terminal');
    const terminalContentEl = wrapper.querySelector('.layer-terminal-content');
    const saveBtn = wrapper.querySelector('.layer-btn-save');
    const runBtn = wrapper.querySelector('.layer-btn-run');
    const newFileBtn = wrapper.querySelector('.layer-btn-new-file');
    const newFolderBtn = wrapper.querySelector('.layer-btn-new-folder');
    const refreshBtn = wrapper.querySelector('.layer-btn-refresh');

    let monacoEditor = null;
    let comm = null;
    let openTabs = []; // { rel_path, name, model, is_dirty, language }
    let activeTabPath = null;

    // --- Communication Bridge ---
    function sendCommMessage(action, payload = {}) {
      return new Promise((resolve, reject) => {
        const msgData = { action: action, ...payload };

        // 1. Check Google Colab Kernel
        if (window.google && window.google.colab && window.google.colab.kernel) {
          window.google.colab.kernel
            .invokeFunction('layer_dash_' + instanceId, [msgData], {})
            .then((res) => {
              if (res && res.data && res.data['application/json']) {
                resolve(res.data['application/json']);
              } else {
                resolve(res);
              }
            })
            .catch((err) => reject(err));
          return;
        }

        // 2. Check Jupyter Notebook / Kaggle Kernel Comm
        if (!comm) {
          if (window.Jupyter && window.Jupyter.notebook && window.Jupyter.notebook.kernel) {
            comm = window.Jupyter.notebook.kernel.comm_manager.new_comm(commTarget, { instanceId });
          } else if (window.ipywidgets && window.ipywidgets.Comm) {
            comm = new window.ipywidgets.Comm(commTarget, { instanceId });
          }
        }

        if (comm) {
          const msgId = 'msg_' + Math.random().toString(36).substr(2, 9);
          msgData._msgId = msgId;

          const handler = (msg) => {
            const res = msg.content.data;
            if (res._msgId === msgId || !res._msgId) {
              comm.un_msg(handler);
              if (res.error) reject(new Error(res.error));
              else resolve(res);
            }
          };

          comm.on_msg(handler);
          comm.send(msgData);

          // Timeout fallback
          setTimeout(() => {
            comm.un_msg(handler);
            reject(new Error('Backend response timeout for action: ' + action));
          }, 10000);
        } else {
          // Direct fallback attempt via global window bridge if available
          if (window['layer_bridge_' + instanceId]) {
            window['layer_bridge_' + instanceId](msgData, resolve, reject);
          } else {
            showToast('No Jupyter Comm or Colab channel detected.', 'error');
            reject(new Error('No notebook comm channel available.'));
          }
        }
      });
    }

    // --- Toast Notifications ---
    function showToast(message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = 'layer-toast';
      if (type === 'error') toast.style.borderColor = 'var(--layer-danger)';
      if (type === 'success') toast.style.borderColor = 'var(--layer-success)';
      toast.textContent = message;
      wrapper.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    // --- Initialize Monaco Editor ---
    function initMonaco() {
      if (window.monaco) {
        setupEditorInstance();
      } else {
        if (!window.require) {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/require.js/2.3.6/require.min.js';
          script.onload = loadMonacoCDN;
          document.head.appendChild(script);
        } else {
          loadMonacoCDN();
        }
      }
    }

    function loadMonacoCDN() {
      window.require.config({
        paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }
      });
      window.require(['vs/editor/editor.main'], function () {
        setupEditorInstance();
      });
    }

    function setupEditorInstance() {
      emptyState.style.display = 'none';
      monacoEditor = monaco.editor.create(editorContainer, {
        value: '',
        language: 'python',
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 13,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        renderWhitespace: 'selection',
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

      // Load File Explorer Tree
      loadTree("");

      if (initialFile) {
        openFile(initialFile);
      }
    }

    // --- File Tree Renderer ---
    function loadTree(relPath = "") {
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
        container.innerHTML = '<div style="padding:10px; font-size:12px; color:var(--layer-text-muted);">Empty folder</div>';
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

        itemEl.addEventListener('click', (e) => {
          e.stopPropagation();
          wrapper.querySelectorAll('.layer-tree-item').forEach((el) => el.classList.remove('active'));
          itemEl.classList.add('active');

          if (item.is_dir) {
            arrow.classList.toggle('expanded');
            let subContainer = itemEl.nextElementSibling;
            if (subContainer && subContainer.classList.contains('layer-subtree')) {
              subContainer.style.display = subContainer.style.display === 'none' ? 'block' : 'none';
            } else {
              subContainer = document.createElement('div');
              subContainer.className = 'layer-subtree';
              subContainer.style.paddingLeft = '12px';
              itemEl.after(subContainer);
              sendCommMessage('list_dir', { rel_path: item.rel_path }).then((res) => {
                renderTreeItems(res.items, subContainer);
              });
            }
          } else {
            openFile(item.rel_path);
          }
        });

        container.appendChild(itemEl);
      });
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

          const model = monaco.editor.createModel(data.content, data.language);
          const tab = {
            rel_path: relPath,
            name: relPath.split('/').pop(),
            model: model,
            is_dirty: false,
            language: data.language,
          };

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
      monacoEditor.setModel(tab.model);
      breadcrumbsEl.textContent = relPath;
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

      tab.model.dispose();
      openTabs.splice(index, 1);

      if (activeTabPath === relPath) {
        if (openTabs.length > 0) {
          const nextTab = openTabs[Math.max(0, index - 1)];
          switchTab(nextTab.rel_path);
        } else {
          activeTabPath = null;
          monacoEditor.setModel(monaco.editor.createModel('', 'plaintext'));
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

        tabEl.addEventListener('click', () => switchTab(tab.rel_path));
        tabsEl.appendChild(tabEl);
      });
    }

    // --- Actions: Save & Run ---
    function saveActiveFile() {
      if (!activeTabPath) return;
      const tab = openTabs.find((t) => t.rel_path === activeTabPath);
      if (!tab) return;

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
      terminalEl.style.display = 'flex';
      terminalContentEl.innerHTML = '<span style="color:#60a5fa">Executing ' + activeTabPath + '...</span>\n';
      statusTextEl.textContent = 'Running ' + activeTabPath + '...';

      sendCommMessage('run_script', { rel_path: activeTabPath })
        .then((res) => {
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
          terminalContentEl.innerHTML += `<span class="layer-terminal-stderr">Execution error: ${err.message}</span>\n`;
          statusTextEl.textContent = 'Execution failed';
        });
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // --- Toolbar Event Listeners ---
    if (saveBtn) saveBtn.addEventListener('click', saveActiveFile);
    if (runBtn) runBtn.addEventListener('click', runActiveFile);
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadTree());

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

    // Initialize Monaco
    initMonaco();
  };
})();
