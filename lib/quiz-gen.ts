import type { CourseTopic } from "./course-store";

export interface GeneratedQuestion {
  q: string;
  options: [string, string, string, string];
  answer: number;
  tag: string;
  expectedReasoning: string;
  sourceTopicId: string;
  sourceTopicTitle: string;
  source: "material";
}

// ---- Deterministic material-based question generation ----
// Derives quiz items directly from the teacher's uploaded portions:
//  1. Key-fact MCQs from important sentences in the material.
//  2. Numeric problems when the material contains fraction equations.

function splitSentences(material: string): string[] {
  return material
    .split(/[.;]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 18);
}

// Extract the "key clause" of a sentence — usually after the colon or the verb.
function keyClause(sentence: string): string {
  const colonIdx = sentence.indexOf(":");
  if (colonIdx > 0 && colonIdx < sentence.length - 4) return sentence.slice(colonIdx + 1).trim();
  return sentence;
}

function shuffleStable<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function fractionProblem(topic: CourseTopic, idx: number): GeneratedQuestion | null {
  // Match "a/b + c/d = e/f" style facts in the material.
  const m = topic.material.match(/(\d+)\/(\d+)\s*\+\s*(\d+)\/(\d+)\s*=\s*(\d+)\/(\d+)/);
  if (m) {
    const [a, b, c, d, e, f] = m.slice(1).map(Number);
    const wrong = shuffleStable(
      [
        `${a + c}/${b + d}`,
        `${a * c}/${b * d}`,
        `${e + 1}/${f}`,
      ],
      idx + 7,
    );
    return {
      q: `${a}/${b} + ${c}/${d} = ? Follow the method from "${topic.title}".`,
      options: [`${e}/${f}`, wrong[0], wrong[1], wrong[2]],
      answer: 0,
      tag: `mat-${topic.id}`,
      expectedReasoning:
        `Common denominator from the class notes: ${a}/${b} = ${Math.round((e * b) / f)}/${f}, ` +
        `${c}/${d} = ${Math.round((e * d) / f)}/${f}, sum = ${e}/${f}.`,
      sourceTopicId: topic.id,
      sourceTopicTitle: topic.title,
      source: "material",
    };
  }
  // Match "x - n = m" algebra facts.
  const am = topic.material.match(/x\s*-\s*(\d+)\s*=\s*(\d+)\s*becomes\s*x\s*=\s*(\d+)\s*\+\s*(\d+)?/i);
  if (am) {
    const n = Number(am[1]);
    const rhs = Number(am[2]);
    const correct = rhs + n;
    const wrong = shuffleStable([String(rhs - n), String(rhs), String(correct * 2)], idx + 3);
    return {
      q: `Solve x - ${n} = ${rhs}. Show the move from "${topic.title}".`,
      options: [String(correct), wrong[0], wrong[1], wrong[2]],
      answer: 0,
      tag: `mat-${topic.id}`,
      expectedReasoning: `Move ${n} across the equals sign and flip the sign: x = ${rhs} + ${n} = ${correct}.`,
      sourceTopicId: topic.id,
      sourceTopicTitle: topic.title,
      source: "material",
    };
  }
  return null;
}

export function generateQuestionsFromTopics(topics: CourseTopic[]): GeneratedQuestion[] {
  const out: GeneratedQuestion[] = [];
  let idx = 0;
  // Global pool of key clauses across ALL uploaded portions — lets short
  // topics still get real distractors drawn from the class material.
  const globalClauses = topics.flatMap((t) => splitSentences(t.material).slice(0, 6).map(keyClause));
  for (const topic of topics) {
    const fp = fractionProblem(topic, idx);
    if (fp) out.push(fp);
    // Key-fact questions: up to 2 per topic from the most informative sentences.
    const sentences = splitSentences(topic.material).slice(0, 6);
    for (const sentence of sentences.slice(0, 2)) {
      const clause = keyClause(sentence);
      // Distractors: clauses from other sentences of the same material first,
      // then from the rest of the uploaded portions.
      const localOthers = sentences.filter((s) => s !== sentence).map(keyClause);
      const poolOthers = globalClauses.filter((c) => c !== clause && !localOthers.includes(c));
      const others = [...localOthers, ...poolOthers];
      if (others.length < 1) continue;
      const wrong = shuffleStable(others, idx + 11).slice(0, 3);
      const fillers = ["None of the above", "Cannot be determined from the portion", "Not covered in class"];
      while (wrong.length < 3) wrong.push(fillers[wrong.length % fillers.length]);
      // When the clause is the whole sentence (no colon), ask which rule
      // comes from the portion instead of an awkward blank fill.
      const stem =
        clause === sentence
          ? `Per the teacher's portion "${topic.title}", which statement is correct?`
          : `Fill the blank from "${topic.title}": ${sentence.replace(clause, "_____").slice(0, 140)}`;
      out.push({
        q: stem,
        options: [clause.slice(0, 90), wrong[0].slice(0, 90), wrong[1].slice(0, 90), wrong[2].slice(0, 90)] as GeneratedQuestion["options"],
        answer: 0,
        tag: `mat-${topic.id}`,
        expectedReasoning: `Directly from the uploaded portion: "${sentence.slice(0, 160)}"`,
        sourceTopicId: topic.id,
        sourceTopicTitle: topic.title,
        source: "material",
      });
      idx += 1;
    }
    idx += 1;
  }
  // Shuffle so the correct answer is not always option 1 in display order.
  return out.map((q, i) => {
    const correct = q.options[q.answer];
    const opts = shuffleStable(q.options, i + 5);
    return { ...q, options: opts as GeneratedQuestion["options"], answer: opts.indexOf(correct) };
  });
}
