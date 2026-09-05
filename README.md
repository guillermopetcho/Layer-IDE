# Layer IDE (Layer Notebook Dash) 🚀

Un Entorno de Desarrollo Integrado (**IDE**) interactivo, moderno y profesional tipo VS Code, diseñado para ejecutarse directamente dentro de **Kaggle Notebooks**, **Google Colab**, **JupyterLab** y **Jupyter Notebook**.

Con `Layer.Dash(".")`, obtendrás una experiencia de edición de código completa dentro de tu notebook: explora archivos, crea carpetas, edita con resaltado de sintaxis, formatea código, previsualiza imágenes, ejecuta scripts y **carga modelos masivos de IA para código en las GPUs de Kaggle/Colab**.

---

## ✨ Características Principales

### 🤖 Copiloto de IA & Catálogo de Modelos de Código Abierto (Kaggle GPU)
- **Carga de Modelos LLM en GPU**: Integra un motor automatizado (`Layer.load_model(...)` y el panel `🤖 AI Copilot`) para descargar e instanciar modelos de código en GPU con **cuantización de 4 bits (`bitsandbytes nf4`)** y distribución multi-GPU (`device_map="auto"`).
- **Catálogo Integrado de Modelos**:
  - 🧠 **Qwen 2.5 Coder 32B / 14B / 7B / 1.5B Instruct**
  - 🚀 **DeepSeek-Coder 6.7B / 1.3B Instruct**
  - 🦙 **CodeLlama 7B Python / Instruct**
  - ➕ Posibilidad de cargar cualquier modelo personalizado de HuggingFace.
- **Acciones Rápidas de IA**: Botones integrados para **Explicar**, **Refactorizar**, **Corregir Bugs** y **Generar Tests** sobre el código activo.

### 🎨 Editor Profesional y Experiencia Visual
- **Motor Monaco Editor**: El mismo editor que impulsa VS Code con auto-completado, minimapa, búsqueda, selección múltiple y sintaxis para más de 30 lenguajes.
- **Divisores Arrastrables (Resizable Splitters)**: Redimensiona libremente el Explorador lateral y el Panel de Terminal inferior.
- **Visualizador de Imágenes Integrado**: Previsualización nativa de archivos PNG, JPG, JPEG, GIF, SVG y WEBP en pestañas dedicadas.
- **Formateador de Código Python**: Botón ✨ **Format** para auto-formatear código con `autopep8` / `black`.
- **Menú Contextual (Clic Derecho)**: Acciones rápidas en el explorador para crear, renombrar, duplicar y eliminar archivos o carpetas.
- **Filtro de Archivos**: Barra de búsqueda rápida en el explorador para filtrar archivos instantáneamente.
- **Selector de Temas**: Cambia entre **🌙 Dark** (`vs-dark`), **☀️ Light** (`vs`) y **⚡ High Contrast** (`hc-black`).
- **Cronómetro de Ejecución**: Muestra el tiempo de ejecución exacto de tus scripts en la terminal.

### 🔒 Compatibilidad Total con Kaggle, Colab y Jupyter
- **Puente Comm Multi-Marco & Fallback RPC**: Diseñado específicamente para funcionar dentro de los `<iframe>` aislados de celdas de salida de Kaggle y Colab.
- **Resolución de Rutas Kaggle**: Soporte nativo para rutas `/kaggle/working/`, `/kaggle/input/`, enlaces simbólicos y rutas absolutas fuera del workspace.

---

## ⚡ Inicio Rápido en Kaggle

Ejecuta el siguiente bloque de código en una celda de tu notebook de **Kaggle** (con aceleración de GPU activada si deseas usar modelos de IA):

```python
# 1. Clonar o actualizar Layer IDE en la sesión de Kaggle
!git clone https://github.com/guillermopetcho/Layer-IDE.git /tmp/Layer-IDE 2>/dev/null || (cd /tmp/Layer-IDE && git pull)
import sys
if '/tmp/Layer-IDE' not in sys.path:
    sys.path.insert(0, '/tmp/Layer-IDE')

# 2. Importar e iniciar Layer IDE en el directorio actual (/kaggle/working)
import Layer
Layer.Dash(".")
```

---

## 📦 Instalación Estándar

Vía `pip`:

```bash
pip install layer-notebook-dash
```

O para desarrollo local:

```bash
git clone https://github.com/guillermopetcho/Layer-IDE.git
cd Layer-IDE
pip install -e .
```

---

## 🚀 Uso en Python

```python
import Layer

# Abrir el IDE en el directorio actual
Layer.Dash(".")

# Abrir el IDE en una carpeta específica
Layer.Dash("mi_proyecto/src")

# Abrir el IDE enfocado en un script específico
Layer.Dash("main.py")
```

### Sintaxis alternativas de importación
```python
import layer
layer.Dash(".")

from layer import Dash
Dash(".")
```

---

## 🤖 Carga de Modelos de IA desde Python (Kaggle GPU)

También puedes cargar los modelos de código directamente vía Python antes o después de abrir el IDE:

```python
import Layer

# Cargar Qwen 2.5 Coder 14B en 4-bit para Kaggle T4 GPUs
Layer.load_model("Qwen/Qwen2.5-Coder-14B-Instruct", load_in_4bit=True)

# Iniciar el IDE
Layer.Dash(".")
```

---

## ⚙️ Parámetros de `Layer.Dash`

`Layer.Dash(path=".", height="600px", theme="vs-dark", initial_file=None)`

| Parámetro | Tipo | Defecto | Descripción |
|---|---|---|---|
| `path` | `str` | `"."` | Ruta del directorio o archivo a abrir en el IDE. |
| `height` | `str` | `"600px"` | Altura del contenedor del IDE en la salida de la celda. |
| `theme` | `str` | `"vs-dark"` | Tema de Monaco Editor (`"vs-dark"`, `"vs"`, `"hc-black"`). |
| `initial_file` | `str` | `None` | Nombre o ruta relativa del archivo a abrir inicialmente. |

---

## ⌨️ Atajos de Teclado

| Atajo | Acción |
|---|---|
| <kbd>Ctrl + S</kbd> / <kbd>Cmd + S</kbd> | Guardar archivo activo |
| <kbd>Ctrl + Enter</kbd> / <kbd>Cmd + Enter</kbd> | Ejecutar script Python activo |
| <kbd>Clic Derecho</kbd> | Abrir menú contextual en el árbol de archivos |
| <kbd>Clic Central</kbd> | Cerrar pestaña de archivo |

---

## 🧪 Pruebas Unitarias

Para ejecutar el conjunto de pruebas unitarias automáticas:

```bash
pytest tests/
```

---

## 📄 Licencia

MIT License © 2026 Guillermo Petcho
