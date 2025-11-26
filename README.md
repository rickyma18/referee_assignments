🧩 Assigner TDP — Automated Referee Assignment System

Assigner TDP is an automated engine for assigning referee crews (terna arbitral) for Liga TDP.
It manages league → group → matchday → match structures, applies federative rules, validates conflicts, calculates suitability scores (MDS), and suggests optimal referee assignments with full transparency.

Built with Next.js 16, Shadcn UI, TypeScript, Firebase Admin SDK, and Firestore — a modern, scalable admin platform designed for operational use by real sports leagues in Mexico.

🎯 What Assigner TDP Does

Automatically suggests complete referee crews (central + assistant 1 + assistant 2).

Validates conflicts such as team repetition, historical clashes, and role frequency.

Applies internal league rules, seniority restrictions, and custom constraints.

Generates MDS (Match Difficulty Score) to balance referee difficulty loads.

Provides a powerful admin dashboard to manage leagues, groups, matchdays, matches, and referees.

Syncs with Firestore using strict RBAC-style Firestore rules and audited writes.

Includes manual override tools for coordinators and superusers.

This project replaces manual spreadsheets and error-prone assignment workflows with a centralized, automated, scalable system.

🚀 Tech Stack

Framework: Next.js 16 (App Router), TypeScript, React Server Components

UI: Shadcn UI (customized components), Tailwind CSS v4

Database: Firebase Firestore (deep nested league/matchday modeling)

Backend: Firebase Admin SDK (secure server-side operations)

Validation: Zod (schema validation for all payloads)

State Management: Zustand + React Hook Form

Tables: TanStack Table with column filters and sorting

Auth: Firebase Auth + secure Admin API routes

Tooling: ESLint, Prettier, Husky, GitHub Actions

📊 Core Features
🟦 Referee Assignment Engine

Loads candidate pool by availability, category, league permissions

Splits roles (central, assistant 1, assistant 2)

Applies internal rules (RA-XX series), referee restrictions, and federation rules

Calculates MDS for difficulty balancing

Filters, sorts, and picks best candidates per match

Supports batch generation for entire matchdays

🟨 Conflict Detection

Automatically flags:

Repeated teams

Excess games officiated for the same club

Role overuse

Forbidden combinations

Pair conflicts between assistants

Missing availability

🟥 Internal Rules System

Superuser-only engine defining exceptions such as:

Referee cannot officiate X team

Must avoid assistant pairing

Forced assignments

Score penalties/boosts

Overrides for special cases

All rules are versioned and stored in Firestore.

🖥 Admin Dashboard Features

League → Group → Matchday → Match navigation

CRUD for referees, teams, leagues, matchdays, matches

Real-time Firestore updates

Assignment view with manual adjustment tools

Performance-optimized data tables

Dark/light mode themes

Collapsible sidebar & adaptive layout

📁 Folder Architecture (Colocation-Based)

The project uses a colocation architecture, where each route owns its:

Components

Actions

Schemas

Hooks

UI logic

Shared code lives under /components, /lib, and /server.

Example:

/dashboard/leagues/[leagueId]/groups/[groupId]/matchdays/[matchdayId]/matches
  ├── components/
  ├── actions/
  ├── schema/
  ├── page.tsx
  └── helpers.ts


This makes the system fully modular and scalable as the league grows.

🏗 Getting Started
1. Clone the repository
git clone https://github.com/rickyma18/assigner-tdp.git

2. Install dependencies
npm install

3. Add Firebase Admin credentials

Set up your environment variables:

GOOGLE_CLOUD_CREDENTIALS_JSON="{}"
NEXT_PUBLIC_FIREBASE_CONFIG="{}"

4. Start development server
npm run dev


Runs at: http://localhost:3000

🔒 Security Notes

All write operations use Firebase Admin on the server only

Firestore rules enforce strict role-based access

Sensitive operations require coordinator or superuser roles

Internal rules (RA-XX) bypass normal scoring when explicitly allowed

No client-side access to assignment logic

🤝 Contributing

This is an active project.
Issues, feature proposals, and improvements are welcome.

If you're reviewing or contributing:
please pull the latest major changes, as the assignment logic evolves rapidly.

⚽ About the Project

Assigner TDP is developed by SAURIC S.A. de C.V., creators of tools and systems for professional refereeing and sports administration in Mexico.

This system is actively used to improve fairness, efficiency, and transparency in referee assignments.
