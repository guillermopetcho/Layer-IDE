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
        display_inline: bool = True
    ):
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
            elif action == "run_script":
                response = self.file_manager.run_script(data.get("rel_path", ""))
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

    def _render_html(self) -> HTML:
        """Render complete HTML+CSS+JS widget template for IPython output."""
        css = _read_asset("styles.css")
        js = _read_asset("editor.js")

        root_name = self.file_manager.root_path.name or str(self.file_manager.root_path)

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
              <button class="layer-btn layer-btn-save" title="Save file (Ctrl+S)">💾 Save</button>
              <button class="layer-btn layer-btn-success layer-btn-run" title="Run Python file (Ctrl+Enter)">▶ Run</button>
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
              <div class="layer-file-tree">
                <!-- File Tree Items Dynamically Loaded -->
              </div>
            </div>

            <!-- Main Editor View -->
            <div class="layer-main">
              <!-- Tab Bar -->
              <div class="layer-tabs">
                <!-- Open file tabs -->
              </div>

              <!-- Editor Container -->
              <div class="layer-editor-container">
                <div class="layer-empty-state">
                  <div style="font-size: 32px;">📄</div>
                  <div>Select a file from the explorer to begin editing</div>
                  <div style="font-size: 11px; opacity: 0.7;">Shortcuts: Ctrl+S to save | Ctrl+Enter to run script</div>
                </div>
              </div>

              <!-- Output Terminal Panel -->
              <div class="layer-terminal" style="display: none;">
                <div class="layer-terminal-header">
                  <span>Execution Output</span>
                  <button class="layer-icon-btn" onclick="this.closest('.layer-terminal').style.display='none'">✕</button>
                </div>
                <div class="layer-terminal-content"></div>
              </div>
            </div>
          </div>

          <!-- Bottom Status Bar -->
          <div class="layer-statusbar">
            <span class="layer-status-text">Ready</span>
            <span class="layer-cursor-pos">Ln 1, Col 1</span>
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
                    initialFile: {json.dumps(self.initial_file)}
                }});
            }}
        }})();
        </script>
        """
        return HTML(html_content)

    def _repr_html_(self):
        """Return HTML representation when notebook cell returns Dash instance."""
        return self._render_html().data
