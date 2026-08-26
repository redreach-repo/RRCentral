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
  heroLine: string
  heroAccent: string
  bullets: string[]
  highlights: { title: string; body: string }[]
  process?: { step: string; title: string; body: string }[]
    featured?: boolean
  image: string
  icon: string
  gallery?: string[]
  verb: string
  cta: string
  seoTitle: string
  seoDescription: string
}

export const VERTICALS: Vertical[] = [
  {
    slug: 'marketing',
    code: '03',
    brand: 'RR Marketing',
    category: 'Marketing consultancy',
    eyebrow: 'Strategy, then demand',
    tagline: 'Marketing that moves your business forward.',
    summary: 'We help businesses grow. Visibility is the start. Pipeline is the point.',
    heroLine: 'Marketing that moves',
    heroAccent: 'your business forward.',
    image: 'vertical-marketing.jpg',
    icon: 'icon-1.png',
    featured: true,
    verb: 'Market',
    cta: 'Book a consultation',
    seoTitle: 'RR Marketing | Marketing that moves your business forward',
    seoDescription:
      'RR Marketing is the consultancy and digital marketing desk of Red Reach in Dubai. Strategy, demand generation, branding, content and SEO built around growth, not vanity metrics.',
    description:
      'RR Marketing is a strategic partner, not a social media shop with a new name. We start in your category, then build the campaigns, content and search work that fill a pipeline. Logistics and freight are a known brief. Other sectors get the same commercial standard.',
    bullets: [
      'Marketing strategy before channels',
      'Demand generation and lead capture',
      'Branding, content, SEO and social as one plan',
      'Reporting tied to conversations, not impressions',
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
    eyebrow: 'Healthcare facilitation',
    tagline: 'A trusted pathway to care in India.',
    summary: 'Medical travel, coordinated. Matching, travel, treatment and recovery as one brief.',
    heroLine: 'Care, coordinated.',
    heroAccent: 'Treatment in India.',
    image: 'vertical-care.jpg',
    icon: 'icon-2.png',
    featured: true,
    verb: 'Care',
    cta: 'Start your medical journey',
    seoTitle: 'RR Care | Medical travel to India, coordinated from Dubai',
    seoDescription:
      'RR Care is Red Reach’s medical travel desk. We match patients with doctors and hospitals in India, then coordinate travel, stay and follow-up. No hospital. A named coordinator.',
    gallery: ['care-scene.jpg', 'expertise-meeting.jpg'],
    description:
      'RR Care is a medical travel concierge, not a hospital. We help people from the Gulf and beyond find the right doctors and hospitals in India, then run the journey: consult, choose, travel, treatment, recovery. We do not invent outcomes. We coordinate the work.',
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
    category: 'Remote teams',
    eyebrow: 'Managed virtual assistance',
    tagline: 'Extend your team without extending your overhead.',
    summary: 'Vetted remote professionals for admin, research, marketing support and customer care. UAE hours. Managed by us.',
    heroLine: 'Extend your team.',
    heroAccent: 'Not your overhead.',
    image: 'vertical-connect.jpg',
    icon: 'icon-3.png',
    verb: 'Connect',
    cta: 'Build your remote team',
    seoTitle: 'RR Connect | Build your remote team from Dubai',
    seoDescription:
      'RR Connect provides managed virtual assistance for UAE and international businesses: executive support, admin, customer care, sales support and marketing operations. You brief the seat. We match, onboard and stay on the account.',
    gallery: ['expertise-laptop.jpg', 'office-1.jpg', 'office-2.jpg'],
    description:
      'RR Connect is Red Reach’s remote staffing desk. Based in Dubai, we match businesses with dedicated virtual professionals for executive assistance, administration, customer support, sales support, marketing operations and back-office work. Employment admin is handled. You keep the hours. You do not take on a new floor of overhead.',
    bullets: [
      'Admin, scheduling, and data operations',
      'Research, content, and digital marketing support',
      'Customer service that stays on your hours',
      'Employment and benefits administration handled',
    ],
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
    category: 'Travel',
    eyebrow: 'Destination, then itinerary',
    tagline: 'Travel should be more than a trip.',
    summary: 'Philippines, Kerala and the Himalayas. Designed around how you want to move, not a brochure departure.',
    heroLine: 'Travel should be',
    heroAccent: 'more than a trip.',
    image: 'wander-tea.jpg',
    icon: 'icon-4.png',
    featured: true,
    verb: 'Wander',
    cta: 'Plan your journey',
    seoTitle: 'RR Wanders | Philippines, Kerala and Himalaya journeys',
    seoDescription:
      'RR Wanders is Red Reach’s travel desk in Dubai. Tailor-made journeys across the Philippines, Kerala and the Himalayas, with a planning desk that stays on the trip after you land.',
    gallery: [
      'wander-houseboat.jpg',
      'wander-tea.jpg',
      'wander-nepal.jpg',
      'wander-1.jpg',
      'wander-city.jpg',
      'wander-himalaya.jpg',
    ],
    description:
      'RR Wanders is more than a travel desk. From Dubai we design bespoke tours: island diving and culture in the Philippines, backwaters and Ayurveda in Kerala, and trekking or cultural immersions across Nepal, Bhutan, and Tibet.',
    bullets: [
      'Philippines: Palawan, Cebu, Boracay, Bohol, Cagayan de Oro',
      'Kerala: backwaters, Ayurveda, Munnar, Wayanad, Kovalam',
      'Himalayas: Nepal treks, Bhutan culture, Tibet journeys',
      'Expert local guides with safety and sustainability first',
    ],
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
    category: 'Uniforms',
    eyebrow: 'Workforce apparel',
    tagline: 'Uniforms that carry the brand through a shift.',
    summary: 'Understand the workforce, source the garments, brand them, QC them, deliver a programme.',
    heroLine: 'Design the uniform',
    heroAccent: 'programme.',
    image: 'vertical-threads.jpg',
    icon: 'icon-5.png',
    verb: 'Thread',
    cta: 'Request a quote',
    seoTitle: 'RR Threads | Uniform programmes for UAE teams',
    seoDescription:
      'RR Threads supplies industrial, hospitality, medical, kitchen and corporate uniforms. Samples first, then production, embroidery, print and QC. Request a quote from Dubai.',
    gallery: ['threads-1.jpg', 'threads-2.jpg', 'threads-3.jpg', 'threads-4.jpg', 'threads-5.jpg'],
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
    category: 'Sourcing',
    eyebrow: 'Procurement from Dubai',
    tagline: 'One requirement. Multiple possibilities.',
    summary: 'If you can specify it, we can explore sourcing it. No catalogue. A desk that finds the path.',
    heroLine: 'What are you',
    heroAccent: 'looking for?',
    image: 'vertical-trading.jpg',
    icon: 'icon-6.png',
    verb: 'Trade',
    cta: 'Send your requirement',
    seoTitle: 'RR Trading | B2B sourcing and procurement from Dubai',
    seoDescription:
      'RR Trading is Red Reach’s sourcing desk. Send a product, material or equipment requirement. We explore manufacturers, quality and delivery through Dubai. Not an online catalogue.',
    gallery: ['dubai.jpg', 'vertical-trading.jpg'],
    description:
      'From Dubai’s position between Europe, Asia, and Africa, RR Trading connects businesses to vetted manufacturers worldwide. Textiles are a deep specialty; the real promise is limitless sourcing, quality control, and logistics through Jebel Ali, DXB, and free zones.',
    bullets: [
      'Send a spec, not a catalogue search',
      'Textiles are a deep specialty. Other categories on brief.',
      'Quality checks before the lot moves',
      'Dubai logistics: Jebel Ali, DXB, free zones',
    ],
    highlights: [
      {
        title: 'Specify it',
        body: 'Product, quantity, quality bar, and the dock you need it at.',
      },
      {
        title: 'We explore the source',
        body: 'Manufacturers and paths, with textiles as a known muscle.',
      },
      {
        title: 'Quality is a gate',
        body: 'Checks so the receipt can match the purchase order.',
      },
      {
        title: 'Move through Dubai',
        body: 'Port, airport and free-zone options as the operating system.',
      },
    ],
  },
  {
    slug: 'upskilling',
    code: '07',
    brand: 'RR Upskilling',
    category: 'Learning',
    eyebrow: 'Built with Sqilah',
    tagline: 'Learn on Sqilah. Come back when you need the rest of Red Reach.',
    summary: 'Industry learning in aviation, logistics, hospitality, travel and healthcare. The platform lives on Sqilah.',
    heroLine: 'Learn with',
    heroAccent: 'Sqilah.',
    image: 'vertical-upskilling.jpg',
    icon: 'icon-7.png',
    verb: 'Upskill',
    cta: 'Explore Sqilah',
    seoTitle: 'RR Upskilling | Industry learning on Sqilah',
    seoDescription:
      'RR Upskilling is Red Reach’s learning introduction. Courses in aviation, logistics, hospitality, travel and healthcare run on Sqilah. This page sends you there. It does not duplicate the platform.',
    gallery: ['expertise-laptop.jpg', 'office-2.jpg'],
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
  tagline: 'One company. Seven ways forward.',
  vision: 'Reach Every District',
  founded: 2018,
  phone: '+971 50 7008977',
  phoneHref: 'tel:+971507008977',
  email: 'info@redreach.ae',
  whatsapp: 'https://wa.me/971507008977',
  addressLines: ['Red Reach, Middle East', 'P.O. Box 6641', 'Dubai, U.A.E.'],
  location: 'Dubai, United Arab Emirates',
  hours: 'Monday – Saturday, 10am – 6pm',
  publicOrigin: 'https://redreach-repo.github.io/RRCentral',
  sqilah: 'https://sqilah.co',
}

export const ENQUIRY_OPTIONS = [
  { value: '', label: 'What are you looking for?' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'care', label: 'Medical tourism' },
  { value: 'connect', label: 'Virtual assistance' },
  { value: 'wanders', label: 'Travel' },
  { value: 'threads', label: 'Uniforms' },
  { value: 'trading', label: 'Trading' },
  { value: 'upskilling', label: 'Upskilling' },
  { value: 'general', label: 'General enquiry' },
] as const

export const APPROACH = [
  {
    step: '01',
    title: 'Understand',
    body: 'The brief, the constraint, the district you need to reach.',
  },
  {
    step: '02',
    title: 'Strategize',
    body: 'A plan with an owner. Not a deck that dies in the inbox.',
  },
  {
    step: '03',
    title: 'Connect',
    body: 'The right desk inside Red Reach, and the partners that desk already runs.',
  },
  {
    step: '04',
    title: 'Execute',
    body: 'Samples, itineraries, matches, campaigns, lots. Work that ships.',
  },
  {
    step: '05',
    title: 'Grow',
    body: 'Stay on the account. Add a second division when the first one is working.',
  },
]

export const WHY_RED_REACH = [
  {
    title: 'A Dubai company since 2018',
    body: 'Red Reach Middle East FZE. P.O. Box 6641. A desk you can call.',
  },
  {
    title: 'Seven operating divisions',
    body: 'Marketing, care, remote teams, travel, uniforms, trading and learning. Same parent. Different craft.',
  },
  {
    title: 'Cross-border work is normal here',
    body: 'Gulf clients. Care in India. Travel between India and the Philippines. Goods through Dubai.',
  },
  {
    title: 'Execution over theatre',
    body: 'A sample before a production run. A named coordinator before a flight. A spec before a quote.',
  },
]

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
