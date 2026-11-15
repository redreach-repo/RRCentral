Status: built and tested (draft)
Owner: Cursor
PR: (this batch)
Stubbed / unverified: embeddings / pgvector / live LLM answers

## What it does

`ai_knowledge_docs` with generated `tsvector` and `rr_ai_search_docs`. Edge `hm-ai-gateway` retrieves for signed-in staff and can return a stub answer from hits.

## Alfred

Apply `20261230210000_ai_retrieval_light.sql` and deploy `hm-ai-gateway`.
