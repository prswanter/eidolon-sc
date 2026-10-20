# Coding Standards

Judgement calls the reviewer enforces on a diff. Anything a tool can check lives in the tool instead: `ruff check`, `pyright`, `tsc`, run by CI (`.github/workflows/ci.yml`).

## Tests

Every test earns its place by being the one test that catches a behaviour breaking. Flag a **redundant test**, naming the existing test that already catches it and the code path both run:

- **Same path, another file.** A test exercises a code path that a test in a neighbouring file already drives, e.g. the same `own_keys` branch checked from `test_own_keys.py` and again end to end from `test_own_llm.py`. Keep the one at the seam that owns the behaviour.
- **Same setup, assertions split.** Two tests build the same fixtures and send the same input, then assert different parts of the outcome. They belong in one test asserting all of it.
- **Parameters that don't branch.** A `parametrize` / `it.each` row runs the same branch as another row and differs only in data the code under test treats alike. Keep one row per branch. A row is a test, so 4 × 10 rows over one guard is forty tests of one `if`.
- **Prefix of another case.** A case's input and assertions are a strict prefix of a longer case's.
- **Holds by construction.** A test asserts a constant, a type the compiler already checks, or the framework's own behaviour (pydantic answering 422 on a missing field, argparse rejecting an unknown subcommand).

When folding tests together, every assertion survives. A loop over inputs inside one test labels each `expect`/`assert` with its input, so a failure still names the case.
