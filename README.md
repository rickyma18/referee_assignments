# 🧩 Assigner TDP — Automated Referee Assignment System

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=nextdotjs" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" />
  <img src="https://img.shields.io/badge/Shadcn_UI-white?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white" />
</p>

<p align="center">
  <strong>Automated, rule-driven referee assignment engine for Liga TDP</strong><br/>
  Built with Next.js 16, Firebase Admin, Shadcn UI, and a modular colocation architecture.
</p>

---

# 📚 Table of Contents
- [Overview](#overview)
- [Core Features](#core-features)
- [Assignment Engine](#assignment-engine)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Screenshots](#screenshots)
- [Getting Started](#getting-started)
- [Security](#security)
- [Roadmap](#roadmap)
- [About](#about)

---

# 📝 Overview

**Assigner TDP** is a centralized system used to automate the assignment of referee crews (terna arbitral) for **Liga TDP**.

It replaces spreadsheets and manual workflows with:
- Conflict detection  
- Rule enforcement  
- Difficulty balancing (MDS)  
- Real-time Firestore synchronization  
- A powerful admin dashboard for coordinators and superusers  

This system is actively developed and maintained by **SAURIC S.A. de C.V.**

---

# ⭐ Core Features

## 🟦 Automated Referee Assignment
- Suggests full crews: **Central, Assistant 1, Assistant 2**
- Applies league rules, seniority constraints, and RA-XX overrides
- Calculates MDS (Match Difficulty Score)
- Splits candidates by role and filters based on availability, history, and rules

## 🟥 Conflict Detection
- Team repetition  
- Pair conflicts between assistants  
- Excessive frequency with same club  
- Forbidden combinations  
- Missing availability  
- Seniority and tier mismatches  

## 🟨 Admin Dashboard
- League → Group → Matchday → Match navigation  
- CRUD for Referees, Teams, Matchdays, Matches  
- Manual override tools for coordinators  
- Table filtering, sorting, and pagination  
- Dark/light mode themes  
- Collapsible sidebar  

---
# 🔧 Assignment Engine

Below is the simplified flowchart of the assignment engine:

```mermaid
flowchart TD
    A[Load Match] --> B[Load Candidate Pool]
    B --> C[Filter by Availability]
    C --> D[Split by Role: Central / A1 / A2]
    D --> E[Apply Internal Rules RA-XX]
    E --> F[Compute MDS Score]
    F --> G[Sort Candidates by Priority]
    
    G --> H[Pick Central]
    H --> I[Pick Assistant 1]
    I --> J[Pick Assistant 2 (avoid pair conflicts)]
    
    J --> K{Valid Crew?}
    K -- Yes --> L[Return Suggested Terna]
    K -- No --> M[Fallback Logic / Manual Review]
