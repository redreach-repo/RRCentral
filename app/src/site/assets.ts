export const siteAsset = (file: string) => `${import.meta.env.BASE_URL}site/${file}`

export const CLIENT_LOGOS = [
  'logo-1.png',
  'logo-2.png',
  'logo-4.png',
  'logo-5.png',
  'logo-6.png',
  'logo-7.png',
  'logo-8.png',
] as const

export const DESTINATION_PHOTOS = [
  { file: 'wander-houseboat.jpg', caption: 'Philippines' },
  { file: 'wander-tea.jpg', caption: 'Kerala' },
  { file: 'wander-nepal.jpg', caption: 'Nepal' },
  { file: 'wander-1.jpg', caption: 'Rice terraces' },
  { file: 'wander-city.jpg', caption: 'Lakeside cities' },
  { file: 'wander-himalaya.jpg', caption: 'Himalayas' },
] as const
