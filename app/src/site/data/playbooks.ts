import type { VerticalSlug } from './verticals'

export type PlaybookItem = {
  title: string
  body: string
  image?: string
}

export type PlaybookStep = {
  step: string
  title: string
  body: string
}

export type VerticalPlaybook = {
  path: string
  layout: 'agency' | 'medical' | 'va' | 'travel' | 'apparel' | 'trade' | 'learn'
  inspiredBy: string
  collectionTitle: string
  collectionLede: string
  collection: PlaybookItem[]
  stats: { value: string; label: string }[]
  promise: { title: string; body: string }[]
  steps: PlaybookStep[]
}

export const PLAYBOOKS: Record<VerticalSlug, VerticalPlaybook> = {
  marketing: {
    path: '/marketing',
    layout: 'agency',
    inspiredBy: 'Editorial agency sites — large capabilities, revenue-first case language, no template decks.',
    collectionTitle: 'Capabilities',
    collectionLede: 'Strategy, creative, and media as one system — built to fill the pipeline, not just the feed.',
    stats: [
      { value: '01', label: 'Brief to roadmap' },
      { value: '02', label: 'Campaigns that convert' },
      { value: '03', label: 'Report, then refine' },
    ],
    promise: [
      { title: 'Market first', body: 'We start in the category, not in the software.' },
      { title: 'Leads over vanity', body: 'Traffic only counts if it becomes a conversation.' },
      { title: 'One roadmap', body: 'SEO, social, and content share a revenue target.' },
    ],
    collection: [
      { title: 'Brand systems', body: 'Identity, messaging, and campaigns that stay recognisable across every district you enter.' },
      { title: 'Demand generation', body: 'High-intent capture for logistics, freight, and other noisy B2B categories.' },
      { title: 'Search & content', body: 'Pages and stories that rank, get read, and hand off to sales.' },
      { title: 'Social that works', body: 'Channels treated as distribution, with creative that can actually travel.' },
      { title: 'Category strategy', body: 'Positioning when the market shifts — not a static annual plan.' },
      { title: 'Reporting you can use', body: 'Dashboards tied to pipeline, not impressions theatre.' },
    ],
    steps: [
      { step: '01', title: 'Deep understanding', body: 'Immerse in your vision, market, and competitors before a single campaign ships.' },
      { step: '02', title: 'Tailored strategy', body: 'Bespoke, actionable roadmaps designed for your goals — not a template deck.' },
      { step: '03', title: 'Guidance & optimisation', body: 'Implementation support, transparent reporting, and continuous optimisation.' },
    ],
  },
  care: {
    path: '/care',
    layout: 'medical',
    inspiredBy: 'Qunomedical / Bookimed — patient journey, vetted network, transparent coordination.',
    collectionTitle: 'Care pathways',
    collectionLede: 'Tell us the condition. We match doctors and hospitals in India, then run travel, stay, and follow-up as one brief.',
    stats: [
      { value: '1:1', label: 'Patient matching' },
      { value: 'End-to-end', label: 'Travel to recovery' },
      { value: 'Clear', label: 'Costs and timelines' },
    ],
    promise: [
      { title: 'Vetted network', body: 'Hospitals and specialists chosen for international-patient care, not availability alone.' },
      { title: 'A named coordinator', body: 'One owner from first consult through treatment and aftercare.' },
      { title: 'No surprise theatre', body: 'Estimates, recovery windows, and logistics written down before you fly.' },
    ],
    collection: [
      { title: 'Cardiac & specialist surgery', body: 'Second opinions and treatment plans with centres used to overseas patients.' },
      { title: 'Orthopaedics & joints', body: 'Replacement, sports, and rehab pathways with stay and physio sequenced.' },
      { title: 'Oncology support', body: 'Matching for diagnosis, treatment, and recovery — paced with the family, not the brochure.' },
      { title: 'Fertility', body: 'Clinic fit, timelines, and travel that respect how personal the brief is.' },
      { title: 'Dental & planned procedures', body: 'Quality and cost in one view, with aftercare booked before departure.' },
      { title: 'Wellness & recovery', body: 'When the medicine is done, the stay and follow-up still have an owner.' },
    ],
    steps: [
      { step: '01', title: 'Discover', body: 'Share reports, questions and budget. We start with the patient, not a package.' },
      { step: '02', title: 'Consult', body: 'A named coordinator reviews the brief and the kind of centre that fits.' },
      { step: '03', title: 'Choose', body: 'Hospitals and specialists used to overseas patients, written down before you commit.' },
      { step: '04', title: 'Travel', body: 'Flights, stay and admission planned as one window.' },
      { step: '05', title: 'Treatment', body: 'The coordinator stays on the case while you are in care.' },
      { step: '06', title: 'Recovery', body: 'Follow-up stays with the same owner once you are home.' },
    ],
  },
  connect: {
    path: '/connect',
    layout: 'va',
    inspiredBy: 'Belay / Boldly — roles you can hire, coverage on your hours, employment admin handled.',
    collectionTitle: 'Roles on the bench',
    collectionLede: 'Dedicated remote professionals, vetted out of Dubai, working your clock — not a rotating task board.',
    stats: [
      { value: 'Your hours', label: 'Coverage, not time zones as an excuse' },
      { value: 'Dedicated', label: 'People who stay on the account' },
      { value: 'Admin off', label: 'Employment and benefits handled' },
    ],
    promise: [
      { title: 'Vetted, then introduced', body: 'You interview. We already screened.' },
      { title: 'Focus stays with you', body: 'Operations continue while leadership does the work only you can do.' },
      { title: 'Scale without the lease', body: 'Add or reduce capacity without a hiring freeze or a new floor.' },
    ],
    collection: [
      { title: 'Executive administration', body: 'Calendars, inboxes, travel, and the follow-through that makes a week land.' },
      { title: 'Research & briefing', body: 'Markets, competitors, and decks — prepared before the meeting starts.' },
      { title: 'Marketing support', body: 'Content ops, channel admin, and campaign coordination beside RR Marketing when needed.' },
      { title: 'Customer care', body: 'Frontline coverage that stays polite, logged, and on your hours.' },
      { title: 'Data & operations', body: 'CRM hygiene, reporting, and the unglamorous work that keeps revenue honest.' },
      { title: 'People ops admin', body: 'Employment paperwork and benefits coordination so you are not the HR desk.' },
    ],
    steps: [
      { step: '01', title: 'Tell us what you need', body: 'Hours, tools and the work that should leave your desk.' },
      { step: '02', title: 'We match the talent', body: 'You interview. We already screened.' },
      { step: '03', title: 'You onboard', body: 'Dedicated coverage on your clock. Not a rotating task board.' },
      { step: '04', title: 'We support you', body: 'Employment admin and benefits handled so the person can stay.' },
    ],
  },
  wanders: {
    path: '/wanders',
    layout: 'travel',
    inspiredBy: 'Black Tomato — destination collections, tailor-made itineraries, enquiry not self-serve booking.',
    collectionTitle: 'Destinations',
    collectionLede: 'Discover, then plan. Philippines, Kerala and the Himalayas, with room to add more when the brief asks.',
    stats: [
      { value: 'Bespoke', label: 'Every itinerary' },
      { value: 'Local', label: 'Guides on the ground' },
      { value: 'Dubai', label: 'Planning desk' },
    ],
    promise: [
      { title: 'Architected, not packaged', body: 'Pace, hotels, and days in motion are built around you.' },
      { title: 'On-ground owners', body: 'Guides and partners who treat safety as a process.' },
      { title: 'From Dubai', body: 'A planning desk that already understands Gulf departure rhythms.' },
    ],
    collection: [
      {
        title: 'Philippines',
        body: 'Palawan lagoons, Cebu reefs, Boracay, Bohol, whale sharks — island time with logistics that hold.',
        image: 'wander-houseboat.jpg',
      },
      {
        title: 'Kerala',
        body: 'Houseboats, Ayurveda, Munnar, Wayanad, Kovalam — God’s Own Country at your tempo.',
        image: 'wander-tea.jpg',
      },
      {
        title: 'Nepal, Bhutan & Tibet',
        body: 'Everest approaches, Tiger’s Nest, Lhasa, festival circuits — altitude and culture with local expertise.',
        image: 'wander-himalaya.jpg',
      },
      {
        title: 'Lakes & cities',
        body: 'Pokhara-side mornings and city nights when the trek is not the whole story.',
        image: 'wander-city.jpg',
      },
      {
        title: 'Terraces & villages',
        body: 'Walking days through working landscapes, not a viewpoint stop.',
        image: 'wander-1.jpg',
      },
      {
        title: 'High camps',
        body: 'When the brief is a mountain, we plan the mountain — rest days included.',
        image: 'wander-nepal.jpg',
      },
    ],
    steps: [
      { step: '01', title: 'Discover', body: 'Where the eye goes first. Islands, backwaters, high country.' },
      { step: '02', title: 'Dream', body: 'Pace, season and the kind of days you actually want.' },
      { step: '03', title: 'Explore', body: 'Hotels, guides and days in motion, designed as one itinerary.' },
      { step: '04', title: 'Plan', body: 'A Dubai desk that already understands Gulf departure rhythms.' },
      { step: '05', title: 'Wander', body: 'Someone still owns the trip after you land.' },
    ],
  },
  threads: {
    path: '/threads',
    layout: 'apparel',
    inspiredBy: 'Cintas Design Collective / FIGS — industry lookbooks, samples first, brand on the garment.',
    collectionTitle: 'Industries',
    collectionLede: 'Hospitality, healthcare, corporate, industrial, kitchen. Tell us the floor. We specify the garment.',
    stats: [
      { value: 'Sample', label: 'Before production' },
      { value: 'QC', label: 'On every piece' },
      { value: 'Brand', label: 'Embroidery and print that last' },
    ],
    promise: [
      { title: 'See it first', body: 'Fabric, fit, and finish in hand before a production run starts.' },
      { title: 'The job, not the catalogue', body: 'Coveralls, PPE, scrubs, chef whites, robes — specified for how they are worn.' },
      { title: 'Identity that washes', body: 'Logos placed once, correctly, in threads or inks that survive the laundry.' },
    ],
    collection: [
      { title: 'Industrial & PPE', body: 'Coveralls, high-vis, safety vests and workwear that takes a shift.', image: 'threads-1.jpg' },
      { title: 'Hospitality', body: 'Front of house and property uniforms that carry the signage.', image: 'threads-2.jpg' },
      { title: 'Healthcare', body: 'Scrubs and clinic wear specified for a long floor.', image: 'threads-3.jpg' },
      { title: 'Kitchen', body: 'Whites, checks and heat-ready pieces for a brigade.', image: 'threads-4.jpg' },
      { title: 'Corporate & retail', body: 'Polos, shirts and branded basics for teams that move.', image: 'threads-5.jpg' },
      { title: 'Security & sites', body: 'One identity across posts, with colours and placements locked.', image: 'vertical-threads.jpg' },
    ],
    steps: [
      { step: '01', title: 'Fabric selection', body: 'Comfort, durability, and industry-fit materials and trims.' },
      { step: '02', title: 'Design application', body: 'Templates that balance look with how the garment is worn.' },
      { step: '03', title: 'Stitching', body: 'Cut pieces assembled with consistent, durable workmanship.' },
      { step: '04', title: 'Embroidery & print', body: 'Logos and graphics placed precisely, in threads or inks that last.' },
      { step: '05', title: 'QC & packaging', body: 'Every item checked, then boxed ready for the floor.' },
    ],
  },
  trading: {
    path: '/trading',
    layout: 'trade',
    inspiredBy: 'Flexport / specialist sourcing desks — spec in, QC, then Dubai logistics.',
    collectionTitle: 'Where we start',
    collectionLede: 'Categories we already run. Other specified goods on brief. No fake inventory.',
    stats: [
      { value: 'Spec in', label: 'Product, quantity, quality, dock' },
      { value: 'Explore', label: 'Manufacturers, not a shopfront' },
      { value: 'Dubai', label: 'Port, air and free zone' },
    ],
    promise: [
      { title: 'If you can specify it', body: 'We can explore sourcing it. That is the offer. Not a promise to conjure anything on earth.' },
      { title: 'Quality is a gate', body: 'Checks so the dock receipt can match the purchase order.' },
      { title: 'Dubai as the hub', body: 'Jebel Ali, DXB and free zones as the operating system.' },
    ],
    collection: [
      { title: 'Textiles and apparel', body: 'Fabric lots and finished goods, with the QC we already run for RR Threads.' },
      { title: 'Hospitality supply', body: 'Uniforms adjacent and room programmes sourced as a set.' },
      { title: 'Industrial products', body: 'Specified product. Not a catalogue screenshot.' },
      { title: 'Equipment', body: 'When the brief is a machine or a kit, we start with the spec sheet.' },
      { title: 'Construction materials', body: 'On request, with quality and logistics written down first.' },
      { title: 'Special sourcing', body: 'One requirement. We look. Then we tell you what is possible.' },
    ],
    steps: [
      { step: '01', title: 'Send the spec', body: 'Product, quantity, quality bar, and the dock you need it at.' },
      { step: '02', title: 'Source and sample', body: 'We find the manufacturer and put a lot in your hands before the run.' },
      { step: '03', title: 'Quality gate', body: 'Multi-stage checks so the receipt matches the PO.' },
      { step: '04', title: 'Move through Dubai', body: 'Jebel Ali, DXB, and free zones as the operating system.' },
    ],
  },
  upskilling: {
    path: '/upskilling',
    layout: 'learn',
    inspiredBy: 'Clean academy intros that send you to the real platform, not a duplicate LMS.',
    collectionTitle: 'On Sqilah',
    collectionLede: 'RR Upskilling introduces the work. Sqilah runs the courses. We do not rebuild their catalogue here.',
    stats: [
      { value: 'Sqilah', label: 'The learning platform' },
      { value: 'Industry', label: 'Aviation, logistics, hospitality, travel, healthcare' },
      { value: 'Red Reach', label: 'When you need the rest of the group' },
    ],
    promise: [
      { title: 'One click to the platform', body: 'Explore RR Upskilling takes you to sqilah.co, with Sqilah’s own branding.' },
      { title: 'Industry, not generic MOOCs', body: 'The existing offering sits in aviation, logistics, hospitality, travel and healthcare.' },
      { title: 'Stay in the group', body: 'When learning is not the whole brief, the other six desks are here.' },
    ],
    collection: [
      { title: 'Airfare & ticketing', body: 'The mechanics of how seats are sold and issued.' },
      { title: 'Logistics operations', body: 'How freight actually moves when the clock is real.' },
      { title: 'Hospitality', body: 'Floor, desk, and guest recovery — not only theory.' },
      { title: 'Travel & tourism', body: 'Itineraries, destinations, and the guest journey.' },
      { title: 'Healthcare pathways', body: 'For teams who sit beside care, not only clinicians.' },
      { title: 'Wine & cheese tourism', body: 'A specialist module for hosts who sell a region, not a room.' },
    ],
    steps: [
      { step: '01', title: 'Discover & define', body: 'Map strengths, goals, and the gap you actually need to close.' },
      { step: '02', title: 'Build foundations', body: 'Guided modules for the fundamentals that last.' },
      { step: '03', title: 'Apply & practice', body: 'Exercises and projects so knowledge becomes capability.' },
      { step: '04', title: 'Refine & elevate', body: 'Feedback that sharpens the work, not just the score.' },
      { step: '05', title: 'Achieve & advance', body: 'Step into the next role with evidence, not just intent.' },
    ],
  },
}

export function verticalPath(slug: string | undefined) {
  if (!slug) return '/businesses'
  return PLAYBOOKS[slug as VerticalSlug]?.path ?? `/businesses`
}

const PATH_ALIASES: Record<string, VerticalSlug> = {
  '/travel': 'wanders',
  '/uniforms': 'threads',
}

export function playbookByPath(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, '') || '/'
  const clean = trimmed.replace(/^\/RRCentral(?=\/|$)/, '') || '/'
  const alias = PATH_ALIASES[clean]
  if (alias) return { slug: alias, playbook: PLAYBOOKS[alias] }
  const entry = (Object.entries(PLAYBOOKS) as [VerticalSlug, VerticalPlaybook][]).find(([, p]) => p.path === clean)
  return entry ? { slug: entry[0], playbook: entry[1] } : undefined
}
