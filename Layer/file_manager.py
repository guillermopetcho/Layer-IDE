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
    def __init__(self, root_path: str):
        self.root_path = Path(root_path).resolve()
        if self.root_path.is_file():
            self.target_file = self.root_path
            self.root_path = self.root_path.parent
        else:
            self.target_file = None

    def _resolve(self, rel_path: str) -> Path:
        if not rel_path or rel_path == ".":
            return self.root_path
        target = (self.root_path / rel_path).resolve()
        # Security check: ensure path stays within root_path unless explicitly disabled
        if not str(target).startswith(str(self.root_path)):
            raise ValueError(f"Access denied: path '{rel_path}' is outside root directory.")
        return target

    def list_dir(self, rel_path: str = "") -> dict:
        path = self._resolve(rel_path)
        if not path.exists():
            return {"error": f"Path not found: {rel_path}"}

        if path.is_file():
            return {
                "name": path.name,
                "rel_path": rel_path or path.name,
                "is_dir": False,
                "size": path.stat().st_size,
                "mtime": path.stat().st_mtime,
                "language": get_language_for_file(path.name),
            }

        items = []
        try:
            for entry in sorted(os.scandir(path), key=lambda e: (not e.is_dir(), e.name.lower())):
                # Ignore hidden VCS files like .git
                if entry.name == ".git":
                    continue
                
                entry_path = Path(entry.path)
                try:
                    rel_item_path = str(entry_path.relative_to(self.root_path))
                except ValueError:
                    rel_item_path = entry.name

                is_directory = entry.is_dir()
                items.append({
                    "name": entry.name,
                    "rel_path": rel_item_path,
                    "is_dir": is_directory,
                    "size": entry.stat().st_size if not is_directory else 0,
                    "mtime": entry.stat().st_mtime,
                    "language": get_language_for_file(entry.name) if not is_directory else "folder",
                })
        except Exception as e:
            return {"error": str(e)}

        try:
            root_rel = str(path.relative_to(self.root_path))
            if root_rel == ".":
                root_rel = ""
        except ValueError:
            root_rel = ""

        return {
            "root_name": self.root_path.name or str(self.root_path),
            "current_rel_path": root_rel,
            "items": items,
            "initial_file": str(self.target_file.relative_to(self.root_path)) if self.target_file else None,
        }

    def read_file(self, rel_path: str) -> dict:
        path = self._resolve(rel_path)
        if not path.is_file():
            return {"error": f"File not found: {rel_path}"}

        # Check binary file
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
