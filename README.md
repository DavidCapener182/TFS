# TFS Assurance Platform (Fresh Start)

This repository is now a clean TFS baseline with all Supabase dependencies and migrations removed.

## Current State

- Frontend framework: Next.js + TypeScript
- Data/auth layer: mock/no-op stubs only
- Database migrations: removed
- Import/backfill scripts tied to old backend: removed

## Run

```bash
npm install
npm run dev
```

## Notes

- This is intentionally backend-free so we can rebuild for TFS.
- When adding a real database schema later, use `tfs_` as the table/enum prefix.
