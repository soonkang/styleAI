// Rough US size recommender from height (cm) + weight (kg) + gender.
// Honest heuristic — surfaced in UI as a suggestion, not a guarantee.

export type Gender = "female" | "male" | "unisex";

export interface SizeRecommendation {
  top: string;       // XS..XXL
  bottom: string;    // numeric (e.g. "28" or "8")
  band: string;      // helpful range like "S–M"
  bmi: number;
  note: string;
}

export function recommendSize(
  heightCm: number,
  weightKg: number,
  gender: Gender = "unisex",
): SizeRecommendation {
  const h = heightCm / 100;
  const bmi = +(weightKg / (h * h)).toFixed(1);

  // Letter size derived from BMI bands with height nudge
  const tops = ["XS", "S", "M", "L", "XL", "XXL"];
  let idx: number;
  if (bmi < 18) idx = 0;
  else if (bmi < 21) idx = 1;
  else if (bmi < 24.5) idx = 2;
  else if (bmi < 28) idx = 3;
  else if (bmi < 32) idx = 4;
  else idx = 5;
  if (heightCm >= 185) idx = Math.min(idx + 1, 5);
  if (heightCm <= 158 && idx > 0) idx -= 1;

  const top = tops[idx];
  const band = `${tops[Math.max(0, idx - 1)]}–${tops[Math.min(5, idx + 1)]}`;

  // Bottom (waist) — very rough estimate
  let bottom: string;
  if (gender === "female") {
    // Women's US numeric: 0,2,4,6,8,10,12,14,16
    const womenSizes = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18];
    const sizeIdx = Math.max(0, Math.min(womenSizes.length - 1, idx * 2));
    bottom = String(womenSizes[sizeIdx]);
  } else {
    // Men's waist inches estimate
    const waist = Math.round(28 + (weightKg - 60) * 0.25 + (idx - 1) * 1.5);
    bottom = String(Math.max(28, Math.min(46, waist)));
  }

  return {
    top,
    bottom,
    band,
    bmi,
    note:
      "Suggested from height, weight and BMI band. Brands vary — always check the size chart before buying.",
  };
}
