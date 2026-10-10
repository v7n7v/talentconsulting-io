export interface LandingExample {
  id: "designer" | "engineer" | "marketer";
  role: string;
  source: string;
  skills: readonly string[];
  gap: string;
  rewrite: string;
  result: string;
  requirements: readonly { label: string; evidence?: string }[];
  retainedFacts: readonly string[];
}

export const LANDING_EXAMPLES: readonly LandingExample[] = [
  {
    id: "designer",
    role: "Product Designer",
    source:
      "Led the checkout redesign using Figma and user research that increased completion by 18%.",
    skills: ["Figma", "User research", "Checkout"],
    gap: "People-management experience is not shown in this excerpt",
    requirements: [
      { label: "Figma", evidence: "Figma" },
      { label: "User research", evidence: "user research" },
      { label: "People management" },
    ],
    retainedFacts: ["Figma", "User research", "Checkout redesign", "18% increase"],
    result: "Completion increased 18%",
    rewrite:
      "Using Figma and user research, led the checkout redesign that increased completion by 18%.",
  },
  {
    id: "engineer",
    role: "Software Engineer",
    source:
      "Built a TypeScript and Node.js API using caching that reduced latency by 30%.",
    skills: ["TypeScript", "Node.js", "Caching"],
    gap: "AWS certification is not shown in this excerpt",
    requirements: [
      { label: "TypeScript", evidence: "TypeScript" },
      { label: "Node.js", evidence: "Node.js" },
      { label: "AWS certification" },
    ],
    retainedFacts: ["TypeScript", "Node.js", "Caching", "30% lower latency"],
    result: "Latency reduced 30%",
    rewrite:
      "Built a TypeScript and Node.js API with caching, reducing latency by 30%.",
  },
  {
    id: "marketer",
    role: "Marketing Manager",
    source:
      "Ran an email campaign using HubSpot that increased qualified leads by 22%.",
    skills: ["HubSpot", "Email campaigns", "Lead generation"],
    gap: "Enterprise budget ownership is not shown in this excerpt",
    requirements: [
      { label: "HubSpot", evidence: "HubSpot" },
      { label: "Email campaigns", evidence: "email campaign" },
      { label: "Enterprise budget ownership" },
    ],
    retainedFacts: ["HubSpot", "Email campaign", "Qualified leads", "22% increase"],
    result: "Qualified leads increased 22%",
    rewrite:
      "Using HubSpot, ran an email campaign that increased qualified leads by 22%.",
  },
];
