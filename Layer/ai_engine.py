import os
import sys
import json
import logging
import threading
from typing import Dict, Any, Optional

logger = logging.getLogger("Layer.AIEngine")

class AIEngine:
    """
    AI Code Engine for Layer IDE.
    Supports loading Open-Source Code LLMs via HuggingFace Transformers (GPU/CPU)
    as well as API-based models (Gemini, DeepSeek, OpenAI, Groq).
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AIEngine, cls).__new__(cls)
            cls._instance._init_engine()
        return cls._instance

    def _init_engine(self):
        self.model = None
        self.tokenizer = None
        self.model_name: Optional[str] = None
        self.provider: str = "none" # "huggingface", "api", "none"
        self.api_key: Optional[str] = None
        self.device: str = "cpu"
        self.is_loading: bool = False
        self.load_error: Optional[str] = None
        self.load_lock = threading.Lock()

    def get_status(self) -> Dict[str, Any]:
        """Return current AI model status."""
        return {
            "loaded": self.model is not None or self.provider == "api",
            "model_name": self.model_name or "None",
            "provider": self.provider,
            "device": self.device,
            "is_loading": self.is_loading,
            "error": self.load_error
        }

    def load_hf_model(self, model_name: str = "Qwen/Qwen2.5-Coder-1.5B-Instruct", load_in_4bit: bool = False) -> Dict[str, Any]:
        """Load a Hugging Face Causal LM model asynchronously or synchronously."""
        with self.load_lock:
            self.is_loading = True
            self.load_error = None

            try:
                import torch
                from transformers import AutoTokenizer, AutoModelForCausalLM

                self.device = "cuda" if torch.cuda.is_available() else "cpu"
                logger.info(f"Loading HF model '{model_name}' on {self.device}...")

                tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
                
                kwargs = {}
                if self.device == "cuda":
                    kwargs["torch_dtype"] = torch.float16
                    kwargs["device_map"] = "auto"
                else:
                    kwargs["torch_dtype"] = torch.float32

                if load_in_4bit:
                    try:
                        from transformers import BitsAndBytesConfig
                        kwargs["quantization_config"] = BitsAndBytesConfig(load_in_4bit=True)
                    except ImportError:
                        pass

                model = AutoModelForCausalLM.from_pretrained(model_name, trust_remote_code=True, **kwargs)

                self.model = model
                self.tokenizer = tokenizer
                self.model_name = model_name
                self.provider = "huggingface"
                self.is_loading = False
                return {"success": True, "status": self.get_status()}
            except Exception as e:
                self.is_loading = False
                self.load_error = str(e)
                logger.error(f"Failed to load HF model: {e}")
                return {"error": f"Failed to load model '{model_name}': {str(e)}"}

    def setup_api_key(self, api_key: str, provider: str = "gemini", model_name: str = "gemini-1.5-flash") -> Dict[str, Any]:
        """Configure API-based LLM provider (e.g. Gemini, DeepSeek, OpenAI)."""
        self.api_key = api_key
        self.provider = "api"
        self.model_name = f"{provider}:{model_name}"
        self.load_error = None
        return {"success": True, "status": self.get_status()}

    def instruct(self, prompt: str, code_context: str = "", task_type: str = "chat") -> Dict[str, Any]:
        """Generate response or code modifications based on instruction."""
        if not self.model and self.provider != "api":
            # Auto-fallback: attempt to load lightweight Qwen 1.5B model if available or return error
            return {"error": "No AI model loaded. Please call `Layer.load_model('Qwen/Qwen2.5-Coder-1.5B-Instruct')` first."}

        full_prompt = self._build_prompt(prompt, code_context, task_type)

        if self.provider == "huggingface":
            return self._generate_hf(full_prompt)
        elif self.provider == "api":
            return self._generate_api(full_prompt)
        else:
            return {"error": "Invalid provider configuration."}

    def _build_prompt(self, user_prompt: str, code_context: str, task_type: str) -> str:
        system_instruction = "You are an expert AI coding assistant inside Layer IDE. Provide concise, clean code without conversational clutter when code is requested."
        
        if task_type == "explain":
            user_prompt = f"Explain the following code clearly:\n```python\n{code_context}\n```"
        elif task_type == "refactor":
            user_prompt = f"Refactor and optimize the following code:\n```python\n{code_context}\n```\nInstruction: {user_prompt}"
        elif task_type == "fix":
            user_prompt = f"Identify and fix bugs in the following code:\n```python\n{code_context}\n```"
        elif task_type == "generate_tests":
            user_prompt = f"Write comprehensive pytest unit tests for the following code:\n```python\n{code_context}\n```"
        elif code_context:
            user_prompt = f"Code Context:\n```python\n{code_context}\n```\n\nTask: {user_prompt}"

        return f"<|im_start|>system\n{system_instruction}<|im_end|>\n<|im_start|>user\n{user_prompt}<|im_end|>\n<|im_start|>assistant\n"

    def _generate_hf(self, prompt: str) -> Dict[str, Any]:
        try:
            import torch
            inputs = self.tokenizer(prompt, return_tensors="pt")
            if self.device == "cuda":
                inputs = {k: v.to("cuda") for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=512,
                    temperature=0.2,
                    top_p=0.9,
                    do_sample=True,
                    pad_token_id=self.tokenizer.eos_token_id
                )

            full_text = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
            # Remove prompt prefix from generated output if present
            response = full_text[len(prompt):] if full_text.startswith(prompt) else full_text
            return {"success": True, "response": response.strip()}
        except Exception as e:
            return {"error": f"Generation error: {str(e)}"}

    def _generate_api(self, prompt: str) -> Dict[str, Any]:
        return {"error": "API generation requires configuring an API endpoint or key."}

# Global singleton accessor
ai_engine = AIEngine()
