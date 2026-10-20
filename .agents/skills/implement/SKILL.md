---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, at pre-agreed seams.

Run typechecking and single test files regularly. Before each commit, run `sh scripts/affected-tests.sh <fixed point>` (the commit before this work). The full suite is CI's: push the branch (a draft PR is what triggers CI) and read failures with `gh run view <run> --log-failed`.

Once done, use /code-review to review the work.

Commit your work to the current branch.
