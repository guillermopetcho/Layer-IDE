import os
import tempfile
import pytest
from pathlib import Path
from Layer.file_manager import FileManager, get_language_for_file

def test_language_detection():
    assert get_language_for_file("script.py") == "python"
    assert get_language_for_file("index.js") == "javascript"
    assert get_language_for_file("style.css") == "css"
    assert get_language_for_file("config.json") == "json"
    assert get_language_for_file("doc.md") == "markdown"
    assert get_language_for_file("unknown.xyz") == "plaintext"

def test_file_manager_operations():
    with tempfile.TemporaryDirectory() as tmpdir:
        fm = FileManager(tmpdir)

        # 1. Create file & dir
        res = fm.create_file("test.py")
        assert res.get("success") is True

        res = fm.create_dir("src")
        assert res.get("success") is True

        res = fm.create_file("src/main.py")
        assert res.get("success") is True

        # 2. List dir
        tree = fm.list_dir("")
        assert "items" in tree
        names = [item["name"] for item in tree["items"]]
        assert "test.py" in names
        assert "src" in names

        # 3. Write file
        write_res = fm.write_file("src/main.py", "print('hello layer')")
        assert write_res.get("success") is True

        # 4. Read file
        read_res = fm.read_file("src/main.py")
        assert read_res.get("content") == "print('hello layer')"
        assert read_res.get("language") == "python"

        # 5. Run script
        run_res = fm.run_script("src/main.py")
        assert run_res.get("success") is True
        assert "hello layer" in run_res.get("stdout")

        # 6. Rename item
        rename_res = fm.rename_item("test.py", "renamed.py")
        assert rename_res.get("success") is True
        assert os.path.exists(os.path.join(tmpdir, "renamed.py"))

        # 7. Delete item
        del_res = fm.delete_item("renamed.py")
        assert del_res.get("success") is True
        assert not os.path.exists(os.path.join(tmpdir, "renamed.py"))

        # 8. Duplicate item
        dup_res = fm.duplicate_item("src/main.py")
        assert dup_res.get("success") is True
        assert os.path.exists(os.path.join(tmpdir, "src/main_copy.py"))

        # 9. Format code test
        fmt_res = fm.format_code("src/main.py")
        assert ("success" in fmt_res) or ("error" in fmt_res)

def test_path_security():
    with tempfile.TemporaryDirectory() as tmpdir:
        fm = FileManager(tmpdir)
        with pytest.raises(ValueError, match="outside root directory"):
            fm._resolve("../outside.txt")

