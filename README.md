# Layer Notebook Dash 🚀

An interactive web-based Code Editor (IDE) embedded directly inside **Kaggle Notebooks**, **Google Colab**, **JupyterLab**, and **Jupyter Notebook** cell outputs.

With `Layer.Dash("ruta")`, you get a full VS Code-like editing experience inside your notebook, allowing you to explore directories, create, edit, save, and run code files directly without leaving your notebook interface.

---

## ✨ Features

- **Monaco Editor Engine**: The code editor powering VS Code with auto-completion, line numbers, minimap, search & replace, and syntax highlighting for 30+ languages (Python, JavaScript, TypeScript, HTML, CSS, JSON, SQL, Markdown, C++, YAML, etc.).
- **Interactive File Explorer**: Full directory tree navigation with expandable folders, file creation, folder creation, item renaming, and deletion.
- **Multi-Tab Interface**: Open multiple files simultaneously with visual dirty indicators (`•`) for unsaved edits.
- **Integrated Python Execution**: Run `.py` scripts directly from the editor (`Ctrl+Enter` or ▶ Run button) and stream output to an integrated terminal panel.
- **100% Kaggle & Colab Compatible**: Built on native IPython Comm Channels and Colab kernel callbacks—no HTTP servers, custom ports, or CORS issues.
- **VS Code Shortcuts**:
  - `Ctrl+S` / `Cmd+S`: Save active file.
  - `Ctrl+Enter` / `Cmd+Enter`: Run active Python file.

---

## 📦 Installation

In Kaggle, Colab, or local Jupyter:

```bash
pip install layer-notebook-dash
```

Or for local development:

```bash
git clone https://github.com/layer/layer-notebook-dash.git
cd Layer-Notebook-Dash
pip install -e .
```

---

## 🚀 Quickstart

### 1. Basic Usage in Kaggle / Jupyter

```python
import Layer

# Open IDE for current directory
Layer.Dash(".")
```

Or for a specific directory or file:

```python
import Layer

# Open IDE for a specific folder
Layer.Dash("my_project/src")

# Open IDE focused on a specific script
Layer.Dash("train.py")
```

### 2. Alternative Import Syntaxes

```python
# Lowercase package import
import layer
layer.Dash(".")

# Direct class import
from layer import Dash
Dash("src")
```

---

## ⚙️ Parameters

`Layer.Dash(path=".", height="600px", theme="vs-dark", initial_file=None)`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `path` | `str` | `"."` | Path to directory or file to open in the IDE. |
| `height` | `str` | `"600px"` | Height of the inline IDE widget container. |
| `theme` | `str` | `"vs-dark"` | Monaco Editor theme (`"vs-dark"` or `"vs"`). |
| `initial_file` | `str` | `None` | Relative path of file to auto-open on load. |

---

## 🛠️ Development & Testing

Run unit tests:

```bash
pytest tests/
```

---

## 📄 License

MIT License.
