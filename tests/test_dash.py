import os
import tempfile
from pathlib import Path
import Layer
import layer
from Layer.dash import _detect_kaggle_working_dir

def test_imports():
    assert hasattr(Layer, "Dash")
    assert hasattr(layer, "Dash")

def test_dash_initialization():
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create a test script
        test_file = Path(tmpdir) / "app.py"
        test_file.write_text("print('test')")

        # Instantiate Dash without inline display to test object properties
        dash = Layer.Dash(tmpdir, display_inline=False)
        assert dash.path == tmpdir
        assert dash.instance_id is not None

        # Test comm message RPC handler directly
        res = dash.handle_message({"action": "list_dir", "rel_path": ""})
        assert "items" in res
        item_names = [i["name"] for i in res["items"]]
        assert "app.py" in item_names

        read_res = dash.handle_message({"action": "read_file", "rel_path": "app.py"})
        assert read_res.get("content") == "print('test')"

        # Test global RPC fallback via builtins._layer_rpc_call
        import builtins
        assert hasattr(builtins, "_layer_rpc_call")
        rpc_res = builtins._layer_rpc_call(dash.instance_id, '{"action": "read_file", "rel_path": "app.py"}')
        assert rpc_res.get("content") == "print('test')"

def test_list_tree_rpc_action():
    with tempfile.TemporaryDirectory() as tmpdir:
        (Path(tmpdir) / "sub").mkdir()
        (Path(tmpdir) / "sub" / "deep.py").write_text("pass")

        dash = Layer.Dash(tmpdir, display_inline=False)
        res = dash.handle_message({"action": "list_tree", "rel_path": ""})
        assert "items" in res
        sub_node = next(i for i in res["items"] if i["name"] == "sub")
        assert "deep.py" in [c["name"] for c in sub_node["children"]]

def test_detect_kaggle_working_dir_absent_by_default():
    for var in ("KAGGLE_KERNEL_RUN_TYPE", "KAGGLE_URL_BASE", "KAGGLE_DATA_PROXY_TOKEN"):
        os.environ.pop(var, None)
    assert _detect_kaggle_working_dir() is None

def test_detect_kaggle_working_dir_when_env_and_mount_present(monkeypatch, tmp_path):
    fake_working = tmp_path / "working"
    fake_working.mkdir()
    monkeypatch.setattr("Layer.dash.Path", lambda p: fake_working if p == "/kaggle/working" else Path(p))
    monkeypatch.setenv("KAGGLE_KERNEL_RUN_TYPE", "Interactive")
    assert _detect_kaggle_working_dir() == str(fake_working)

def test_dash_uses_kaggle_working_dir_when_detected(monkeypatch, tmp_path):
    fake_kaggle_dir = tmp_path / "kaggle_working"
    fake_kaggle_dir.mkdir()
    (fake_kaggle_dir / "output.csv").write_text("a,b\n1,2")

    monkeypatch.setattr("Layer.dash._detect_kaggle_working_dir", lambda: str(fake_kaggle_dir))

    dash = Layer.Dash(".", display_inline=False)
    assert dash.path == str(fake_kaggle_dir)

    res = dash.handle_message({"action": "list_dir", "rel_path": ""})
    assert "output.csv" in [i["name"] for i in res["items"]]

def test_dash_ignores_kaggle_detection_when_explicit_path_given(monkeypatch, tmp_path):
    other_dir = tmp_path / "explicit"
    other_dir.mkdir()
    fake_kaggle_dir = tmp_path / "kaggle_working"
    fake_kaggle_dir.mkdir()

    monkeypatch.setattr("Layer.dash._detect_kaggle_working_dir", lambda: str(fake_kaggle_dir))

    dash = Layer.Dash(str(other_dir), display_inline=False)
    assert dash.path == str(other_dir)
