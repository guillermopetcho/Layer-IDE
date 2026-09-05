import pytest
from Layer.ai_engine import AIEngine, ai_engine
import Layer

def test_ai_engine_singleton():
    engine1 = AIEngine()
    engine2 = AIEngine()
    assert engine1 is engine2
    assert engine1 is ai_engine

def test_ai_engine_status():
    status = ai_engine.get_status()
    assert "loaded" in status
    assert "provider" in status
    assert "device" in status

def test_ai_engine_api_setup():
    res = ai_engine.setup_api_key("fake_key", provider="gemini", model_name="gemini-1.5-flash")
    assert res.get("success") is True
    status = ai_engine.get_status()
    assert status["loaded"] is True
    assert status["provider"] == "api"

def test_package_load_model_export():
    assert hasattr(Layer, "load_model")
    assert hasattr(Layer, "ai_engine")
