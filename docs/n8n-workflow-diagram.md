# N8N Automation Workflow Diagram

This mermaid diagram illustrates the complete 3-phase LinkedIn lead warming automation workflow where n8n orchestrates all business logic while Puppeteer scripts handle only browser interactions.

```mermaid
graph TD
    A[Trigger: LinkedIn Profile URL] --> B[Execute login.js]
    B --> C{Session Valid?}
    C -->|No| B
    C -->|Yes| D[PHASE 1: Execute view-profile.js]
    
    D --> E{Profile Viewed Successfully?}
    E -->|Error| F[Handle Error/Retry]
    F --> D
    E -->|Success| G[Create PostgreSQL Record]
    
    G --> H[Call Twenty CRM API<br/>Status: 'Viewed Profile']
    H --> I[Schedule Phase 2<br/>Delay: PHASE_1_TO_2_DELAY_DAYS]
    
    I --> J[Wait Period] 
    J --> K[PHASE 2: Execute engage-with-post.js]
    
    K --> L{Post Engagement Success?}
    L -->|Error| M[Handle Error/Retry]
    M --> K
    L -->|Success| N[Call LLM API<br/>Generate Comment]
    
    N --> O[Create Linear Task<br/>Human Review Comment]
    O --> P[Call Twenty CRM API<br/>Status: 'Engaged with Post']
    P --> Q[Schedule Phase 3<br/>Delay: PHASE_2_TO_3_DELAY_DAYS]
    
    Q --> R[Wait Period]
    R --> S[PHASE 3: Read Lead Data from DB]
    S --> T[Create Linear Task<br/>Connection Request]
    T --> U[Call Twenty CRM API<br/>Status: 'Connection Task Created']
    U --> V[Update DB State: 'completed']
    
    %% Session Management
    D -.->|Session Expired| B
    K -.->|Session Expired| B
    
    %% Database Operations
    G -.-> W[(PostgreSQL<br/>Lead State)]
    I -.-> W
    P -.-> W
    S -.-> W
    V -.-> W
    
    %% External Systems
    H -.-> X[Twenty CRM]
    P -.-> X
    U -.-> X
    N -.-> Y[LLM API<br/>OpenAI/Gemini]
    O -.-> Z[Linear Tasks]
    T -.-> Z
    
    classDef phase1 fill:#e1f5fe
    classDef phase2 fill:#f3e5f5
    classDef phase3 fill:#e8f5e8
    classDef external fill:#fff3e0
    classDef error fill:#ffebee
    
    class D,E,G,H,I phase1
    class K,L,N,O,P,Q phase2
    class S,T,U,V phase3
    class X,Y,Z external
    class F,M error
```

## Workflow Phases

### Phase 1: Profile View (Blue)
- Execute view-profile.js script
- Create PostgreSQL record
- Update Twenty CRM with "Viewed Profile" status
- Schedule Phase 2

### Phase 2: Post Engagement (Purple)
- Execute engage-with-post.js script
- Generate personalized comment via LLM
- Create Linear task for human review
- Update Twenty CRM with "Engaged with Post" status
- Schedule Phase 3

### Phase 3: Connection Request (Green)
- Create Linear task for connection request
- Update Twenty CRM with "Connection Task Created" status
- Mark workflow as completed

## Key Components

- **Orange nodes**: External systems (Twenty CRM, LLM API, Linear)
- **Red nodes**: Error handling and retry logic
- **Dotted lines**: Session management and database operations