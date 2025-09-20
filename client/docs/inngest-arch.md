Here are the corrected Mermaid diagrams (fixed subgraph titles, participant names, and message text so they render reliably):

---

## 1) Production (Inngest Cloud orchestrating Next.js)

```mermaid
flowchart LR
  subgraph "Client/Services"
    A["Your App / Services"]:::box
  end

  subgraph "Inngest Cloud (SaaS)"
    B[("Event Store")]:::db
    C["Scheduler & Orchestrator"]:::svc
  end

  subgraph "Your Deployment (Vercel/Node)"
    D[/"/api/inngest route"/]:::route
    E["Inngest Function Code"]:::fn
    F[("DBs, Queues, APIs, Secrets")]:::db
  end

  A -- "inngest.send(event)" --> B
  B --> C
  C -- "POST signed webhook" --> D
  D --> E
  E --> F
  E -- "step.complete / next step" --> D
  D -- "200" --> C
  C -- "sleep / retry / fan-out" --> B

classDef box stroke:#666,fill:#f9f9ff;
classDef db stroke:#666,fill:#fff7e6;
classDef svc stroke:#666,fill:#eef9f2;
classDef route stroke:#666,fill:#e6f3ff;
classDef fn stroke:#666,fill:#f0f0f0;
```

---

## 2) Local Development (All on your machine)

```mermaid
flowchart LR
  subgraph "Local"
    A["Next.js dev server"]:::box
    D[/"/api/inngest route"/]:::route
    E["Inngest Functions"]:::fn
    F[("Local DB / .env")]:::db

    subgraph "Inngest Dev Server (localhost:8288)"
      B[("In-Memory Event Store")]:::db
      C["Local Orchestrator"]:::svc
      UI["Dev UI / Inspector"]:::svc
    end
  end

  A -- "import inngest SDK" --> C
  A -- "inngest.send(event)" --> B
  UI <-- "view / run / replay" --> C
  C -- POST --> D --> E --> F
  E -- "next step" --> D
  C -- "sleeps / retries" --> B

classDef box stroke:#666,fill:#f9f9ff;
classDef db stroke:#666,fill:#fff7e6;
classDef svc stroke:#666,fill:#eef9f2;
classDef route stroke:#666,fill:#e6f3ff;
classDef fn stroke:#666,fill:#f0f0f0;
```

---

## 3) Request/Step Timing Model (Vercel/Serverless)

```mermaid
sequenceDiagram
  participant Orchestrator as "Orchestrator (Cloud/Dev)"
  participant API as "/api/inngest"
  participant Step as "Fn Step"
  participant Data as "Your DB / APIs"

  Orchestrator->>API: POST (invoke step N)
  activate API
  API->>Step: run(step)
  activate Step
  Step->>Data: work (must finish under maxDuration)
  Data-->>Step: OK
  Step-->>API: return next
  deactivate Step
  API-->>Orchestrator: 200 (step complete)
  deactivate API
  Orchestrator-->>Orchestrator: sleep / schedule next call
  Orchestrator->>API: POST (invoke step N+1)
```
