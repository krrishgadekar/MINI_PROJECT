# CreditFlow — Agent Operating Rules

1. Build in the phase order given in Section 16 of the blueprint. Do not start frontend polish before the algorithms in Section 10 have passing unit tests.
2. Every module is done only when its stated acceptance criteria pass, not when the code merely runs. Write the tests from the criteria before declaring a module complete.
3. Use TypeScript strict mode in both client and server. Type-annotate all Python functions.
4. Never hardcode secrets, connection strings, or API keys. Use .env, and keep .env.example in sync with every new variable you introduce.
5. Follow the exact repository structure in Section 6 and the exact schema field names in Section 7 — do not silently rename fields.
6. Use conventional commits (feat:, fix:, test:, docs:, chore:), one logical change per commit.
7. After finishing each numbered module, write a short markdown summary of what was built and how it maps to its acceptance criteria, saved under docs/report-assets/ for later use in the team's written report.
8. Ask for explicit human confirmation before: deleting any data, deploying to a live/production environment, or deviating from the specified tech stack or algorithm approach in Sections 5 and 10–13.
9. If any instruction is ambiguous, default to the simplest interpretation consistent with the stated acceptance criteria — do not expand scope beyond what Section 2.2 lists as in-scope for v1.
10. Prefer small, reviewable diffs over large ones, especially for anything in algorithms/, concurrency/, or realtime/ — these are the modules the team must be able to explain personally.
