# Layer IDE (Layer Notebook Dash) 🚀

Un Entorno de Desarrollo Integrado (**IDE**) interactivo, moderno y profesional tipo VS Code, diseñado para ejecutarse directamente dentro de **Kaggle Notebooks**, **Google Colab**, **JupyterLab** y **Jupyter Notebook**.

Con `Layer.Dash(".")`, obtendrás una experiencia de edición de código completa dentro de tu notebook: explora archivos, crea carpetas, edita con resaltado de sintaxis, formatea código, previsualiza imágenes, ejecuta scripts y **carga modelos masivos de IA para código en las GPUs de Kaggle/Colab**.

---

## 📑 Índice

- [Características Principales](#-características-principales)
- [Inicio Rápido en Kaggle](#-inicio-rápido-en-kaggle)
- [Instalación Estándar](#-instalación-estándar)
- [Uso en Python](#-uso-en-python)
- [Carga de Modelos de IA](#-carga-de-modelos-de-ia-desde-python-kaggle-gpu)
- [Parámetros de `Layer.Dash`](#️-parámetros-de-layerdash)
- [Detección Automática de Kaggle](#-detección-automática-del-directorio-de-kaggle)
- [Exploración Recursiva del Árbol de Archivos](#-exploración-recursiva-del-árbol-de-archivos)
- [Editor de Respaldo (sin Monaco/CDN)](#️-editor-de-respaldo-cuando-monaco-no-puede-cargar)
- [Atajos de Teclado](#️-atajos-de-teclado)
- [Arquitectura Interna](#️-arquitectura-interna)
- [Estructura de Carpetas](#-estructura-de-carpetas)
- [Pruebas Unitarias](#-pruebas-unitarias)
- [Consideraciones de Seguridad](#️-consideraciones-de-seguridad)
- [Licencia](#-licencia)

---

## ✨ Características Principales

### 🤖 Copiloto de IA & Catálogo de Modelos de Código Abierto (Kaggle GPU)
- **Carga de Modelos LLM en GPU**: Integra un motor automatizado (`Layer.load_model(...)` y el panel `🤖 AI Copilot`) para descargar e instanciar modelos de código en GPU con **cuantización de 4 bits (`bitsandbytes nf4`)** y distribución multi-GPU (`device_map="auto"`).
- **Catálogo Integrado de Modelos**:
  - 🧠 **Qwen 2.5 Coder 32B / 14B / 7B / 1.5B Instruct**
  - 🚀 **DeepSeek-Coder 6.7B / 1.3B Instruct**
  - ⭐ **StarCoder 2 (3B)**
  - 🦙 **CodeLlama 7B Instruct**
  - ➕ Posibilidad de cargar cualquier modelo personalizado de HuggingFace.
- **Acciones Rápidas de IA**: Botones integrados para **Explicar**, **Refactorizar**, **Corregir Bugs** y **Generar Tests** sobre el código activo (o solo la selección actual).
- **Inserción con un clic**: cada respuesta del copiloto trae un botón "📥 Insert into Editor" para volcar el resultado directamente en el cursor o reemplazar la selección.

### 🎨 Editor Profesional y Experiencia Visual
- **Motor Monaco Editor**: El mismo editor que impulsa VS Code con auto-completado, minimapa, búsqueda, selección múltiple y sintaxis para más de 30 lenguajes.
- **Editor de respaldo automático**: si Monaco no puede cargarse (por ejemplo, por una red bloqueada o una política de seguridad del navegador), Layer IDE cae automáticamente a un editor de texto plano funcional en vez de quedar en blanco — ver la [sección dedicada](#️-editor-de-respaldo-cuando-monaco-no-puede-cargar).
- **Divisores Arrastrables (Resizable Splitters)**: Redimensiona libremente el Explorador lateral y el Panel de Terminal inferior.
- **Visualizador de Imágenes Integrado**: Previsualización nativa de archivos PNG, JPG, JPEG, GIF, SVG y WEBP en pestañas dedicadas.
- **Formateador de Código Python**: Botón ✨ **Format** para auto-formatear código con `autopep8` / `black`.
- **Menú Contextual (Clic Derecho)**: Acciones rápidas en el explorador para renombrar, duplicar, copiar ruta relativa y eliminar archivos o carpetas.
- **Filtro de Archivos**: Barra de búsqueda rápida en el explorador para filtrar archivos instantáneamente.
- **Selector de Temas**: Cambia entre **🌙 Dark** (`vs-dark`), **☀️ Light** (`vs`) y **⚡ High Contrast** (`hc-black`).
- **Cronómetro de Ejecución**: Muestra el tiempo de ejecución exacto de tus scripts en la terminal.

### 🗃️ Explorador de Archivos Inteligente

- **Escaneo recursivo completo al abrir**: todo el árbol de directorios se lee de una sola vez y se muestra ya expandido, en lugar de tener que hacer clic carpeta por carpeta — ver [Exploración Recursiva del Árbol de Archivos](#-exploración-recursiva-del-árbol-de-archivos).
- **Límites de seguridad automáticos**: si el directorio es enorme (por ejemplo, un dataset completo copiado a la carpeta de trabajo), el escaneo se detiene en un límite razonable y las carpetas restantes se cargan bajo demanda, como antes.

### 🔒 Compatibilidad Total con Kaggle, Colab y Jupyter

- **Detección automática de `/kaggle/working`**: al abrir `Layer.Dash(".")` dentro de un kernel real de Kaggle, la raíz del IDE apunta automáticamente a `/kaggle/working`, sin depender de cuál sea el directorio de trabajo real del proceso del kernel — ver [Detección Automática de Kaggle](#-detección-automática-del-directorio-de-kaggle).
- **Puente Comm Multi-Marco & Fallback RPC en 4 capas**: diseñado específicamente para funcionar dentro de los `<iframe>` aislados de celdas de salida de Kaggle y Colab, con degradación elegante entre `google.colab.kernel`, comm nativo de Jupyter, y ejecución directa vía `kernel.execute` como último recurso.
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

# 2. Importar e iniciar Layer IDE
import Layer
Layer.Dash(".")
```

No necesitás preocuparte por cuál es la ruta correcta: dentro de un kernel de Kaggle, `Layer.Dash(".")` detecta el entorno automáticamente y abre `/kaggle/working` con todo su árbol de archivos ya expandido.

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
# (en Kaggle, esto resuelve automáticamente a /kaggle/working)
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

Los modelos de 14B, 27B, 32B o 70B parámetros activan automáticamente la cuantización en 4 bits si hay GPU disponible, sin que tengas que configurarlo manualmente.

---

## ⚙️ Parámetros de `Layer.Dash`

`Layer.Dash(path=".", height="600px", theme="vs-dark", initial_file=None)`

| Parámetro | Tipo | Defecto | Descripción |
|---|---|---|---|
| `path` | `str` | `"."` | Ruta del directorio o archivo a abrir en el IDE. Si se deja en `"."` y se detecta un kernel de Kaggle, se reemplaza automáticamente por `/kaggle/working`. Cualquier otra ruta explícita se respeta siempre. |
| `height` | `str` | `"600px"` | Altura del contenedor del IDE en la salida de la celda. |
| `theme` | `str` | `"vs-dark"` | Tema de Monaco Editor (`"vs-dark"`, `"vs"`, `"hc-black"`). No aplica si el editor cae al modo de respaldo. |
| `initial_file` | `str` | `None` | Nombre o ruta relativa del archivo a abrir inicialmente. Si no se especifica y `path` apunta a un archivo, se abre ese archivo automáticamente. |

---

## 🧠 Detección Automática del Directorio de Kaggle

Cuando llamás a `Layer.Dash()` o `Layer.Dash(".")` sin indicar una ruta explícita, Layer IDE intenta detectar si está corriendo dentro de un kernel real de Kaggle antes de resolver la carpeta actual del proceso. La detección exige **dos condiciones simultáneas** para evitar falsos positivos:

1. Que exista alguna variable de entorno propia de Kaggle (`KAGGLE_KERNEL_RUN_TYPE`, `KAGGLE_URL_BASE` o `KAGGLE_DATA_PROXY_TOKEN`).
2. Que el punto de montaje `/kaggle/working` exista realmente en el sistema de archivos.

Si ambas se cumplen, la raíz del IDE se fija en `/kaggle/working` sin importar cuál sea el directorio de trabajo real del proceso del kernel en ese momento — esto resuelve el problema histórico de que el explorador apareciera vacío por una discrepancia entre el `cwd` del kernel y la carpeta que el usuario espera ver. Fuera de Kaggle (o si pasás cualquier ruta explícita que no sea `"."`), este comportamiento no se activa y todo funciona como siempre.

---

## 🌳 Exploración Recursiva del Árbol de Archivos

Al abrir el IDE, en lugar de listar solo el nivel superior y esperar a que hagas clic en cada carpeta, Layer IDE escanea **todo el árbol de una sola vez** (una sola llamada RPC) y lo muestra ya expandido, para que veas de entrada toda la estructura de tu proyecto o de `/kaggle/working`.

Para que esto sea seguro incluso con datasets grandes copiados dentro del workspace, el escaneo tiene límites por defecto:

- **Profundidad máxima**: 8 niveles de subcarpetas.
- **Máximo de elementos**: 3000 archivos/carpetas en total.

Si el árbol supera esos límites, el escaneo se detiene, aparece un aviso indicando cuántos elementos se llegaron a mostrar, y las carpetas que quedaron sin explorar se cargan igual que antes: bajo demanda, al hacer clic sobre ellas. Ninguna carpeta queda inaccesible, solo se difiere su carga.

---

## 🖊️ Editor de Respaldo cuando Monaco no puede cargar

Monaco Editor se descarga en tiempo real desde un CDN externo (`cdnjs.cloudflare.com`) la primera vez que abrís el IDE en una celda. Algunos entornos —en particular las celdas de salida de Kaggle, que se renderizan dentro de un `<iframe>` con políticas de seguridad más estrictas— pueden bloquear esa descarga.

Antes, si esa carga fallaba, todo el IDE quedaba en blanco sin ningún aviso. Ahora:

1. Se espera hasta **8 segundos** a que Monaco cargue correctamente.
2. Si falla por cualquier motivo (red bloqueada, sin conexión, error del CDN, timeout), aparece un aviso visible y el IDE activa automáticamente un **editor de texto plano** como respaldo.
3. En modo de respaldo seguís pudiendo abrir, editar, guardar (<kbd>Ctrl+S</kbd>), ejecutar (<kbd>Ctrl+Enter</kbd>) y usar el AI Copilot con total normalidad — lo único que se pierde es el resaltado de sintaxis y el autocompletado propios de Monaco.

Esto convierte un fallo silencioso de red en una degradación visible y funcional, en vez de una IDE completamente inutilizable.

---

## ⌨️ Atajos de Teclado

| Atajo | Acción |
|---|---|
| <kbd>Ctrl + S</kbd> / <kbd>Cmd + S</kbd> | Guardar archivo activo |
| <kbd>Ctrl + Enter</kbd> / <kbd>Cmd + Enter</kbd> | Ejecutar script Python activo |
| <kbd>Clic Derecho</kbd> | Abrir menú contextual en el árbol de archivos |
| <kbd>Clic Central</kbd> | Cerrar pestaña de archivo |

Estos atajos funcionan tanto con Monaco Editor como con el editor de respaldo.

---

## 🏗️ Arquitectura Interna

Layer IDE se divide en un backend en Python (que corre en el kernel del notebook) y un frontend en JavaScript puro (que corre en el navegador, dentro de la salida de la celda):

```text
Layer/
├── dash.py          → Clase Dash: arma el HTML/CSS/JS del widget, registra los
│                      canales de comunicación y despacha las acciones RPC.
├── file_manager.py  → FileManager: toda la lógica de archivos (listar, leer,
│                      escribir, crear, renombrar, duplicar, borrar, formatear,
│                      ejecutar scripts y el escaneo recursivo del árbol).
├── ai_engine.py     → AIEngine (singleton): carga de modelos de HuggingFace,
│                      cuantización automática y generación de código/texto.
└── static/
    ├── editor.js    → Frontend: puente de comunicación, árbol de archivos,
    │                  pestañas, Monaco/editor de respaldo, terminal y panel de IA.
    └── styles.css   → Estilos del widget (temas oscuro/claro/alto contraste).
```

### El puente de comunicación (4 capas de fallback)

El mayor desafío técnico del proyecto es que Kaggle y Colab renderizan la salida de cada celda dentro de un `<iframe>` aislado, lo que dificulta la comunicación directa entre el JavaScript del navegador y el kernel de Python. `editor.js` resuelve esto probando, en orden, cuatro mecanismos distintos hasta encontrar uno que funcione:

1. **`google.colab.kernel.invokeFunction`** — cuando se detecta un entorno Google Colab.
2. **Puente de ventana personalizado** (`window.layer_bridge_<id>`) — para embeds a medida.
3. **Comm nativo de Jupyter** (`comm_manager.new_comm`) — el mecanismo estándar de IPython/Jupyter/JupyterLab.
4. **`kernel.execute` como último recurso** — inyecta una llamada Python que invoca al `Dash` correspondiente vía un registro global en `builtins._layer_dash_instances` y devuelve el resultado por `stdout` con marcadores (`___LAYER_RPC___ ... ___END_LAYER_RPC___`), útil cuando el comm target todavía no está abierto (típico en Kaggle).

Cada llamada tiene su propio timeout (15s) para que un canal caído nunca deje la interfaz colgada indefinidamente.

---

## 📁 Estructura de Carpetas

```text
Layer-Notebook-Dash/
├── Layer/                     # Paquete principal (import Layer)
│   ├── __init__.py
│   ├── dash.py
│   ├── file_manager.py
│   ├── ai_engine.py
│   └── static/
│       ├── editor.js
│       └── styles.css
├── layer/                     # Alias en minúscula (import layer)
│   └── __init__.py
├── tests/                     # Suite de pytest
│   ├── test_dash.py
│   ├── test_file_manager.py
│   └── test_ai_engine.py
├── examples/
│   └── demo.ipynb
├── pyproject.toml
├── setup.py
└── README.md
```

---

## 🧪 Pruebas Unitarias

Para ejecutar el conjunto de pruebas unitarias automáticas:

```bash
pytest tests/
```

La suite cubre:

- Operaciones de archivos (crear, leer, escribir, renombrar, duplicar, borrar, formatear, ejecutar).
- Seguridad de rutas (bloqueo de path traversal cuando `allow_outside=False`).
- El escaneo recursivo del árbol y su comportamiento al alcanzar el límite de elementos.
- El puente RPC de `Dash` (comm y fallback vía `builtins._layer_rpc_call`).
- La detección automática del entorno de Kaggle, incluyendo los casos en que debe *ignorarse* (ruta explícita) y en que debe *activarse*.

---

## ⚠️ Consideraciones de Seguridad

Layer IDE está pensado para correr **dentro de tu propio notebook**, con el mismo nivel de confianza que ya tiene cualquier celda de código que ejecutás vos mismo. Algunos puntos a tener en cuenta:

- Por defecto, `FileManager` permite acceder a rutas fuera de la carpeta raíz (`allow_outside=True`) para poder navegar libremente entre `/kaggle/working` y `/kaggle/input`. Esto significa que el IDE puede leer/escribir cualquier archivo accesible al proceso del kernel, no solo los del proyecto abierto.
- El botón ▶ **Run** ejecuta el archivo `.py` activo como un subproceso real de Python en el entorno del kernel — igual que si lo corrieras vos mismo desde una celda.
- Cargar un modelo personalizado de HuggingFace usa `trust_remote_code=True`, lo cual puede ejecutar código Python arbitrario incluido en el repositorio de ese modelo. Solo cargá modelos de fuentes en las que confíes.

---

## 📄 Licencia

MIT License © 2026 Guillermo Petcho
