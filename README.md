🧩 Assigner TDP — Automated Referee Assignment System
<p align="center"> <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=nextdotjs" /> <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" /> <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" /> <img src="https://img.shields.io/badge/Shadcn_UI-white?style=for-the-badge&logo=react&logoColor=black" /> <img src="https://img.shields.io/badge/Tailwind_CSS-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white" /> </p> <p align="center"> <strong>Automated, rule-driven referee assignment engine for Liga TDP</strong><br/> Built with Next.js 16, Firebase Admin, Shadcn UI, and a modular colocation architecture. </p>
📚 Table of Contents

Overview

Core Features

Assignment Engine

Tech Stack

Architecture

Getting Started

Security

Roadmap

About

📝 Overview

Assigner TDP is a centralized system used to automate the assignment of referee crews (terna arbitral) for Liga TDP.

It replaces spreadsheets and manual workflows with:

Conflict detection

Rule enforcement

Difficulty balancing (MDS)

Real-time Firestore synchronization

A powerful admin dashboard for coordinators and superusers

This system is actively developed and maintained by SAURIC S.A. de C.V..

⭐ Core Features
🟦 Automated Referee Assignment

Suggests full crews: Central, Assistant 1, Assistant 2

Applies league rules, seniority constraints, and RA-XX overrides

Calculates MDS (Match Difficulty Score)

Splits candidates by roles and filters based on availability & history

🟥 Conflict Detection

Team repetition

Pair conflicts (assistant/assistant)

Excessive team frequency

Forbidden combinations

Missing availability

Seniority mismatches

🟨 Admin Dashboard

League → Group → Matchday → Match navigation

CRUD for Referees, Teams, Matchdays, Matches

Manual adjustment tools

Superuser control panel

Table filtering, sorting, pagination (TanStack Table)

Light/Dark themes

Collapsible sidebar layout

🔧 Assignment Engine

The engine runs entirely server-side through Firebase Admin SDK.
Below is a simplified flowchart of the real logic:

flowchart TD
    A[Load Match] --> B[Load Candidate Referees]
    B --> C[Filter by Availability]
    C --> D[Split by Role (Central, A1, A2)]
    D --> E[Apply Internal Rules (RA-XX)]
    E --> F[Calculate MDS Score]
    F --> G[Sort Candidates by Priority]
    
    G --> H[Pick Central]
    H --> I[Pick Assistant 1]
    I --> J[Pick Assistant 2 (avoid pair conflicts)]
    
    J --> K{Valid Crew?}
    K -- Yes --> L[Return Suggested Terna]
    K -- No --> M[Fallback Logic / Manual Review Required]

🧰 Tech Stack
Frontend

Next.js 16 (App Router)

TypeScript

Shadcn UI

Tailwind CSS v4

Backend

Firebase Admin SDK

Firestore

Server Actions (Next.js)

Zod validation

State & Forms

Zustand

React Hook Form

Tables

TanStack Table v8

Tooling

ESLint

Prettier

Husky

GitHub Actions

pnpm / npm

🏗 Architecture

This project uses a colocation-based file structure, where each route contains its own:

Components

Schemas

Server actions

Hooks

UI logic

Helpers

Example:

/dashboard/leagues/[leagueId]/groups/[groupId]/matchdays/[matchdayId]/matches
  ├── components/
  ├── actions/
  ├── schema/
  ├── helpers/
  ├── page.tsx
  └── types.ts


Shared logic lives under:

/components
/lib
/server
/domain


This approach scales extremely well for deeply nested data like leagues → groups → matchdays → matches.

🚀 Getting Started
1. Clone the repository
git clone https://github.com/rickyma18/assigner-tdp.git

2. Install dependencies
npm install

3. Configure Firebase Admin

Set your environment variables:

GOOGLE_CLOUD_CREDENTIALS_JSON="{}"
NEXT_PUBLIC_FIREBASE_CONFIG="{}"

4. Start the dev server
npm run dev


App will run at: http://localhost:3000

🔐 Security

All assignment logic runs on secure server actions (no client access)

Firestore rules enforce strict role-based access

Sensitive admin routes require coordinator or superuser roles

All writes are audited

Internal rules RA-XX act as controlled overrides

🛣 Roadmap
Coming soon:

Assignment history & reporting

Visual MDS difficulty heatmaps

Referee performance scoring

Multi-league support

CSV import/export for matchdays

API for mobile companion app

Full RBAC panel

⚽ About

Assigner TDP is developed by SAURIC S.A. de C.V., creators of referee and league-administration tools for Mexican football.

This system is used to improve fairness, transparency, and efficiency in referee assignments across Liga TDP.
