import tempfile
from pathlib import Path
import Layer
import layer

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
