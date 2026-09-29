# Employee groups and departments

Group membership is separate from employee identity, home factory, machine skills,
and daily assignment. A person can join multiple groups in different departments.
Group home factory is a management label, not an authorization or solver rule.
Department is optional because the source did not define a department hierarchy.

Source definitions: three forming staffing configurations and one packaging group
in factory 1; manual, automatic and packaging groups in factory 2. Import seven
groups with 29 employee/group links, including four pending alias links. Leave one
employee ungrouped rather than guessing. Source staffing quantities are group names
and provenance, not hard minimum crew-size or capacity constraints.

Only a boss can change definitions and membership. All authenticated members may
view them. The database RPC validates the complete catalog and expected schedule
version and commits it atomically. Direct authenticated writes are revoked. Omitted
group definitions are retired, not deleted. Changes have audit records. Skills,
employee identity, orders and schedule blocks remain unchanged.

The employee card can filter by group without hiding machine schedule lanes. The
group dialog supports department text, multi-group membership, explicit pending
membership confirmation, and retirement. Confirmation of a group link does not
merge employee aliases. The current Excel template lacks grouping and cannot replace
an already-grouped roster; separate historical workbook import remains available.

Production requires a new verified full database backup, then migration 0020 and
the reviewed private group input in one administrator transaction. Stop if the
production baseline changed or any identity cannot be matched uniquely. No source
roster JSON, workbook, database dump or credential belongs in this repository.

Local results: database 165 passed; frontend 41 passed; solver 85 passed; Vite
production build passed. Existing bundle-size and dependency deprecation warnings
remain. Browser smoke verification confirmed group creation, department entry,
member selection and the resulting membership badge on the employee card. These
results do not imply that production migration or deployment has occurred.
