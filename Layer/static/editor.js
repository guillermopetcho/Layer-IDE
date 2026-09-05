(function () {
  window.LayerDashEngine = function (config) {
    const instanceId = config.instanceId;
    const commTarget = config.commTarget;
    const initialRoot = config.rootPath;
    const initialFile = config.initialFile;

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
    const breadcrumbsEl = wrapper.querySelector('.layer-breadcrumbs');
    const statusTextEl = wrapper.querySelector('.layer-status-text');
    const statusLangEl = wrapper.querySelector('.layer-status-lang');
    const cursorPosEl = wrapper.querySelector('.layer-cursor-pos');
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

    let monacoEditor = null;
    let comm = null;
    let openTabs = []; // { rel_path, name, model, is_dirty, language, is_image, image_src }
    let activeTabPath = null;
    let currentTreeItems = [];
    let imageViewerEl = null;

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
          }, 15000);
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

      // Load File Explorer Tree
      loadTree('');

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
    function loadTree(relPath = '') {
      sendCommMessage('list_dir', { rel_path: relPath })
        .then((data) => {
          if (data.error) {
            showToast(data.error, 'error');
            return;
          }
          if (relPath === '') {
            currentTreeItems = data.items;
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

        // Click event
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
            tab.model = monaco.editor.createModel(data.content, data.language);
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

      if (tab.model) tab.model.dispose();
      openTabs.splice(index, 1);

      if (activeTabPath === relPath) {
        if (openTabs.length > 0) {
          const nextTab = openTabs[Math.max(0, index - 1)];
          switchTab(nextTab.rel_path);
        } else {
          activeTabPath = null;
          if (monacoEditor) monacoEditor.setModel(monaco.editor.createModel('', 'plaintext'));
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
      themeSelect.addEventListener('change', (e) => {
        const theme = e.target.value;
        if (window.monaco) monaco.editor.setTheme(theme);
      });
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

    // Initialize Monaco
    initMonaco();
  };
})();
