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
  { file: 'wander-houseboat.jpg', caption: 'Palawan' },
  { file: 'wander-tea.jpg', caption: 'Munnar' },
  { file: 'wander-nepal.jpg', caption: 'Kathmandu' },
  { file: 'wander-1.jpg', caption: 'Terraces' },
  { file: 'wander-city.jpg', caption: 'Pokhara' },
  { file: 'wander-himalaya.jpg', caption: 'High Himalaya' },
] as const

export const DESTINATION_FILM = DESTINATION_PHOTOS.map((shot) => shot.file)

export const THREAD_LOOKBOOK = [
  'threads-1.jpg',
  'threads-2.jpg',
  'threads-3.jpg',
  'threads-4.jpg',
  'threads-5.jpg',
  'vertical-threads.jpg',
] as const
