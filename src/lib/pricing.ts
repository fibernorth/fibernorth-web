// Internal rate sheet (owner, Sept 2026). Standard conditions: pipe 3" or
// smaller, ground not gravel or rock. Never shown to customers.
export function ratePrice(feet: number): number {
  if (feet <= 0) return 0;
  if (feet <= 100) return 3000;
  if (feet <= 200) return 4000;
  return 4000 + Math.round(feet - 200) * 8;
}
