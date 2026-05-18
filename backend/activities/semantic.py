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
- Query encoding results are LRU-cached so repeat searches ("mountain"
  typed by 20 different users) reuse the same vector without re-running
  the transformer.
- Activity embeddings are produced by encoding title and description
  *separately* and storing a weighted L2-normalized blend (title carries
  more weight, ~0.7). This is more principled than concatenating "title.
  title. description" because the encoder's pooling treats each field on
  its own terms before we mix them.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from threading import Lock
from typing import Iterable, Sequence

import numpy as np

logger = logging.getLogger(__name__)

# 384-dim model. Small, fast, strong general-purpose embeddings.
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

# How much weight the title carries vs. the description in the blended
# activity embedding. 0.7 reflects the intuition that titles are usually
# higher-signal than descriptions (which contain logistics, dates, etc).
DEFAULT_TITLE_WEIGHT = 0.7

# Bounded LRU on query encodes. 512 entries is plenty for typical query
# diversity and costs ~750 KB of RAM (512 * 384 * 4 bytes).
_QUERY_CACHE_SIZE = 512

_model = None
_model_lock = Lock()


def get_model():
    """Lazily load and cache the SentenceTransformer model.

    The first call downloads ~22 MB into the HuggingFace cache and takes a
    few seconds; subsequent calls are instant. We keep the import inside
    the function so that `manage.py` commands that don't need embeddings
    don't pay the torch import cost.

    Raises on load failure — callers go through ``_safe_get_model`` so a
    transient failure (no network on first run, disk full) degrades the
    search to keyword-only instead of returning a 500.
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


def _safe_get_model():
    """Return the model, or None if it can't be loaded. Errors are logged
    once per call site, never raised — semantic ranking should *degrade*,
    not break, the search."""
    try:
        return get_model()
    except Exception:  # pragma: no cover — import/download failures
        logger.exception(
            "Failed to load embedding model %s; falling back to keyword-only ranking",
            MODEL_NAME,
        )
        return None


@lru_cache(maxsize=_QUERY_CACHE_SIZE)
def _embed_text_cached(text: str) -> tuple[float, ...]:
    """Cached single-string encode. Returns a tuple so the cached value is
    immutable (a list would let a careless caller mutate the cache).

    Raises on model-load failure. ``embed_text`` catches that and returns
    None, so transient failures are *not* cached.
    """
    model = get_model()
    vec = model.encode(text, normalize_embeddings=True)
    return tuple(float(x) for x in vec.tolist())


def embed_text(text: str) -> list[float] | None:
    """Embed a single string. Returns None for empty input or model
    failure. Successful encodes are LRU-cached on the input string."""
    text = (text or "").strip()
    if not text:
        return None
    try:
        result = _embed_text_cached(text)
    except Exception:
        logger.exception("Embedding failed; semantic ranking disabled for this request")
        return None
    return list(result)


def embed_activity_text(
    title: str,
    description: str,
    title_weight: float = DEFAULT_TITLE_WEIGHT,
) -> list[float] | None:
    """Encode title and description separately, return a weighted, L2-
    normalized blend.

    Why not just concatenate? Because the encoder's pooling layer averages
    token embeddings within whatever it sees. Concatenating "title. title.
    description" upweights the title indirectly via token count, which is
    crude and depends on title length. Encoding each field separately and
    mixing the unit vectors lets us control the title's contribution
    exactly — and re-normalizing keeps the result on the unit sphere so
    cosine comparisons stay clean.
    """
    title = (title or "").strip()
    description = (description or "").strip()
    if not title and not description:
        return None
    model = _safe_get_model()
    if model is None:
        return None
    w = max(0.0, min(1.0, title_weight))

    if title and description:
        title_vec = np.asarray(model.encode(title, normalize_embeddings=True), dtype=np.float32)
        desc_vec = np.asarray(model.encode(description, normalize_embeddings=True), dtype=np.float32)
        blended = w * title_vec + (1.0 - w) * desc_vec
    elif title:
        blended = np.asarray(model.encode(title, normalize_embeddings=True), dtype=np.float32)
    else:
        blended = np.asarray(model.encode(description, normalize_embeddings=True), dtype=np.float32)

    norm = float(np.linalg.norm(blended))
    if norm > 0:
        blended = blended / norm
    return blended.astype(np.float32).tolist()


def embed_activity_texts(
    items: Sequence[tuple[str, str]],
    title_weight: float = DEFAULT_TITLE_WEIGHT,
) -> list[list[float] | None]:
    """Batch version of ``embed_activity_text``. ``items`` is a sequence
    of (title, description) pairs. Encodes all titles in one model call
    and all descriptions in another, then blends row-by-row. Returns a
    list aligned with the input order; entries with no text are None."""
    if not items:
        return []
    model = _safe_get_model()
    if model is None:
        return [None] * len(items)
    w = max(0.0, min(1.0, title_weight))

    titles = [(t or "").strip() for t, _ in items]
    descs = [(d or "").strip() for _, d in items]
    title_vecs = model.encode(titles, normalize_embeddings=True)
    desc_vecs = model.encode(descs, normalize_embeddings=True)

    results: list[list[float] | None] = []
    for i, (t, d) in enumerate(zip(titles, descs)):
        if not t and not d:
            results.append(None)
            continue
        title_vec = np.asarray(title_vecs[i], dtype=np.float32)
        desc_vec = np.asarray(desc_vecs[i], dtype=np.float32)
        if t and d:
            blended = w * title_vec + (1.0 - w) * desc_vec
        elif t:
            blended = title_vec
        else:
            blended = desc_vec
        norm = float(np.linalg.norm(blended))
        if norm > 0:
            blended = blended / norm
        results.append(blended.astype(np.float32).tolist())
    return results


def cosine_similarity(a: Iterable[float], b: Iterable[float]) -> float:
    """Cosine similarity in [-1, 1].

    Embeddings produced by the helpers above are already L2-normalized,
    so this reduces to a dot product — but we keep the full formula so
    the helper works on any input vector.
    """
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    na = np.linalg.norm(va)
    nb = np.linalg.norm(vb)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))
