import os
import json
import uuid
from pathlib import Path
from IPython.display import HTML, display as ipy_display
from Layer.file_manager import FileManager

# Read bundled static assets
STATIC_DIR = Path(__file__).parent / "static"

def _read_asset(filename: str) -> str:
    asset_path = STATIC_DIR / filename
    if asset_path.exists():
        with open(asset_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""

KAGGLE_ENV_VARS = ("KAGGLE_KERNEL_RUN_TYPE", "KAGGLE_URL_BASE", "KAGGLE_DATA_PROXY_TOKEN")

def _detect_kaggle_working_dir():
    """Detect a live Kaggle kernel and return its working directory, or None.

    Requires both a Kaggle-specific env var AND the actual mount to exist,
    so this never misfires on a machine that merely happens to have a
    '/kaggle/working' folder lying around outside of a real Kaggle kernel.
    """
    kaggle_working = Path("/kaggle/working")
    if any(os.environ.get(var) for var in KAGGLE_ENV_VARS) and kaggle_working.is_dir():
        return str(kaggle_working)
    return None

class Dash:
    """
    Layer.Dash: Interactive Code Editor IDE for Kaggle and Jupyter Notebooks.
    
    Usage:
        import Layer
        Layer.Dash(".")
        Layer.Dash("path/to/directory")
        Layer.Dash("path/to/script.py")
    """

    def __init__(
        self,
        path: str = ".",
        height: str = "600px",
        theme: str = "vs-dark",
        initial_file: str = None,
        display_inline: bool = False
    ):
        if path == ".":
            kaggle_working_dir = _detect_kaggle_working_dir()
            if kaggle_working_dir:
                path = kaggle_working_dir

        self.path = path
        self.height = height
        self.theme = theme
        self.instance_id = uuid.uuid4().hex[:8]
        self.comm_target = f"layer_dash_comm_{self.instance_id}"
        self.file_manager = FileManager(path)
        self.initial_file = initial_file or (
            self.file_manager.target_file.name if self.file_manager.target_file else None
        )

        self._register_comm_target()
        self._register_colab_callback()
        self._register_global_rpc()

        if display_inline:
            ipy_display(self._render_html())

    def handle_message(self, data: dict) -> dict:
        """Process incoming RPC comm messages from the JS frontend IDE."""
        action = data.get("action")
        msg_id = data.get("_msgId")

        response = {}
        try:
            if action == "list_dir":
                response = self.file_manager.list_dir(data.get("rel_path", ""))
            elif action == "list_tree":
                response = self.file_manager.list_tree(
                    data.get("rel_path", ""),
                    data.get("max_depth", 8),
                    data.get("max_entries", 3000),
                )
            elif action == "read_file":
                response = self.file_manager.read_file(data.get("rel_path", ""))
            elif action == "write_file":
                response = self.file_manager.write_file(
                    data.get("rel_path", ""), data.get("content", "")
                )
            elif action == "create_file":
                response = self.file_manager.create_file(data.get("rel_path", ""))
            elif action == "create_dir":
                response = self.file_manager.create_dir(data.get("rel_path", ""))
            elif action == "delete_item":
                response = self.file_manager.delete_item(data.get("rel_path", ""))
            elif action == "rename_item":
                response = self.file_manager.rename_item(
                    data.get("old_rel_path", ""), data.get("new_rel_path", "")
                )
            elif action == "duplicate_item":
                response = self.file_manager.duplicate_item(data.get("rel_path", ""))
            elif action == "format_code":
                response = self.file_manager.format_code(
                    data.get("rel_path", ""), data.get("content", None)
                )
            elif action == "run_script":
                response = self.file_manager.run_script(data.get("rel_path", ""))
            elif action == "ai_get_status":
                from Layer.ai_engine import ai_engine
                response = ai_engine.get_status()
            elif action == "ai_get_models":
                from Layer.ai_engine import ai_engine
                response = {"models": ai_engine.get_available_models()}
            elif action == "ai_load_model":
                from Layer.ai_engine import ai_engine
                response = ai_engine.load_hf_model(
                    data.get("model_name", "Qwen/Qwen2.5-Coder-1.5B-Instruct"),
                    data.get("load_in_4bit", False)
                )
            elif action == "ai_instruct":
                from Layer.ai_engine import ai_engine
                response = ai_engine.instruct(
                    data.get("prompt", ""),
                    data.get("code_context", ""),
                    data.get("task_type", "chat")
                )
            else:
                response = {"error": f"Unknown action: {action}"}
        except Exception as e:
            response = {"error": str(e)}

        if msg_id:
            response["_msgId"] = msg_id
        return response

    def _register_comm_target(self):
        """Register IPython Kernel comm target for standard Jupyter / Kaggle environment."""
        try:
            from IPython import get_ipython
            ip = get_ipython()
            if ip and hasattr(ip, "kernel") and hasattr(ip.kernel, "comm_manager"):
                def comm_opened(comm, open_msg):
                    @comm.on_msg
                    def _recv(msg):
                        req_data = msg["content"]["data"]
                        res_data = self.handle_message(req_data)
                        comm.send(res_data)

                ip.kernel.comm_manager.register_target(self.comm_target, comm_opened)
        except Exception:
            pass

    def _register_colab_callback(self):
        """Register Google Colab output callback for Colab environment."""
        try:
            from google.colab import output
            def colab_handler(msg_data):
                return self.handle_message(msg_data)
            output.register_callback(f"layer_dash_{self.instance_id}", colab_handler)
        except ImportError:
            pass

    def _register_global_rpc(self):
        """Register global Python RPC instance for iframe/kernel.execute fallback."""
        import builtins
        if not hasattr(builtins, "_layer_dash_instances"):
            builtins._layer_dash_instances = {}
        builtins._layer_dash_instances[self.instance_id] = self

        if not hasattr(builtins, "_layer_rpc_call"):
            def _rpc(instance_id, data):
                inst = builtins._layer_dash_instances.get(instance_id)
                if inst:
                    if isinstance(data, str):
                        data = json.loads(data)
                    return inst.handle_message(data)
                return {"error": f"Dash instance {instance_id} not found"}
            builtins._layer_rpc_call = _rpc

    def _render_html(self) -> HTML:
        """Render complete HTML+CSS+JS widget template for IPython output."""
        css = _read_asset("styles.css")
        js = _read_asset("editor.js")

        root_name = self.file_manager.root_path.name or str(self.file_manager.root_path)
        # Compare against the resolved root (not the raw `path` argument) so
        # this doesn't misfire on a trailing slash or a relative path that
        # happens to resolve to the same real directory.
        kaggle_detected = str(self.file_manager.root_path) == "/kaggle/working"

        from Layer.ai_engine import PRESET_MODELS
        model_options = "\n".join(
            [f'                  <option value="{m["id"]}" title="{m["desc"]}">{m["name"]}</option>' for m in PRESET_MODELS]
        ) + '\n                  <option value="custom">➕ Custom HuggingFace Model...</option>'

        html_content = f"""
        <style>
        {css}
        </style>

        <div id="layer-dash-{self.instance_id}" class="layer-dash-wrapper" style="height: {self.height};">
          <!-- Top Header -->
          <div class="layer-header">
            <div class="layer-brand">
              <div class="layer-brand-logo">L</div>
              <span>Layer Dash</span>
              <span class="layer-breadcrumbs">{root_name}</span>
            </div>
            <div class="layer-actions">
              <select class="layer-theme-select" title="Change Editor Theme">
                <option value="vs-dark" selected>🌙 Dark</option>
                <option value="vs">☀️ Light</option>
                <option value="hc-black">⚡ High Contrast</option>
              </select>
              <button class="layer-btn layer-btn-format" title="Format Python Code">✨ Format</button>
              <button class="layer-btn layer-btn-ai" title="AI Code Copilot">🤖 AI Copilot</button>
              <button class="layer-btn layer-btn-save" title="Save file (Ctrl+S)">💾 Save</button>
              <button class="layer-btn layer-btn-success layer-btn-run" title="Run Python file (Ctrl+Enter)">▶ Run</button>
              <button class="layer-icon-btn layer-btn-fullscreen" title="Toggle Fullscreen">⛶</button>
              <button class="layer-icon-btn layer-btn-help" title="Keyboard Shortcuts">❓</button>
            </div>
          </div>

          <!-- Main IDE Body -->
          <div class="layer-body">
            <!-- Sidebar File Tree -->
            <div class="layer-sidebar">
              <div class="layer-sidebar-header">
                <span>Explorer</span>
                <div class="layer-sidebar-actions">
                  <button class="layer-icon-btn layer-btn-new-file" title="New File">+</button>
                  <button class="layer-icon-btn layer-btn-new-folder" title="New Folder">📁</button>
                  <button class="layer-icon-btn layer-btn-refresh" title="Refresh Tree">🔄</button>
                </div>
              </div>
              <div class="layer-search-container">
                <input type="text" class="layer-search-input" placeholder="🔍 Filter files..." autocomplete="off" spellcheck="false" value="" />
              </div>
              <div class="layer-file-tree">
                <!-- File Tree Items Dynamically Loaded -->
              </div>
            </div>

            <!-- Vertical Drag Splitter -->
            <div class="layer-splitter-v"></div>

            <!-- Main Editor View -->
            <div class="layer-main">
              <!-- Tab Bar -->
              <div class="layer-tabs">
                <!-- Open file tabs -->
              </div>

              <!-- Editor Container -->
              <div class="layer-editor-container">
                <div class="layer-empty-state">
                  <div class="layer-empty-boot">
                    <div class="layer-spinner"></div>
                    <div style="font-size: 13px; font-weight: 500; margin-top: 8px;">Cargando editor...</div>
                  </div>
                  <div class="layer-empty-ready" style="display: none;">
                    <div style="font-size: 36px; margin-bottom: 4px;">⚡ Layer IDE</div>
                    <div style="font-size: 14px; font-weight: 500;">Select a file from the explorer to begin editing</div>
                    <div style="font-size: 11px; opacity: 0.7; margin-top: 6px;">
                      Shortcuts: <kbd>Ctrl+S</kbd> Save | <kbd>Ctrl+Enter</kbd> Run | <kbd>Right-Click</kbd> Context Menu
                    </div>
                  </div>
                </div>
              </div>

              <!-- Horizontal Drag Splitter -->
              <div class="layer-splitter-h" style="display: none;"></div>

              <!-- Output Terminal Panel -->
              <div class="layer-terminal" style="display: none;">
                <div class="layer-terminal-header">
                  <div class="layer-terminal-title">
                    <span>⚡ Execution Output</span>
                    <span class="layer-exec-timer" style="margin-left: 10px; opacity: 0.8; font-size: 11px;"></span>
                  </div>
                  <div class="layer-terminal-actions">
                    <button class="layer-btn layer-btn-clear-term" style="padding: 2px 6px; font-size: 10px;">Clear</button>
                    <button class="layer-icon-btn" onclick="this.closest('.layer-terminal').style.display='none'; this.closest('.layer-main').querySelector('.layer-splitter-h').style.display='none';">✕</button>
                  </div>
                </div>
                <div class="layer-terminal-content"></div>
              </div>
            </div>

            <!-- AI Copilot Drawer Panel -->
            <div class="layer-ai-drawer" style="display: none;">
              <div class="layer-ai-header">
                <span>🤖 AI Code Copilot</span>
                <button class="layer-icon-btn layer-ai-close">✕</button>
              </div>
              <div class="layer-ai-model-status">
                <span class="layer-ai-badge">Model: Not Loaded</span>
              </div>
              <div class="layer-ai-model-hub" style="padding: 6px 10px; border-bottom: 1px solid var(--layer-border); display: flex; flex-direction: column; gap: 6px;">
                <label style="font-size: 10px; color: var(--layer-text-muted); font-weight: 600;">HUGGINGFACE MODEL CATALOG:</label>
                <select class="layer-ai-model-select" style="background: var(--layer-bg-dark); color: white; border: 1px solid var(--layer-border); padding: 4px; border-radius: 4px; font-size: 11px; width: 100%;">
{model_options}
                </select>
                <button class="layer-btn layer-btn-primary layer-btn-load-model" style="font-size: 11px; justify-content: center;">⚡ Load on GPU</button>
              </div>
              <div class="layer-ai-actions-bar">
                <button class="layer-btn layer-ai-btn-explain">📝 Explain</button>
                <button class="layer-btn layer-ai-btn-refactor">✨ Refactor</button>
                <button class="layer-btn layer-ai-btn-fix">🐞 Fix Bug</button>
                <button class="layer-btn layer-ai-btn-tests">🧪 Tests</button>
              </div>
              <div class="layer-ai-chat-history">
                <div class="layer-ai-msg layer-ai-msg-system">
                  Welcome to AI Copilot! Load a model (e.g. Qwen2.5-Coder) or type a prompt below to generate code.
                </div>
              </div>
              <div class="layer-ai-input-box">
                <textarea class="layer-ai-prompt" placeholder="Ask AI to generate or refactor code..."></textarea>
                <button class="layer-btn layer-btn-primary layer-ai-send">Send</button>
              </div>
            </div>
          </div>

          <!-- Bottom Status Bar -->
          <div class="layer-statusbar">
            <div class="layer-statusbar-group">
              <span class="layer-conn-dot" title="Estado de conexión con el kernel"></span>
              <span class="layer-status-text">Ready</span>
              <span class="layer-status-lang" style="opacity: 0.8; font-size: 10px;">python</span>
            </div>
            <div class="layer-statusbar-group">
              <span class="layer-cursor-pos">Ln 1, Col 1</span>
              <span class="layer-status-encoding">UTF-8</span>
            </div>
          </div>

          <!-- Context Menu -->
          <div class="layer-context-menu" style="display: none;"></div>

          <!-- Connection Diagnostic Modal (shown automatically if no comm channel is found) -->
          <div class="layer-modal layer-diagnostic-modal" style="display: none;">
            <div class="layer-modal-content" style="width: 560px;">
              <div class="layer-modal-header">
                <span>⚠️ Diagnóstico de Conexión</span>
                <button class="layer-icon-btn layer-diagnostic-close">✕</button>
              </div>
              <div class="layer-modal-body">
                <p style="font-size: 12px; margin-bottom: 8px; color: var(--layer-text-muted);">
                  No se pudo conectar con el kernel del notebook. Seleccioná y copiá este texto para compartirlo y diagnosticar la causa:
                </p>
                <pre class="layer-diagnostic-content"></pre>
              </div>
            </div>
          </div>

          <!-- Help Modal -->
          <div class="layer-modal layer-help-modal" style="display: none;">
            <div class="layer-modal-content">
              <div class="layer-modal-header">
                <span>Keyboard Shortcuts & Tips</span>
                <button class="layer-icon-btn layer-modal-close">✕</button>
              </div>
              <div class="layer-modal-body">
                <table class="layer-shortcuts-table">
                  <tr><td><kbd>Ctrl + S</kbd></td><td>Save current file</td></tr>
                  <tr><td><kbd>Ctrl + Enter</kbd></td><td>Run active Python script</td></tr>
                  <tr><td><kbd>Right-Click</kbd></td><td>File tree context menu (Rename, Duplicate, Delete)</td></tr>
                  <tr><td><kbd>Middle-Click</kbd></td><td>Close editor tab</td></tr>
                  <tr><td><kbd>Drag Splitters</kbd></td><td>Resize Explorer sidebar & Terminal panel</td></tr>
                </table>
              </div>
            </div>
          </div>

        </div>

        <script>
        {js}
        (function() {{
            if (window.LayerDashEngine) {{
                window.LayerDashEngine({{
                    instanceId: "{self.instance_id}",
                    commTarget: "{self.comm_target}",
                    rootPath: "{self.file_manager.root_path}",
                    initialFile: {json.dumps(self.initial_file)},
                    kaggleDetected: {json.dumps(kaggle_detected)}
                }});
            }}
        }})();
        </script>
        """
        return HTML(html_content)

    def _repr_html_(self):
        """Return HTML representation when notebook cell returns Dash instance."""
        return self._render_html().data
