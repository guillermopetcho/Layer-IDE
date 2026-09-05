from Layer.dash import Dash
from Layer.ai_engine import ai_engine, AIEngine

def load_model(model_name: str = "Qwen/Qwen2.5-Coder-1.5B-Instruct", load_in_4bit: bool = False):
    """Utility helper to load a Large Code Model into Layer IDE."""
    return ai_engine.load_hf_model(model_name, load_in_4bit=load_in_4bit)

__version__ = "0.1.0"
__all__ = ["Dash", "load_model", "ai_engine", "AIEngine", "__version__"]

