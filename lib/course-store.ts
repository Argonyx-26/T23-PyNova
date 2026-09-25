export type CourseSubject = "Fractions" | "Algebra" | "Biology" | "General";

export interface CourseTopic {
  id: string;
  title: string;
  subject: CourseSubject;
  material: string;
  createdAt: number;
}

// Module-level singleton, same pattern as class-store. Holds the portions
// and material the teacher uploaded; students read it live.
// Resets on server restart — fine for the demo.
const topics: CourseTopic[] = [];
let version = 0;

export function listTopics(): CourseTopic[] {
  return [...topics].sort((a, b) => b.createdAt - a.createdAt);
}

export function addTopic(input: { title: string; subject: CourseSubject; material: string }): CourseTopic {
  const topic: CourseTopic = {
    id: `topic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: input.title,
    subject: input.subject,
    material: input.material,
    createdAt: Date.now(),
  };
  topics.unshift(topic);
  // Cap stored material so memory stays bounded during long demo sessions.
  if (topics.length > 50) topics.length = 50;
  version += 1;
  return topic;
}

export function deleteTopic(id: string): boolean {
  const idx = topics.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  topics.splice(idx, 1);
  version += 1;
  return true;
}

export function getContentVersion(): number {
  return version;
}

// Seed material so students see portions even before the teacher uploads.
// Adds each baseline topic individually, so a store that already has teacher
// uploads still gets the full baseline for quiz generation.
const DEFAULT_TOPICS: { title: string; subject: CourseSubject; material: string }[] = [
  {
    title: "Common Denominator — Class Notes",
    subject: "Fractions",
    material:
      "To add fractions like 1/2 + 1/3, first find a common denominator (the LCM of the bottoms). " +
      "1/2 = 3/6 and 1/3 = 2/6, so 1/2 + 1/3 = 5/6. Never add the denominators straight across. " +
      "For comparing fractions with the same numerator, the smaller denominator is the bigger fraction: 1/4 > 1/8.",
  },
  {
    title: "Moving Terms in Equations",
    subject: "Algebra",
    material:
      "When you move a term across the equals sign, its sign flips: x - 5 = 10 becomes x = 10 + 5 = 15. " +
      "Distribute multiplication to EVERY term inside brackets: 2(x + 3) = 2x + 6. " +
      "Only like terms combine: 3x + 2 stays 3x + 2, but 4x + 3x = 7x. Do the same operation to both sides.",
  },
  {
    title: "Photosynthesis Basics",
    subject: "Biology",
    material:
      "Plants make food from air and light, not from soil. Photosynthesis: light + CO2 + water makes glucose. " +
      "Chlorophyll catches the light. Plants respire day and night through stomata. " +
      "Cell walls are found only in plant cells; cells are 3D factories, not flat bags.",
  },
];

export function seedDefaultMaterial(): void {
  const existing = new Set(topics.map((t) => t.title));
  for (const d of DEFAULT_TOPICS) {
    if (!existing.has(d.title)) addTopic(d);
  }
}
