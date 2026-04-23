// Predefined options for dropdowns and tag pickers

export const DEGREES = [
  'Bachelor of Arts',
  'Bachelor of Commerce',
  'Bachelor of Computer Science',
  'Bachelor of Engineering',
  'Bachelor of Laws',
  'Bachelor of Medicine',
  'Bachelor of Nursing',
  'Bachelor of Science',
  'Master of Business Administration',
  'Master of Computing',
  'Master of Data Science',
  'Master of Engineering',
  'Master of Finance',
  'Master of Public Health',
  'Doctor of Philosophy (PhD)',
];

export const GRADUATION_YEARS = (() => {
  const years = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= 1970; y--) years.push(String(y));
  return years;
})();

export const INDUSTRIES = [
  'Accounting & Finance',
  'Agriculture',
  'Architecture & Design',
  'Consulting',
  'Cybersecurity',
  'Data Science & Analytics',
  'Education',
  'Energy & Resources',
  'Engineering',
  'Environmental Science',
  'Government & Public Sector',
  'Healthcare',
  'Hospitality & Tourism',
  'Information Technology',
  'Law',
  'Marketing & Advertising',
  'Media & Communications',
  'Non-Profit',
  'Pharmaceuticals',
  'Real Estate',
  'Research & Development',
  'Software Engineering',
  'Telecommunications',
  'Other',
];

// Personal/leisure hobbies (renamed from INTERESTS).
// Free-form tag-picker values — users can also add their own.
export const HOBBIES = [
  'Gaming',
  'Football',
  'Cricket',
  'Basketball',
  'Fitness',
  'Gym',
  'Running',
  'Cycling',
  'Music',
  'Movies',
  'TV Shows',
  'Anime',
  'Travel',
  'Food',
  'Cooking',
  'Photography',
  'Content Creation',
  'Social Media',
  'Fashion',
  'Cars',
  'Technology',
  'Gadgets',
  'Reading',
  'Writing',
  'Art & Design',
  'Dancing',
  'Hiking',
  'Camping',
  'Esports',
  'Board Games',
];

// Backwards-compat alias so any lingering `INTERESTS` import doesn't break.
// Remove once all imports are migrated.
export const INTERESTS = HOBBIES;

// Professional interests — dropdown dictionary. The server is the source of
// truth (ProfessionalInterestOption model); this list is a fallback so the UI
// can render before the options endpoint resolves, and keeps slugs aligned
// with the seed data in the migration.
export const PROFESSIONAL_INTERESTS = [
  { slug: 'software-engineering', label: 'Software Engineering' },
  { slug: 'data-science', label: 'Data Science' },
  { slug: 'machine-learning', label: 'Machine Learning / AI' },
  { slug: 'product-management', label: 'Product Management' },
  { slug: 'design-ux', label: 'Design / UX' },
  { slug: 'marketing', label: 'Marketing' },
  { slug: 'sales', label: 'Sales' },
  { slug: 'finance', label: 'Finance' },
  { slug: 'consulting', label: 'Consulting' },
  { slug: 'entrepreneurship', label: 'Entrepreneurship' },
  { slug: 'operations', label: 'Operations' },
  { slug: 'human-resources', label: 'Human Resources' },
  { slug: 'legal', label: 'Legal' },
  { slug: 'healthcare', label: 'Healthcare' },
  { slug: 'education', label: 'Education' },
  { slug: 'research', label: 'Research' },
  { slug: 'cybersecurity', label: 'Cybersecurity' },
  { slug: 'cloud-devops', label: 'Cloud / DevOps' },
  { slug: 'media-journalism', label: 'Media / Journalism' },
  { slug: 'public-sector', label: 'Public Sector / Government' },
  { slug: 'nonprofit', label: 'Nonprofit / Social Impact' },
  { slug: 'engineering-hardware', label: 'Hardware Engineering' },
  { slug: 'biotech', label: 'Biotech / Life Sciences' },
  { slug: 'sustainability', label: 'Sustainability / Climate' },
];

export const CURRENT_ROLES = [
  'Software Engineer',
  'Frontend Developer',
  'Backend Developer',
  'Full-Stack Developer',
  'Data Scientist',
  'Data Analyst',
  'Product Manager',
  'Project Manager',
  'UX Designer',
  'DevOps Engineer',
  'Cloud Architect',
  'Security Analyst',
  'Business Analyst',
  'Consultant',
  'Researcher',
  'Lecturer',
  'Professor',
  'Doctor',
  'Nurse',
  'Lawyer',
  'Accountant',
  'Marketing Manager',
  'CEO / Founder',
  'Student',
  'Other',
];
