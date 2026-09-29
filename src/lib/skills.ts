/**
 * Skills taxonomy shown on the homepage.
 *
 * Deliberately the same list as the master resume's full taxonomy
 * (career/raghuram-portfolio/master.tex), not a curated subset — the resume
 * variants trim per role, but the portfolio isn't targeting one role, and
 * naming stays consistent across résumé, portfolio, and LinkedIn by design.
 */
export interface SkillGroup {
  category: string;
  items: string[];
}

export const skillGroups: SkillGroup[] = [
  {
    category: "AI / GenAI",
    items: [
      "Multi-Agent Orchestration (CrewAI)",
      "RAG",
      "LLM Routing",
      "Prompt & Context Engineering",
      "ReAct",
      "AWS Bedrock",
      "Azure OpenAI",
      "Cohere Rerank",
      "Tree-sitter",
      "Vector DBs & Embeddings",
    ],
  },
  {
    category: "Backend & APIs",
    items: [
      "FastAPI",
      "gRPC",
      "REST",
      "GraphQL",
      "SSE / Streaming APIs",
      "Async Processing",
      "Pydantic",
      "JWT Auth",
    ],
  },
  {
    category: "Frontend",
    items: [
      "Angular (Standalone Components, RxJS, Signals)",
      "React",
      "Next.js",
      "Monaco Editor",
      "SCSS",
      "Tailwind CSS",
      "GSAP",
    ],
  },
  {
    category: "Databases & Storage",
    items: [
      "PostgreSQL",
      "Redis",
      "MongoDB",
      "ChromaDB",
      "Qdrant",
      "SQLite (FTS5, sqlite-vec)",
      "asyncpg",
      "SQLAlchemy",
      "Alembic",
    ],
  },
  {
    category: "Messaging & Real-Time",
    items: [
      "Apache Kafka",
      "Redis Streams (Pub/Sub)",
      "Server-Sent Events (SSE)",
      "WebSockets",
      "Event-Driven Architecture",
    ],
  },
  {
    category: "Cloud & DevOps",
    items: [
      "AWS (Bedrock, RDS IAM)",
      "Azure (DevOps Pipelines, Static Web Apps, App Services, Artifacts)",
      "Docker",
      "Kubernetes",
      "Nginx",
      "CI/CD (Azure Pipelines, GitHub Actions)",
    ],
  },
  {
    category: "Architecture",
    items: [
      "Distributed Systems",
      "Microservices",
      "Micro-Frontend",
      "Real-Time Streaming",
      "Multi-Agent Systems",
      "Event-Driven Design",
      "Monorepo",
    ],
  },
  {
    category: "Observability & Testing",
    items: ["OpenTelemetry", "Prometheus", "Grafana", "pytest", "Jest", "Karma", "Playwright"],
  },
];
