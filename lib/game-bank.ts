export interface GameQuestion {
  q: string;
  options: [string, string, string, string];
  answer: number;
  tag: string;
}

export interface GamePack {
  lessonId: string;
  title: string;
  questions: GameQuestion[];
}

export const GAME_PACKS: GamePack[] = [
  {
    lessonId: "frac-1",
    title: "Bubble Bay: Add Up",
    questions: [
      { q: "1/2 + 1/3 = ?", options: ["5/6", "2/5", "1/5", "3/6"], answer: 0, tag: "frac-add" },
      { q: "1/4 + 1/2 = ?", options: ["3/4", "2/6", "1/6", "2/4"], answer: 0, tag: "frac-add" },
      { q: "2/5 + 1/10 = ?", options: ["1/2", "3/15", "3/10", "2/15"], answer: 0, tag: "frac-add" },
      { q: "1/3 + 1/6 = ?", options: ["1/2", "2/9", "1/9", "2/6"], answer: 0, tag: "frac-add" },
      { q: "3/8 + 1/4 = ?", options: ["5/8", "4/12", "3/12", "4/8"], answer: 0, tag: "frac-add" },
    ],
  },
  {
    lessonId: "frac-2",
    title: "Size Swamp",
    questions: [
      { q: "Bigger: 1/4 or 1/8?", options: ["1/4", "1/8", "equal", "can't tell"], answer: 0, tag: "frac-equiv" },
      { q: "Bigger: 2/3 or 3/4?", options: ["3/4", "2/3", "equal", "can't tell"], answer: 0, tag: "frac-equiv" },
      { q: "Bigger: 1/2 or 3/8?", options: ["1/2", "3/8", "equal", "can't tell"], answer: 0, tag: "frac-equiv" },
      { q: "Bigger: 5/6 or 4/5?", options: ["5/6", "4/5", "equal", "can't tell"], answer: 0, tag: "frac-equiv" },
      { q: "Bigger: 1/10 or 1/9?", options: ["1/9", "1/10", "equal", "can't tell"], answer: 0, tag: "frac-equiv" },
    ],
  },
  {
    lessonId: "frac-3",
    title: "Multiply Peaks",
    questions: [
      { q: "2/3 × 3/4 = ?", options: ["1/2", "5/7", "1/1", "5/12"], answer: 0, tag: "frac-mult" },
      { q: "1/2 × 2/5 = ?", options: ["1/5", "3/7", "2/7", "1/7"], answer: 0, tag: "frac-mult" },
      { q: "3/5 × 5/9 = ?", options: ["1/3", "8/14", "15/45", "8/45"], answer: 0, tag: "frac-mult" },
      { q: "1/4 × 4/7 = ?", options: ["1/7", "5/11", "4/11", "1/11"], answer: 0, tag: "frac-mult" },
      { q: "2/7 × 7/8 = ?", options: ["1/4", "9/15", "2/15", "9/56"], answer: 0, tag: "frac-mult" },
    ],
  },
  {
    lessonId: "frac-4",
    title: "Divide Dungeon",
    questions: [
      { q: "1/2 ÷ 3/4 = ?", options: ["2/3", "3/8", "1/3", "3/6"], answer: 0, tag: "frac-div" },
      { q: "2/3 ÷ 1/6 = ?", options: ["4", "2/18", "3/9", "1/4"], answer: 0, tag: "frac-div" },
      { q: "3/5 ÷ 2/5 = ?", options: ["3/2", "6/25", "5/25", "1/2"], answer: 0, tag: "frac-div" },
      { q: "1/4 ÷ 1/2 = ?", options: ["1/2", "1/8", "2/6", "1/6"], answer: 0, tag: "frac-div" },
      { q: "5/6 ÷ 5/3 = ?", options: ["1/2", "25/18", "10/18", "1/3"], answer: 0, tag: "frac-div" },
    ],
  },
  {
    lessonId: "frac-5",
    title: "Decimal Bridge",
    questions: [
      { q: "3/8 = ?", options: ["0.375", "0.38", "3.8", "0.83"], answer: 0, tag: "frac-dec" },
      { q: "1/4 = ?", options: ["0.25", "0.4", "1.4", "0.14"], answer: 0, tag: "frac-dec" },
      { q: "7/10 = ?", options: ["0.7", "7.1", "0.17", "1.7"], answer: 0, tag: "frac-dec" },
      { q: "1/8 = ?", options: ["0.125", "0.8", "1.8", "0.18"], answer: 0, tag: "frac-dec" },
      { q: "2/5 = ?", options: ["0.4", "2.5", "0.25", "0.52"], answer: 0, tag: "frac-dec" },
    ],
  },
  {
    lessonId: "alg-1",
    title: "Sign Switch Forest",
    questions: [
      { q: "x − 5 = 10 → x = ?", options: ["15", "5", "2", "50"], answer: 0, tag: "alg-sign" },
      { q: "x + 7 = 12 → x = ?", options: ["5", "19", "84", "7"], answer: 0, tag: "alg-sign" },
      { q: "x − 3 = 11 → x = ?", options: ["14", "8", "33", "3"], answer: 0, tag: "alg-sign" },
      { q: "x + 9 = 20 → x = ?", options: ["11", "29", "180", "9"], answer: 0, tag: "alg-sign" },
      { q: "x − 8 = 8 → x = ?", options: ["16", "0", "64", "1"], answer: 0, tag: "alg-sign" },
    ],
  },
  {
    lessonId: "alg-2",
    title: "Distribute Falls",
    questions: [
      { q: "2(x + 3) = ?", options: ["2x + 6", "2x + 3", "x + 5", "2x + 5"], answer: 0, tag: "alg-dist" },
      { q: "3(a + 4) = ?", options: ["3a + 12", "3a + 4", "a + 7", "3a + 7"], answer: 0, tag: "alg-dist" },
      { q: "5(y − 2) = ?", options: ["5y − 10", "5y − 2", "y + 3", "5y + 3"], answer: 0, tag: "alg-dist" },
      { q: "4(m + 1) = ?", options: ["4m + 4", "4m + 1", "m + 5", "4m + 5"], answer: 0, tag: "alg-dist" },
      { q: "2(3x − 5) = ?", options: ["6x − 10", "6x − 5", "3x − 3", "6x − 3"], answer: 0, tag: "alg-dist" },
    ],
  },
  {
    lessonId: "alg-3",
    title: "Like-Term Lake",
    questions: [
      { q: "Simplify: 4x + 3x", options: ["7x", "7", "7x²", "12x"], answer: 0, tag: "alg-like" },
      { q: "Simplify: 3x + 2", options: ["3x + 2", "5x", "5", "6x"], answer: 0, tag: "alg-like" },
      { q: "Simplify: 9a − 4a", options: ["5a", "5", "5a²", "36a"], answer: 0, tag: "alg-like" },
      { q: "Simplify: 2b + 5", options: ["2b + 5", "7b", "7", "10b"], answer: 0, tag: "alg-like" },
      { q: "Simplify: 6y − y", options: ["5y", "6", "5", "6y²"], answer: 0, tag: "alg-like" },
    ],
  },
  {
    lessonId: "alg-4",
    title: "Balance Boss",
    questions: [
      { q: "2x = x + 7 → x = ?", options: ["7", "14", "9", "5"], answer: 0, tag: "alg-eq" },
      { q: "3x = x + 10 → x = ?", options: ["5", "10", "13", "30"], answer: 0, tag: "alg-eq" },
      { q: "5x = 2x + 12 → x = ?", options: ["4", "12", "19", "24"], answer: 0, tag: "alg-eq" },
      { q: "4x = x + 21 → x = ?", options: ["7", "21", "25", "84"], answer: 0, tag: "alg-eq" },
      { q: "2x + 3 = x + 9 → x = ?", options: ["6", "12", "9", "14"], answer: 0, tag: "alg-eq" },
    ],
  },
  {
    lessonId: "bio-1",
    title: "Light Eater Grove",
    questions: [
      { q: "Plants gain mass mainly from?", options: ["Air + light", "Soil", "Water only", "Fertilizer"], answer: 0, tag: "bio-photo" },
      { q: "Photosynthesis makes?", options: ["Glucose", "Soil", "Roots", "Seeds"], answer: 0, tag: "bio-photo" },
      { q: "Chlorophyll catches?", options: ["Light", "Water", "Worms", "Nitrogen"], answer: 0, tag: "bio-photo" },
      { q: "Stomata take in?", options: ["CO₂", "Oxygen out only", "Soil", "Sugar"], answer: 0, tag: "bio-photo" },
      { q: "Energy source for plants?", options: ["Sunlight", "Soil food", "Rain heat", "Wind"], answer: 0, tag: "bio-photo" },
    ],
  },
  {
    lessonId: "bio-2",
    title: "Breath Cave",
    questions: [
      { q: "Do plants respire?", options: ["Yes, always", "Never", "Only night", "Only seeds"], answer: 0, tag: "bio-resp" },
      { q: "Respiration releases?", options: ["Energy", "Light", "Soil", "Water"], answer: 0, tag: "bio-resp" },
      { q: "Mitochondria are in?", options: ["Plants + animals", "Animals only", "Plants only", "Neither"], answer: 0, tag: "bio-resp" },
      { q: "Plants breathe through?", options: ["Stomata", "Mouths", "Roots only", "Flowers"], answer: 0, tag: "bio-resp" },
      { q: "At night plants?", options: ["Respire", "Stop living", "Photosynthesize", "Sleep dead"], answer: 0, tag: "bio-resp" },
    ],
  },
  {
    lessonId: "bio-3",
    title: "Cell City",
    questions: [
      { q: "Cell walls are in?", options: ["Plants", "Animals", "Both", "Neither"], answer: 0, tag: "bio-cell" },
      { q: "Cells are best seen as?", options: ["3D factories", "Flat bags", "Still photos", "Empty boxes"], answer: 0, tag: "bio-cell" },
      { q: "Control center of cell?", options: ["Nucleus", "Wall", "Juice", "Skin"], answer: 0, tag: "bio-cell" },
      { q: "Chloroplasts live in?", options: ["Plant cells", "Animal cells", "All cells", "No cells"], answer: 0, tag: "bio-cell" },
      { q: "Cell membrane job?", options: ["Gatekeeper", "Wall builder", "Food maker", "Eyes"], answer: 0, tag: "bio-cell" },
    ],
  },
];

export function getPack(lessonId: string): GamePack | undefined {
  return GAME_PACKS.find((p) => p.lessonId === lessonId);
}
