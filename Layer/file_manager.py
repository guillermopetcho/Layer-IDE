import os
import shutil
import sys
import subprocess
from io import StringIO
from pathlib import Path

# Mapping file extensions to Monaco editor syntax highlighting languages
LANGUAGE_MAP = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "scss",
    ".json": "json",
    ".md": "markdown",
    ".markdown": "markdown",
    ".sql": "sql",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".xml": "xml",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".java": "java",
    ".rs": "rust",
    ".go": "go",
    ".php": "php",
    ".r": "r",
    ".rb": "ruby",
    ".toml": "toml",
    ".ini": "ini",
    ".txt": "plaintext",
    ".log": "plaintext",
    ".env": "plaintext",
}

def get_language_for_file(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return LANGUAGE_MAP.get(ext, "plaintext")

class FileManager:
    def __init__(self, root_path: str, allow_outside: bool = True):
        self.root_path = Path(root_path).resolve()
        self.allow_outside = allow_outside
        if self.root_path.is_file():
            self.target_file = self.root_path
            self.root_path = self.root_path.parent
        else:
            self.target_file = None

    def _safe_is_dir(self, entry) -> bool:
        try:
            return entry.is_dir(follow_symlinks=True)
        except Exception:
            return False

    def _resolve(self, rel_path: str) -> Path:
        if not rel_path or rel_path == ".":
            return self.root_path

        p = Path(rel_path)
        # 1. If rel_path is an absolute path on disk (e.g. /kaggle/working/file.py), return it directly
        if p.is_absolute() and p.exists():
            target = p.resolve()
        else:
            if p.is_absolute():
                try:
                    p = p.relative_to(self.root_path)
                except ValueError:
                    try:
                        p = p.relative_to(Path(os.path.realpath(self.root_path)))
                    except ValueError:
                        pass
            target = (self.root_path / p).resolve()

        if not self.allow_outside:
            real_root = os.path.realpath(self.root_path)
            real_target = os.path.realpath(target)
            if not (real_target == real_root or real_target.startswith(real_root + os.sep)):
                raise ValueError(f"Access denied: path '{rel_path}' is outside root directory '{self.root_path}'.")

        return target

    def list_dir(self, rel_path: str = "") -> dict:
        try:
            path = self._resolve(rel_path)
        except Exception as e:
            return {"error": f"Invalid path '{rel_path}': {str(e)}"}

        if not path.exists():
            return {"error": f"Path not found: {rel_path}"}

        if path.is_file():
            return {
                "name": path.name,
                "rel_path": rel_path or path.name,
                "is_dir": False,
                "size": path.stat().st_size if path.exists() else 0,
                "mtime": path.stat().st_mtime if path.exists() else 0,
                "language": get_language_for_file(path.name),
            }

        real_root = Path(os.path.realpath(self.root_path))
        items = []
        try:
            entries = list(os.scandir(path))
        except Exception as e:
            return {"error": f"Cannot scan directory '{path}': {str(e)}"}

        for entry in sorted(entries, key=lambda e: (not self._safe_is_dir(e), e.name.lower())):
            # Ignore hidden VCS files like .git
            if entry.name == ".git":
                continue

            is_directory = self._safe_is_dir(entry)

            try:
                st = entry.stat()
                size = st.st_size if not is_directory else 0
                mtime = st.st_mtime
            except Exception:
                size = 0
                mtime = 0

            # Determine relative path safely
            try:
                entry_real = Path(os.path.realpath(entry.path))
                rel_item_path = str(entry_real.relative_to(real_root))
            except Exception:
                try:
                    rel_item_path = str(Path(entry.path).relative_to(self.root_path))
                except Exception:
                    clean_rel = rel_path.strip("/") if rel_path and rel_path != "." else ""
                    rel_item_path = f"{clean_rel}/{entry.name}" if clean_rel else entry.name

            items.append({
                "name": entry.name,
                "rel_path": rel_item_path,
                "is_dir": is_directory,
                "size": size,
                "mtime": mtime,
                "language": get_language_for_file(entry.name) if not is_directory else "folder",
            })

        try:
            root_rel = str(path.relative_to(self.root_path))
            if root_rel == ".":
                root_rel = ""
        except ValueError:
            root_rel = str(path)

        return {
            "root_name": self.root_path.name or str(self.root_path),
            "current_rel_path": root_rel,
            "items": items,
            "initial_file": str(self.target_file.relative_to(self.root_path)) if self.target_file else None,
        }

    def list_tree(self, rel_path: str = "", max_depth: int = 8, max_entries: int = 3000) -> dict:
        """Recursively scan a directory and return its full nested structure.

        Bounded by max_depth/max_entries so a huge tree (e.g. a dataset
        copied into the workspace) can't hang the kernel or overwhelm the
        UI: scanning stops early once the cap is hit and `truncated` is
        set, leaving any not-yet-scanned folders without a `children` key
        so the frontend can lazy-load them on demand like before.
        """
        try:
            root = self._resolve(rel_path)
        except Exception as e:
            return {"error": f"Invalid path '{rel_path}': {str(e)}"}

        if not root.exists():
            return {"error": f"Path not found: {rel_path}"}
        if root.is_file():
            return {"error": f"Not a directory: {rel_path}"}

        # Scan the requested root eagerly so a real failure here (permissions,
        # a broken mount, etc.) surfaces as a visible error instead of being
        # swallowed into a silently empty tree further down.
        try:
            root_entries = list(os.scandir(root))
        except Exception as e:
            return {"error": f"Cannot scan directory '{root}': {str(e)}"}

        real_root = Path(os.path.realpath(self.root_path))
        state = {"count": 0, "truncated": False}

        def scan(entries, depth: int) -> list:
            nodes = []
            if state["truncated"]:
                return nodes

            for entry in sorted(entries, key=lambda e: (not self._safe_is_dir(e), e.name.lower())):
                if entry.name == ".git":
                    continue
                if state["count"] >= max_entries:
                    state["truncated"] = True
                    break

                is_directory = self._safe_is_dir(entry)
                try:
                    st = entry.stat()
                    size = st.st_size if not is_directory else 0
                    mtime = st.st_mtime
                except Exception:
                    size = 0
                    mtime = 0

                try:
                    entry_real = Path(os.path.realpath(entry.path))
                    rel_item_path = str(entry_real.relative_to(real_root))
                except Exception:
                    rel_item_path = entry.name

                node = {
                    "name": entry.name,
                    "rel_path": rel_item_path,
                    "is_dir": is_directory,
                    "size": size,
                    "mtime": mtime,
                    "language": get_language_for_file(entry.name) if not is_directory else "folder",
                }
                state["count"] += 1

                if is_directory and depth < max_depth:
                    # Nested folders degrade gracefully: an unreadable
                    # subfolder just ends up with no children instead of
                    # failing the whole tree.
                    try:
                        child_entries = list(os.scandir(entry.path))
                    except Exception:
                        child_entries = []
                    node["children"] = scan(child_entries, depth + 1)

                nodes.append(node)

            return nodes

        items = scan(root_entries, 0)

        try:
            root_rel = str(root.relative_to(self.root_path))
            if root_rel == ".":
                root_rel = ""
        except ValueError:
            root_rel = str(root)

        return {
            "root_name": self.root_path.name or str(self.root_path),
            "current_rel_path": root_rel,
            "items": items,
            "truncated": state["truncated"],
            "scanned_entries": state["count"],
            "initial_file": str(self.target_file.relative_to(self.root_path)) if self.target_file else None,
        }

    def read_file(self, rel_path: str) -> dict:
        path = self._resolve(rel_path)
        if not path.is_file():
            return {"error": f"File not found: {rel_path}"}

        # Check binary/image file
        ext = path.suffix.lower()
        if ext in [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"]:
            import base64
            try:
                with open(path, "rb") as f:
                    b64_data = base64.b64encode(f.read()).decode("utf-8")
                mime_map = {
                    ".png": "image/png",
                    ".jpg": "image/jpeg",
                    ".jpeg": "image/jpeg",
                    ".gif": "image/gif",
                    ".svg": "image/svg+xml",
                    ".webp": "image/webp",
                    ".ico": "image/x-icon",
                }
                return {
                    "rel_path": rel_path,
                    "content": b64_data,
                    "is_image": True,
                    "mime_type": mime_map.get(ext, "image/png"),
                    "size": path.stat().st_size,
                    "mtime": path.stat().st_mtime,
                }
            except Exception as e:
                return {"error": f"Cannot read image file: {str(e)}"}

        try:
            with open(path, "rb") as f:
                chunk = f.read(1024)
                if b"\x00" in chunk:
                    return {
                        "rel_path": rel_path,
                        "content": "[Binary File - Cannot edit directly in text editor]",
                        "is_binary": True,
                        "language": "plaintext",
                        "size": path.stat().st_size,
                    }
        except Exception as e:
            return {"error": f"Cannot inspect file: {str(e)}"}

        # Try UTF-8 first, fallback to latin-1
        for encoding in ["utf-8", "latin-1", "cp1252"]:
            try:
                with open(path, "r", encoding=encoding) as f:
                    content = f.read()
                return {
                    "rel_path": rel_path,
                    "content": content,
                    "is_binary": False,
                    "language": get_language_for_file(path.name),
                    "size": path.stat().st_size,
                    "mtime": path.stat().st_mtime,
                }
            except UnicodeDecodeError:
                continue

        return {"error": f"Unable to decode file '{rel_path}' with standard encodings."}

    def write_file(self, rel_path: str, content: str) -> dict:
        path = self._resolve(rel_path)
        try:
            # Ensure parent directories exist
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            return {
                "success": True,
                "rel_path": rel_path,
                "size": path.stat().st_size,
                "mtime": path.stat().st_mtime,
            }
        except Exception as e:
            return {"error": f"Failed to write file '{rel_path}': {str(e)}"}

    def write_binary_file(self, rel_path: str, base64_content: str) -> dict:
        """Write raw bytes decoded from base64 - used by the browser-side file upload picker for non-text files."""
        path = self._resolve(rel_path)
        try:
            import base64
            raw = base64.b64decode(base64_content)
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "wb") as f:
                f.write(raw)
            return {
                "success": True,
                "rel_path": rel_path,
                "size": path.stat().st_size,
                "mtime": path.stat().st_mtime,
            }
        except Exception as e:
            return {"error": f"Failed to write binary file '{rel_path}': {str(e)}"}

    def create_file(self, rel_path: str) -> dict:
        path = self._resolve(rel_path)
        if path.exists():
            return {"error": f"Path already exists: {rel_path}"}
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch()
            return {"success": True, "rel_path": rel_path}
        except Exception as e:
            return {"error": f"Failed to create file '{rel_path}': {str(e)}"}

    def create_dir(self, rel_path: str) -> dict:
        path = self._resolve(rel_path)
        if path.exists():
            return {"error": f"Path already exists: {rel_path}"}
        try:
            path.mkdir(parents=True, exist_ok=True)
            return {"success": True, "rel_path": rel_path}
        except Exception as e:
            return {"error": f"Failed to create directory '{rel_path}': {str(e)}"}

    def delete_item(self, rel_path: str) -> dict:
        path = self._resolve(rel_path)
        if not path.exists():
            return {"error": f"Path does not exist: {rel_path}"}
        try:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                os.remove(path)
            return {"success": True, "rel_path": rel_path}
        except Exception as e:
            return {"error": f"Failed to delete '{rel_path}': {str(e)}"}

    def rename_item(self, old_rel_path: str, new_rel_path: str) -> dict:
        old_path = self._resolve(old_rel_path)
        new_path = self._resolve(new_rel_path)
        if not old_path.exists():
            return {"error": f"Source path does not exist: {old_rel_path}"}
        if new_path.exists():
            return {"error": f"Target path already exists: {new_rel_path}"}
        try:
            new_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(old_path, new_path)
            return {"success": True, "old_rel_path": old_rel_path, "new_rel_path": new_rel_path}
        except Exception as e:
            return {"error": f"Failed to rename '{old_rel_path}': {str(e)}"}

    def duplicate_item(self, rel_path: str) -> dict:
        path = self._resolve(rel_path)
        if not path.exists():
            return {"error": f"Path does not exist: {rel_path}"}
        
        # Generate new name
        parent = path.parent
        stem = path.stem if path.is_file() else path.name
        suffix = path.suffix if path.is_file() else ""
        
        counter = 1
        new_name = f"{stem}_copy{suffix}"
        new_path = parent / new_name
        while new_path.exists():
            counter += 1
            new_name = f"{stem}_copy{counter}{suffix}"
            new_path = parent / new_name
            
        try:
            if path.is_dir():
                shutil.copytree(path, new_path)
            else:
                shutil.copy2(path, new_path)
            rel_new = str(new_path.relative_to(self.root_path))
            return {"success": True, "old_rel_path": rel_path, "new_rel_path": rel_new}
        except Exception as e:
            return {"error": f"Failed to duplicate '{rel_path}': {str(e)}"}

    def format_code(self, rel_path: str, content: str = None) -> dict:
        path = self._resolve(rel_path)
        ext = path.suffix.lower()
        if ext != ".py":
            return {"error": f"Code formatting currently supported for Python (.py) files."}
            
        target_content = content
        if target_content is None:
            if not path.is_file():
                return {"error": f"File not found: {rel_path}"}
            with open(path, "r", encoding="utf-8") as f:
                target_content = f.read()

        # Try black, autopep8, or yapf if available
        formatted = None
        for cmd in [
            [sys.executable, "-m", "black", "-q", "-"],
            [sys.executable, "-m", "autopep8", "-"],
        ]:
            try:
                res = subprocess.run(
                    cmd,
                    input=target_content,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if res.returncode == 0 and res.stdout:
                    formatted = res.stdout
                    break
            except Exception:
                continue

        if formatted is not None:
            return {"success": True, "formatted_content": formatted}
        else:
            return {"error": "No Python formatter (black/autopep8) installed in environment."}

    def run_script(self, rel_path: str) -> dict:
        path = self._resolve(rel_path)
        if not path.is_file():
            return {"error": f"File not found: {rel_path}"}
        if path.suffix.lower() != ".py":
            return {"error": f"Can only execute Python (.py) scripts directly. File is {path.suffix}"}

        try:
            res = subprocess.run(
                [sys.executable, str(path)],
                cwd=str(self.root_path),
                capture_output=True,
                text=True,
                timeout=30
            )
            return {
                "success": True,
                "stdout": res.stdout,
                "stderr": res.stderr,
                "returncode": res.returncode
            }
        except subprocess.TimeoutExpired:
            return {"error": "Execution timed out (30s limit)."}
        except Exception as e:
            return {"error": f"Execution failed: {str(e)}"}
