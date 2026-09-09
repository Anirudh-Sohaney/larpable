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
"""
import json, sys
from sentence_transformers import SentenceTransformer

data = json.load(sys.stdin)
if not data:
    print('{}')
else:
    model = SentenceTransformer('BAAI/bge-large-en-v1.5', device='cpu')
    out = {}
    for item in data:
        if isinstance(item, str):
            term = item
            texts = [item]
        else:
            term = item['term']
            texts = [term] + (item.get('sentences') or []) + (item.get('synonyms') or [])
        vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        avg = [float(sum(vecs[j][i] for j in range(vecs.shape[0]))) / vecs.shape[0] for i in range(vecs.shape[1])]
        norm = sum(v * v for v in avg) ** 0.5
        if norm:
            avg = [v / norm for v in avg]
        out[term] = [round(float(x), 8) for x in avg]
    print(json.dumps(out, separators=(',', ':')))