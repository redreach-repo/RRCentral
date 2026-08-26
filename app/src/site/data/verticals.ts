export type VerticalSlug =
  | 'marketing'
  | 'care'
  | 'connect'
  | 'wanders'
  | 'threads'
  | 'trading'
  | 'upskilling'

export type Vertical = {
  slug: VerticalSlug
  code: string
  brand: string
  category: string
  eyebrow: string
  tagline: string
  summary: string
  description: string
  bullets: string[]
  highlights: { title: string; body: string }[]
  process?: { step: string; title: string; body: string }[]
  featured?: boolean
}

export const VERTICALS: Vertical[] = [
  {
    slug: 'marketing',
    code: '03',
    brand: 'RR Marketing',
    category: 'Growth / Strategy',
    eyebrow: 'Market intelligence',
    tagline: 'Elevating brands. Amplifying growth.',
    summary:
      'Data-driven marketing that cuts through noise, fills the pipeline, and turns attention into revenue.',
    description:
      'We fuse market understanding with campaigns that do more than look good. RR Marketing partners with you to build awareness, high-intent leads, and a digital presence that actually converts — especially in demanding sectors like logistics and freight.',
    bullets: [
      'Brand awareness that is hard to ignore',
      'High-intent lead generation',
      'SEO, social, and content that perform',
      'Unified roadmaps aligned to revenue',
    ],
    highlights: [
      {
        title: 'Skyrocket brand awareness',
        body: 'Cut through digital noise so the brand is seen, remembered, and trusted.',
      },
      {
        title: 'Generate convertible leads',
        body: 'Engineer a pipeline of genuinely interested prospects, not vanity traffic.',
      },
      {
        title: 'Dominate digital presence',
        body: 'SEO, social, and high-value content working as one system.',
      },
      {
        title: 'Navigate market shifts',
        body: 'Stay ahead of disruption with agile strategy, not static annual plans.',
      },
    ],
    process: [
      {
        step: '01',
        title: 'Deep understanding',
        body: 'Immerse in your vision, market, and competitors before a single campaign ships.',
      },
      {
        step: '02',
        title: 'Tailored strategy',
        body: 'Bespoke, actionable roadmaps designed for your goals — not a template deck.',
      },
      {
        step: '03',
        title: 'Guidance & optimisation',
        body: 'Implementation support, transparent reporting, and continuous optimisation.',
      },
    ],
  },
  {
    slug: 'care',
    code: '05',
    brand: 'RR Care',
    category: 'Medical travel',
    eyebrow: 'Healthcare without borders',
    tagline: 'Your trusted pathway to world-class care in India.',
    summary:
      'We match patients with India’s leading doctors and hospitals — personalised, transparent, and end-to-end.',
    description:
      'RR Care is a patient-first medical tourism platform. We connect people from around the world with trusted doctors, hospitals, and treatment centres in India, selected for quality, ethics, and fit — not just availability.',
    bullets: [
      'Personalised doctor and hospital matching',
      'Transparent costs, timelines, and recovery',
      'Travel, stay, and treatment coordination',
      'Post-care follow-up with a compassion-first approach',
    ],
    highlights: [
      {
        title: 'Personalised care matching',
        body: 'The right specialist and hospital for the condition, location, and budget.',
      },
      {
        title: 'Trusted medical network',
        body: 'A curated network of hospitals and surgeons known for international patient care.',
      },
      {
        title: 'End-to-end support',
        body: 'From first consultation through treatment and recovery, one coordinated journey.',
      },
      {
        title: 'Global patient assistance',
        body: 'Travel guidance, accommodation, and coordination for patients arriving in India.',
      },
    ],
  },
  {
    slug: 'connect',
    code: '04',
    brand: 'RR Connect',
    category: 'Virtual assistance',
    eyebrow: 'Productivity, globally enabled',
    tagline: 'Elite remote teams that let you focus on the work that matters.',
    summary:
      'Vetted virtual professionals for admin, research, marketing support, and customer care — without the overhead.',
    description:
      'Based in Dubai and fulfilled with a world-class remote bench, RR Connect gives businesses agile support that scales. From scheduling and data entry to research, content, digital marketing, and customer service, your operations stay lean and uninterrupted.',
    bullets: [
      'Admin, scheduling, and data operations',
      'Research, content, and digital marketing support',
      'Customer service that stays on your hours',
      'Employment and benefits administration handled',
    ],
    featured: true,
    highlights: [
      {
        title: 'Skyrocket productivity',
        body: 'Delegate repetitive work so leadership time goes to strategy and growth.',
      },
      {
        title: 'Access elite skills on demand',
        body: 'A vetted global bench spanning admin, creative, technical, and customer roles.',
      },
      {
        title: 'Cut overhead, keep quality',
        body: 'Premium dedicated support without the cost of traditional in-house hiring.',
      },
      {
        title: 'Scale without friction',
        body: 'Grow or reduce capacity as demand changes — continuity stays intact.',
      },
    ],
  },
  {
    slug: 'wanders',
    code: '02',
    brand: 'RR Wanders',
    category: 'Bespoke travel',
    eyebrow: 'Architects of journeys',
    tagline: 'Your passport to unforgettable journeys.',
    summary:
      'Tailor-made travel across the Philippines, Kerala, and the Himalayas — designed around how you actually want to move through the world.',
    description:
      'RR Wanders is more than a travel desk. From Dubai we design bespoke tours: island diving and culture in the Philippines, backwaters and Ayurveda in Kerala, and trekking or cultural immersions across Nepal, Bhutan, and Tibet.',
    bullets: [
      'Philippines: Palawan, Cebu, Boracay, Bohol, Cagayan de Oro',
      'Kerala: backwaters, Ayurveda, Munnar, Wayanad, Kovalam',
      'Himalayas: Nepal treks, Bhutan culture, Tibet journeys',
      'Expert local guides with safety and sustainability first',
    ],
    featured: true,
    highlights: [
      {
        title: 'Philippines',
        body: 'Lagoons, reefs, whale sharks, and White Beach — with no visa required for many travellers.',
      },
      {
        title: 'Kerala',
        body: 'God’s Own Country: houseboats, heritage, coastal cuisine, and wellness retreats.',
      },
      {
        title: 'Nepal, Bhutan & Tibet',
        body: 'Everest Base Camp, Tiger’s Nest, Lhasa, and festival circuits with local expertise.',
      },
      {
        title: 'Tailor-made, never templated',
        body: 'Every itinerary is built around your pace, interests, and comfort — not a brochure.',
      },
    ],
  },
  {
    slug: 'threads',
    code: '01',
    brand: 'RR Threads',
    category: 'Uniforms / apparel',
    eyebrow: 'Crafted identity',
    tagline: 'Uniforms that carry your brand with durability and comfort.',
    summary:
      'Industrial, hospitality, medical, and custom apparel — sampled, produced, and QC’d before it ever reaches your team.',
    description:
      'Uniforms are brand, safety, and confidence stitched together. RR Threads supplies T-shirts, coveralls, PPE, medical and hotel uniforms, kitchen wear, robes, and towels, with samples first and rigorous quality control at the end.',
    bullets: [
      'Stitched samples before full production',
      'Industrial, medical, hotel, and kitchen uniforms',
      'Embroidery, printing, and fabric guidance',
      'QC and packaging on every piece',
    ],
    highlights: [
      {
        title: 'Samples first',
        body: 'See and feel fabric, fit, and finish before production starts.',
      },
      {
        title: 'Precision production',
        body: 'Fabric selection, design, stitching, embroidery, printing, then QC.',
      },
      {
        title: 'Built for the job',
        body: 'Coveralls, safety vests, PPE, medical and hospitality uniforms that last.',
      },
      {
        title: 'Brand on every stitch',
        body: 'Embroidery and print that stay sharp through daily wear and washing.',
      },
    ],
    process: [
      { step: '01', title: 'Fabric selection', body: 'Comfort, durability, and industry-fit materials and trims.' },
      { step: '02', title: 'Design application', body: 'Templates that balance look with how the garment is worn.' },
      { step: '03', title: 'Stitching', body: 'Cut pieces assembled with consistent, durable workmanship.' },
      { step: '04', title: 'Embroidery & print', body: 'Logos and graphics placed precisely, in threads or inks that last.' },
      { step: '05', title: 'QC & packaging', body: 'Every item checked, then boxed ready for the floor.' },
    ],
  },
  {
    slug: 'trading',
    code: '06',
    brand: 'RR Trading',
    category: 'Global sourcing',
    eyebrow: 'Dubai as launchpad',
    tagline: 'Unlocking your global potential.',
    summary:
      'If you can specify it, we source it — quality-checked, with Dubai’s trade stack as the advantage.',
    description:
      'From Dubai’s position between Europe, Asia, and Africa, RR Trading connects businesses to vetted manufacturers worldwide. Textiles are a deep specialty; the real promise is limitless sourcing, quality control, and logistics through Jebel Ali, DXB, and free zones.',
    bullets: [
      'Limitless sourcing through a vetted global network',
      'Free-zone and Jebel Ali logistics advantage',
      'Multi-stage quality checks on every order',
      'Export pathways into the US, Europe, and South America',
    ],
    highlights: [
      {
        title: 'Limitless sourcing',
        body: 'Tell us the spec. We find the manufacturer and the path to your dock.',
      },
      {
        title: 'Streamlined procurement',
        body: 'Free-zone perks, world-class infrastructure, and logistics that stay on time.',
      },
      {
        title: 'Assured quality',
        body: 'Multi-stage checks so what arrives matches what you ordered.',
      },
      {
        title: 'An 8-hour flight radius',
        body: 'Dubai sits within reach of 65% of global GDP — we use that geography daily.',
      },
    ],
  },
  {
    slug: 'upskilling',
    code: '07',
    brand: 'RR Upskilling',
    category: 'Learning platform',
    eyebrow: 'A world of learning without boundaries',
    tagline: 'Upskill and accelerate your career.',
    summary:
      'Industry courses in aviation, logistics, hospitality, travel, tourism, and healthcare — flexible, certified, practical.',
    description:
      'RR Upskilling (also known as RR Boost) is built by practitioners. The mission is simple: make current industry knowledge accessible and affordable so professionals can move with confidence. Learn at your pace, pass at 80%, and carry a verifiable certificate.',
    bullets: [
      'Aviation, logistics, hospitality, travel & tourism, healthcare',
      'Flexible, self-paced modules',
      'Professional certification with 80% pass mark',
      'Practical insight from working industry experts',
    ],
    highlights: [
      {
        title: 'Flexible learning',
        body: 'Join as many courses as you need, when it suits you — learn-life balance.',
      },
      {
        title: 'Professional certification',
        body: 'Intelligent evaluation, 80% passing marks, and verifiable certificates.',
      },
      {
        title: 'A clear path',
        body: 'Discover, build foundations, apply, refine, then advance — on purpose.',
      },
      {
        title: 'Courses that travel',
        body: 'Airfare & ticketing, logistics operations, hospitality, wine and cheese tourism, healthcare.',
      },
    ],
    process: [
      { step: '01', title: 'Discover & define', body: 'Map strengths, goals, and the gap you actually need to close.' },
      { step: '02', title: 'Build foundations', body: 'Guided modules for the fundamentals that last.' },
      { step: '03', title: 'Apply & practice', body: 'Exercises and projects so knowledge becomes capability.' },
      { step: '04', title: 'Refine & elevate', body: 'Feedback that sharpens the work, not just the score.' },
      { step: '05', title: 'Achieve & advance', body: 'Step into the next role with evidence, not just intent.' },
    ],
  },
]

export const FEATURED_VERTICALS = VERTICALS.filter((v) => v.featured)

export function verticalBySlug(slug: string | undefined): Vertical | undefined {
  return VERTICALS.find((v) => v.slug === slug)
}

export const SITE = {
  name: 'Red Reach',
  legal: 'Red Reach Middle East FZE',
  tagline: 'Reach Every District',
  founded: 2018,
  phone: '+971 50 7008977',
  phoneHref: 'tel:+971507008977',
  email: 'info@redreach.ae',
  whatsapp: 'https://wa.me/971507008977',
  addressLines: ['Red Reach, Middle East', 'P.O. Box 6641', 'Dubai, U.A.E.'],
  location: 'Dubai, United Arab Emirates',
}

export const TESTIMONIALS = [
  {
    quote:
      'A game changer. RR Connect provided numerous good candidates for interviews. The remote team works on our hours and is 100% focused. Handling employment and benefits administration has been a significant help.',
    name: 'Chris Jacobs',
    role: 'Partner and CFO, Pactimo',
    rating: 5,
  },
  {
    quote: 'Rona from RR Connect is a great VA.',
    name: 'Ryan Sebastian',
    role: 'President, Moveable Inc.',
    rating: 5,
  },
  {
    quote: 'Nadine from RR Connect has been a great help and enabled us to expand our business.',
    name: 'Steven Fernandez',
    role: 'Partner, Gloo the Agency',
    rating: 5,
  },
]

export const PRINCIPLES = [
  {
    n: '01',
    title: 'Global expertise, local precision',
    body: 'Dubai as the hub. World-class infrastructure with market insight that still feels close to the work.',
  },
  {
    n: '02',
    title: 'Client-centric by default',
    body: 'Transparency, goal alignment, and outcomes you can measure — not theatre.',
  },
  {
    n: '03',
    title: 'Uncompromising quality',
    body: 'From garment QC to itinerary design to VA vetting, excellence is a process, not a slogan.',
  },
  {
    n: '04',
    title: 'Boundless opportunities',
    body: 'Seven verticals, one consortium. We meet the brief regardless of industry or scale.',
  },
  {
    n: '05',
    title: 'Consistency since 2018',
    body: 'Reliable delivery across sectors, with teams that stay on the account.',
  },
  {
    n: '06',
    title: 'Reach every district',
    body: 'The vision is geographic and operational: expand what you can do, and where you can do it.',
  },
]

export const STATUS_MESSAGES = [
  'Routing a medical travel brief to RR Care…',
  'Matching VA capacity in Manila for RR Connect…',
  'Sampling coverall fabrics for an RR Threads production run…',
  'Locking Kerala backwater dates for an RR Wanders itinerary…',
  'Sourcing a textile lot through Jebel Ali for RR Trading…',
  'Publishing a logistics campaign for RR Marketing…',
  'Issuing an aviation certificate from RR Upskilling…',
]

export const MARQUEE_ITEMS = [
  'Marketing',
  'Medical travel',
  'Virtual assistance',
  'Bespoke tours',
  'Uniforms',
  'Global sourcing',
  'Aviation training',
  'Hospitality',
  'Healthcare',
  'Logistics',
]
