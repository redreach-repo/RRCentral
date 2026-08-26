export type WanderRegionSlug = 'philippines' | 'kerala' | 'himalaya'

export type WanderPlace = {
  name: string
  region: WanderRegionSlug
  image: string
  facts: [string, string]
}

export type WanderRegion = {
  slug: WanderRegionSlug
  name: string
  land: string
  hero: string
  kicker: string
  headline: string
  story: string
  places: WanderPlace[]
}

export const WANDER_REGIONS: WanderRegion[] = [
  {
    slug: 'philippines',
    name: 'Philippines',
    land: 'Islands',
    hero: 'wander-houseboat.jpg',
    kicker: 'Limestone, lagoon, bangka',
    headline: 'Island days that actually hold.',
    story:
      'Palawan first. Then Cebu, Boracay, Bohol, Cagayan de Oro when the brief asks. From Dubai we plan the water days, the island hops and the nights on shore — not a flyer with a departure date.',
    places: [
      {
        name: 'Palawan',
        region: 'philippines',
        image: 'wander-houseboat.jpg',
        facts: [
          'Limestone islands and hidden lagoons, reached by bangka.',
          'El Nido and Coron are the names most travellers already know.',
        ],
      },
      {
        name: 'Cebu',
        region: 'philippines',
        image: 'wander-houseboat.jpg',
        facts: [
          'Reef days and island hops off a working port city.',
          'A base when Palawan is not the whole story.',
        ],
      },
      {
        name: 'Boracay',
        region: 'philippines',
        image: 'wander-houseboat.jpg',
        facts: [
          'White Beach is the postcard. The brief is how you want the days to feel.',
          'Easy water, short hops, nights that can stay quiet.',
        ],
      },
      {
        name: 'Bohol',
        region: 'philippines',
        image: 'wander-houseboat.jpg',
        facts: [
          'Chocolate Hills inland. Reef and sand when you want the water again.',
          'A slower island after Palawan.',
        ],
      },
    ],
  },
  {
    slug: 'kerala',
    name: 'Kerala',
    land: 'Backwaters & high country',
    hero: 'wander-tea.jpg',
    kicker: "God's Own Country",
    headline: 'Houseboats, tea and the slow south.',
    story:
      'Kerala is water and hill in one state. Backwaters at your tempo. Munnar when you want the gardens. Ayurveda when the brief is to stop. We plan it from Dubai as one itinerary, not three packages glued together.',
    places: [
      {
        name: 'Munnar',
        region: 'kerala',
        image: 'wander-tea.jpg',
        facts: [
          'Tea gardens folded into the Western Ghats.',
          'Cooler air, walking days, nights that smell like leaf.',
        ],
      },
      {
        name: 'Backwaters',
        region: 'kerala',
        image: 'wander-3.jpg',
        facts: [
          'Houseboat time on a working waterway, not a theme park.',
          'Alleppey and the quieter stretches when you ask for quiet.',
        ],
      },
      {
        name: 'Waterfalls',
        region: 'kerala',
        image: 'wander-3.jpg',
        facts: [
          'Wide falls in monsoon country, framed by rainforest.',
          'A day in motion between coast and hill.',
        ],
      },
      {
        name: 'Wayanad',
        region: 'kerala',
        image: 'wander-1.jpg',
        facts: [
          'Forest, spice and village walks in the north of the state.',
          'For travellers who want green more than beach.',
        ],
      },
    ],
  },
  {
    slug: 'himalaya',
    name: 'Himalaya',
    land: 'Nepal, Bhutan & Tibet',
    hero: 'wander-himalaya.jpg',
    kicker: 'Altitude and old cities',
    headline: 'When the brief is a mountain.',
    story:
      'Kathmandu lanes. Pokhara mornings. High camps with rest days written in. Bhutan and Tibet when culture is the point, not only the ridge. Local partners treat safety as a process.',
    places: [
      {
        name: 'Kathmandu',
        region: 'himalaya',
        image: 'wander-nepal.jpg',
        facts: [
          'Pagoda roofs and living courtyards, not a museum street.',
          'The start of most Nepal journeys we plan.',
        ],
      },
      {
        name: 'Pokhara',
        region: 'himalaya',
        image: 'wander-city.jpg',
        facts: [
          'Lakeside city under the Annapurnas.',
          'When the trek is not the whole story.',
        ],
      },
      {
        name: 'High camps',
        region: 'himalaya',
        image: 'wander-himalaya.jpg',
        facts: [
          'Everest approaches and other high trails, with rest days included.',
          'We plan the mountain. We do not sell a summit you did not ask for.',
        ],
      },
      {
        name: 'Lhasa',
        region: 'himalaya',
        image: 'wander-2.jpg',
        facts: [
          'The Potala on the hill is the image most people already carry.',
          'Tibet journeys need permits and pacing. We start there.',
        ],
      },
    ],
  },
]

export const WANDER_HERO = [
  {
    name: 'Palawan',
    region: 'philippines' as const,
    image: 'wander-houseboat.jpg',
    fact: 'Limestone islands, hidden lagoons, bangka days.',
  },
  {
    name: 'Munnar',
    region: 'kerala' as const,
    image: 'wander-tea.jpg',
    fact: 'Tea gardens folded into the Western Ghats.',
  },
  {
    name: 'Kathmandu',
    region: 'himalaya' as const,
    image: 'wander-nepal.jpg',
    fact: 'Pagoda roofs, living courtyards, the start of the trail.',
  },
  {
    name: 'High Himalaya',
    region: 'himalaya' as const,
    image: 'wander-himalaya.jpg',
    fact: 'When the brief is a mountain, we plan the mountain.',
  },
]

export const WANDER_EXPERIENCES = [
  { label: 'Islands', image: 'wander-houseboat.jpg', to: 'philippines' },
  { label: 'Tea country', image: 'wander-tea.jpg', to: 'kerala' },
  { label: 'Waterfalls', image: 'wander-3.jpg', to: 'kerala' },
  { label: 'Heritage', image: 'wander-nepal.jpg', to: 'himalaya' },
  { label: 'High country', image: 'wander-himalaya.jpg', to: 'himalaya' },
  { label: 'Lakeside cities', image: 'wander-city.jpg', to: 'himalaya' },
] as const

export const WANDER_PLACES = WANDER_REGIONS.flatMap((region) => region.places)

export const WANDER_BUCKET = [
  WANDER_REGIONS[0].places[0],
  WANDER_REGIONS[1].places[0],
  WANDER_REGIONS[1].places[2],
  WANDER_REGIONS[1].places[3],
  WANDER_REGIONS[2].places[0],
  WANDER_REGIONS[2].places[1],
  WANDER_REGIONS[2].places[2],
  WANDER_REGIONS[2].places[3],
]

export function wanderRegionBySlug(slug: string | undefined) {
  return WANDER_REGIONS.find((region) => region.slug === slug)
}
