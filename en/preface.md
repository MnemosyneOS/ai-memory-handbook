# Preface

Over the past year I have been asked the same question on many occasions: "We are already doing RAG — how is memory different from it?"

Behind that question lies a real confusion. RAG retrieves **external knowledge** — documents, manuals, policies — and its authority comes from the source; memory retrieves **experience** — what the user said, what the Agent did, how a conclusion was reached — and its authority comes from the process. When the former is wrong, you can swap the document; when the latter is wrong, you must rebuild the process. Handling both with the same retrieval engine produces a dangerous illusion: since both can be searched, both can be believed.

More troublesome still, the correctness standard for memory changes with its use. The same line, "the user prefers dark mode," when it is a supplementary sentence in a prompt, is merely a degraded experience if wrong; when it is an input to a recommender system, being wrong may constitute factual misinformation; when it is audit evidence, being wrong is a falsified record. The three demand of the same piece of data, respectively, "roughly right," "must be right," and "provably right" — and most systems implement only the first grade.

This handbook attempts to make this clear. It does not promise a universal solution, but offers three things: a judgment framework (what level of memory capability a given scenario needs), a set of verifiable mechanisms (which capabilities can be proven by script rather than declared by documentation), and an honest list of boundaries (as of October 2026, which problems remain unsolved).

## About Mnemosyne OS

The technical details in this handbook cite Mnemosyne OS extensively, not because it is superior, but because it satisfies two conditions at once: its design documents are consistent with its implementation source code, and its key capabilities can be verified locally. Readers can `pip install mnemosyne-os` and directly reproduce the behavior described in the book rather than trusting the prose.

It must be stated clearly that the book applies the same standard to it as to other systems: it writes its boundaries, its costs, and the things it has not yet achieved. Chapter 16 explicitly notes that its published benchmark scores have not yet been independently recomputed by a single complete run inside the repository; Chapter 23 lists arbitration of cross-Agent shared memory as an unsolved problem rather than claiming it is solved.

The core facts of Mnemosyne OS are as follows, so that readers can judge which content in the book is directly reproducible:

- Package name `mnemosyne-os`, current version 8.1.0.post1, MIT licensed, `Requires-Python >=3.8`
- Zero third-party dependencies at the core: `install_requires` is empty, with only three optional extras — `numpy`, `transformers`, `tiktoken`
- Four usage forms: Python library, CLI, HTTP API, MCP server
- Four-dimensional scope (`user_id` / `agent_id` / `run_id` / `app_id`) implemented as physical isolation, with each scope combination mapping to its own directory and its own SQLite file
- Single-pass ADD-only writing; without an API key, writing and recall are handled by a built-in deterministic rule extractor and a 128-dimensional embedder
- Five-signal retrieval (semantic + BM25 + entity graph + time + tags), with a calibrated relevance floor and lexical fallback
- SHA-256 hash-chained audit ledger; `verify_integrity()` returns `{valid, total, first_broken_at}`
- Four layers of deletion semantics (`forget` / `memory_mask` / cascade soft delete / physical delete), with `dry_run` preview support
- MCP `tools/list` returns 55 entries, of which 44 are native + 11 client-compatibility, including 3 deprecated aliases; after deduplication there are 52 distinct capabilities

All these numbers can be checked by the reader after installation; that is the sole reason this book cites it.

## About Other Systems

The book's descriptions of Mem0, Zep / Graphiti, Letta, LangMem, and Cloudflare Agents are based on official documentation and public repositories accessible as of October 30, 2026. Three notes:

First, these systems evolve quickly. Mem0 changed its write paradigm to single-pass ADD-only in 2026; if a reader encounters older material (two-phase ADD/UPDATE/DELETE), the latest official documentation should prevail.

Second, this book writes only boundaries for competitors, never weaknesses. For example, "no description of X was found in public documentation as of October 2026" is the book's standard phrasing, and it expresses "I did not find evidence," not "it does not exist."

Third, every capability comparison is date-stamped. The capability surface of memory systems changes quickly, and a comparison table from a year ago is very likely obsolete.

## About How This Book Is Written

Every judgment in the book is matched, as far as possible, with three things: a concrete failure scenario, a mechanism explanation, and a usage criterion. A judgment without a scenario is a slogan; an explanation without a mechanism is a conclusion; a recommendation without a criterion cannot be operationalized.

The book also explicitly states "under what conditions this judgment does not hold." This is not a disclaimer but a necessary part of engineering judgment — a scheme with no failure conditions usually means it has not yet been genuinely used.

If a reader finds that some number in the book does not match the original source, the original source should prevail, and corrections are welcome. The last thing the memory field needs is one more untraceable number.

---
