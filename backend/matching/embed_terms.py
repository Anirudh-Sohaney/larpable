"""Embed taxonomy terms for the matching engine.

Reads JSON from stdin and writes {term: vector} to stdout.

Two input shapes:
  ["term", ...]                                    -> embed each term as-is
  [{"term": "...", "sentences": [...], "synonyms": [...]}, ...]
                                                   -> embed the term together
                                                      with its definition
                                                      sentences and synonyms,
                                                      then average and normalize
                                                      so the stored vector is
                                                      attracted toward the
                                                      intended sense (important
                                                      for technical terms and
                                                      multi-meaning words).

Environment:
  EMBED_MODEL   Hugging Face model id. Default BAAI/bge-large-en-v1.5, a
                335M-parameter BERT that returns 1024-dimension embeddings —
                the same model and width as the vectors already in vectors.json.
  EMBED_DIMS    Expected vector width. Default 1024. The script refuses to emit
                vectors of any other width, so a model swap can never silently
                mix dimensions inside vectors.json.
  EMBED_DEVICE  Torch device. Default cpu (the server has no GPU).

Any failure (missing dependency, unreachable model, wrong width) is reported on
stderr and exits non-zero, so the caller can surface the real reason. Only JSON
is ever written to stdout.
"""
import json, os, sys
from sentence_transformers import SentenceTransformer

MODEL = os.environ.get("EMBED_MODEL") or "BAAI/bge-large-en-v1.5"
DIMS = int(os.environ.get("EMBED_DIMS") or "1024")
DEVICE = os.environ.get("EMBED_DEVICE") or "cpu"


def fail(message):
    print(message, file=sys.stderr)
    sys.exit(2)


data = json.load(sys.stdin)
if not data:
    print('{}')
else:
    model = SentenceTransformer(MODEL, device=DEVICE)
    out = {}
    for item in data:
        if isinstance(item, str):
            term = item
            texts = [item]
        else:
            term = item['term']
            texts = [term] + (item.get('sentences') or []) + (item.get('synonyms') or [])
        vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        width = int(vecs.shape[1])
        if width != DIMS:
            fail(f"{MODEL} returns {width}-dimension vectors, expected {DIMS}")
        avg = [float(sum(vecs[j][i] for j in range(vecs.shape[0]))) / vecs.shape[0] for i in range(width)]
        norm = sum(v * v for v in avg) ** 0.5
        if norm:
            avg = [v / norm for v in avg]
        out[term] = [round(float(x), 8) for x in avg]
    print(json.dumps(out, separators=(',', ':')))
