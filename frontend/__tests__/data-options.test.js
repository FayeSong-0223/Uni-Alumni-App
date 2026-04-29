// Sanity checks on the dropdown dictionaries in src/data/options.js.
// These are pure data exports so the tests don't need any RN mocking.

const {
  DEGREES,
  GRADUATION_YEARS,
  INDUSTRIES,
  HOBBIES,
  INTERESTS,
  PROFESSIONAL_INTERESTS,
  CURRENT_ROLES,
} = require('../src/data/options');

describe('data/options', () => {
  test('DEGREES has expected entries and no duplicates', () => {
    expect(DEGREES.length).toBeGreaterThan(0);
    expect(new Set(DEGREES).size).toBe(DEGREES.length);
  });

  test('GRADUATION_YEARS spans current year back to 1970, descending', () => {
    const currentYear = new Date().getFullYear();
    expect(GRADUATION_YEARS[0]).toBe(String(currentYear));
    expect(GRADUATION_YEARS[GRADUATION_YEARS.length - 1]).toBe('1970');
    expect(GRADUATION_YEARS).toHaveLength(currentYear - 1970 + 1);
    // strictly descending
    for (let i = 1; i < GRADUATION_YEARS.length; i++) {
      expect(Number(GRADUATION_YEARS[i])).toBe(Number(GRADUATION_YEARS[i - 1]) - 1);
    }
  });

  test('INTERESTS is the same array as HOBBIES (back-compat alias)', () => {
    expect(INTERESTS).toBe(HOBBIES);
  });

  test('PROFESSIONAL_INTERESTS slugs are unique and well-formed', () => {
    const slugs = PROFESSIONAL_INTERESTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const { slug, label } of PROFESSIONAL_INTERESTS) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  test('INDUSTRIES and CURRENT_ROLES include the "Other" escape hatch', () => {
    expect(INDUSTRIES).toContain('Other');
    expect(CURRENT_ROLES).toContain('Other');
  });
});
