---
id: 28
title: "Entity pages: clients/projects routes, contacts, search"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

The clients & projects pages plan (`docs/2026-09-18-clients-and-projects-pages.md`) moves structure editing out of Admin, adds contact data and detail routes. Record how this refines the standing decisions before code.

## Decision (from plan review)

- **Refines #11.** The three-tab reporting design gains two entity-centric pages (`/clients`, `/clients/$clientId`, `/projects`, `/projects/$projectId`) reusing its trio-everywhere signature. `/admin/clients` and `/admin/projects` are deleted; the admin sub-nav starts at 'Jobs'. Structure actions live on detail pages in an admin-only 'Manage' card; `StructureTree` stays for `/admin/jobs` and the reports admin panel.
- **Refines #5 — new abilities:** `edit_client_contacts` (admin) and `view_client_contacts` (all roles). Contacts and address are visible to everyone — they are not money (consistent with the #7 disclosure posture).
- **Refines #4.** The `clients` table gains contact/address columns and a `client_contacts` child table (primary flag exclusive; archivable; never hard-deleted).
- **Data rules:** list rows carry cheap SQL aggregates only (effort minutes, last activity, money-gated billable value); wall-clock union and premium appear only on detail pages via day-splitting. "Costs" = billable value at snapshot rate, no cost-rate concept. Overtime is per worker per local day above `defaultDayMinutes`, pro-rata attributed to projects by effort (`src/lib/overtime.ts`); weekend days count like weekdays. Search (`q`) matches clients by name/contact name/contact email, projects by name and client name; filters are URL search params. Detail-page period defaults to a new 'All time' preset; invoices stay computed on demand (`/invoice?clientId&from&to`), no invoice table.

### Implications

- #11: two entity pages extend the reporting surface.
- #5: two new abilities in the matrix.
- #4: `clients` columns + `client_contacts` child table.
- Nav order keeps the final sequence Today · Reports · Clients · Projects · Approvals · Team · Leave · Admin.
