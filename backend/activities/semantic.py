"""
Semantic-search helpers for Activity.

Why this exists
---------------
The keyword search in views.py only matches literal words ("mountain" never
finds a "Hiking Trip" activity). Sentence embeddings fix that: each piece of
text becomes a 384-dim vector, and texts about related concepts land near
each other in that space — so cosine similarity surfaces "Hiking Trip" for
the query "mountain".

How it works
------------
- One small open-source model: all-MiniLM-L6-v2 (~22 MB, CPU-friendly,
  downloads once on first use into ~/.cache/huggingface/).
- The model is loaded lazily via a module-level singleton so Django startup
  stays fast and we don't pay the load cost in workers that never search.
- Embeddings are stored as a plain JSON list on Activity.embedding.
- Cosine similarity is computed in numpy at query time. For the dataset
  size of a student project (hundreds to a few thousand activities)
  brute-force is well under 50 ms — no vector index needed.
"""
from __future__ import annotations

import logging
from threading import Lock
from typing import Iterable

import numpy as np

logger = logging.getLogger(__name__)

# 384-dim model. Small, fast, strong general-purpose embeddings.
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

_model = None
_model_lock = Lock()


def get_model():
    """Lazily load and cache the SentenceTransformer model.

    The first call downloads ~22 MB into the HuggingFace cache and takes a
    few seconds; subsequent calls are instant. We keep the import inside
    the function so that `manage.py` commands that don't need embeddings
    don't pay the torch import cost.
    """
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is None:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading sentence-transformers model: %s", MODEL_NAME)
            _model = SentenceTransformer(MODEL_NAME)
    return _model


def build_activity_text(activity) -> str:
    """Concatenate the fields we want represented in the embedding.

    Title is repeated so it carries slightly more weight than description
    when the two vectors are averaged inside the encoder.
    """
    title = (activity.title or "").strip()
    description = (activity.description or "").strip()
    return f"{title}. {title}. {description}".strip()


def embed_text(text: str) -> list[float] | None:
    """Embed a single string. Returns None for empty input."""
    text = (text or "").strip()
    if not text:
        return None
    vec = get_model().encode(text, normalize_embeddings=True)
    return vec.tolist()


def cosine_similarity(a: Iterable[float], b: Iterable[float]) -> float:
    """Cosine similarity in [-1, 1].

    Embeddings produced by `embed_text` are already L2-normalized, so this
    reduces to a dot product — but we keep the full formula so the helper
    works on any input vector.
    """
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    na = np.linalg.norm(va)
    nb = np.linalg.norm(vb)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))
