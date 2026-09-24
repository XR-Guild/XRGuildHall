// Meta Connect 2026 news briefing. Compiled 2026-09-23 (evening PT), after the
// Sept 23, 4pm PT keynote. Every figure carries its source. Where sources
// disagree, both values are shown and flagged instead of silently picking one.

export interface Spec {
  label: string;
  value: string;
  src: string[]; // keys into SOURCES
  flag?: string; // discrepancy or "not official" note
}

export const SOURCES: Record<string, { name: string; url: string }> = {
  uploadvr: { name: 'UploadVR', url: 'https://www.uploadvr.com/meta-vr-glasses-officially-announced-connect-2026/' },
  r2vr: { name: 'Road to VR', url: 'https://roadtovr.com/meta-vr-glasses-unveiled-price-release-date/' },
  engadget: { name: 'Engadget', url: 'https://www.engadget.com/2267230/everything-announced-at-meta-connect-2026/' },
  vrorg: { name: 'VR.org', url: 'https://vr.org/articles/meta-vr-glasses-phoenix-1299-spring-2027-puck-2026' },
  toms: { name: "Tom's Guide live blog", url: 'https://www.tomsguide.com/news/live/meta-connect-2026-live' },
  meta: { name: 'Meta: Everything we announced', url: 'https://www.meta.com/blog/meta-connect-2026-everything-we-announced/' },
  hypebeast: { name: 'Hypebeast', url: 'https://hypebeast.com/2026/9/meta-connect-2026-vr-glasses-ray-ban-audio-next-gen-specs' },
};

export const HEADLINE = {
  kicker: 'Meta Connect 2026 · announced Sept 23',
  title: 'Meta VR Glasses',
  dek: 'A ~100 g visor tethered by optical cable to a pocket compute puck. $1,299.99, shipping Spring 2027. Runs the full Quest library.',
  status: 'Announced product, not a prototype. Pre-order date not yet given.',
};

export const SPECS: Spec[] = [
  { label: 'Price', value: '$1,299.99 (reported as "$1,300" by most outlets)', src: ['vrorg', 'r2vr', 'engadget'] },
  { label: 'Release', value: 'Spring 2027, no exact date', src: ['r2vr', 'uploadvr', 'engadget'] },
  { label: 'Visor weight', value: '~100 g on the face', src: ['uploadvr', 'r2vr', 'engadget'] },
  { label: 'Compute puck', value: '~300 g, optical fiber tether', src: ['r2vr', 'vrorg'], flag: 'Puck weight is reported by Road to VR; UploadVR lists it as undisclosed.' },
  { label: 'Display', value: 'Dual micro-OLED, 2412 × 2288 per eye (~5.5 MP), marketed as "5K"', src: ['uploadvr', 'r2vr'] },
  { label: 'Refresh', value: 'Up to 120 Hz', src: ['uploadvr', 'r2vr'] },
  { label: 'Field of view', value: '70° H × 66° V', src: ['uploadvr', 'r2vr', 'vrorg'], flag: 'Diagonal differs: 87° (UploadVR) vs 88° (Road to VR).' },
  { label: 'Sharpness', value: '37 pixels per degree', src: ['uploadvr', 'r2vr'] },
  { label: 'Lenses / IPD', value: 'Pancake lenses, IPD 56–70 mm', src: ['r2vr', 'engadget'] },
  { label: 'Passthrough', value: 'Full-color, 26 PPD, autofocus + depth sensing', src: ['uploadvr', 'r2vr'] },
  { label: 'Chip / memory', value: 'Snapdragon Reality Elite, 12 GB RAM, 128 GB + microSD to 1 TB', src: ['uploadvr', 'r2vr'] },
  { label: 'Battery', value: '3+ hours mixed use, 45 W USB-C fast charge, charge while in use', src: ['r2vr', 'engadget'] },
  { label: 'Input', value: 'Eyes + hands first (pinch, thumb swipe); voice; Touch Plus or Quest 3/3S controllers optional', src: ['r2vr', 'uploadvr'] },
  { label: 'Sensors', value: '4-camera eye tracking, face tracking, iris unlock', src: ['r2vr', 'uploadvr'] },
  { label: 'Software', value: 'Quest OS; whole Quest catalog; 75+ hand-optimized titles at launch; browser access', src: ['r2vr', 'toms'] },
  { label: 'Media', value: 'Dolby Vision, Dolby Atmos, IMAX Enhanced; DisplayPort-in', src: ['r2vr', 'engadget'] },
];

export const NOT_DISCLOSED = [
  'Exact ship date and pre-order date',
  'Wi-Fi and Bluetooth generations',
  'Developer tooling timeline and any WebXR-specific features',
  'Passthrough latency and camera specs',
  'Detailed thermal and audio specifications',
];

// Discussion prompts for creators. Framed as questions, since answers are not public yet.
export const TALKING_POINTS: { group: string; items: string[] }[] = [
  {
    group: 'For builders',
    items: [
      'Does the Quest Browser on this device expose eye tracking to WebXR, and with what consent model?',
      '37 PPD changes text legibility budgets. Which UI sizes do we retune?',
      'Hands-first input: how many of our interactions still assume controllers?',
    ],
  },
  {
    group: 'Ethics and safety (XR Guild lens)',
    items: [
      'Iris unlock and 4-camera eye tracking: where is gaze data processed, and is it ever retained?',
      'Face tracking in hologram calls: what is shared with the other party, and what is stored?',
      'Passthrough with depth sensing: what bystander notice does the device give?',
    ],
  },
  {
    group: 'Business questions to ask Meta',
    items: [
      'Dev kit access before Spring 2027, and on what terms?',
      'Revenue share and store placement for "hands-enhanced" titles at launch.',
      'Enterprise or education pricing below $1,299.99, and volume terms.',
    ],
  },
];

export const ALSO_ANNOUNCED = [
  { name: 'Ray-Ban Meta Gen 3', detail: 'From $449 · 12 MP, 3K video · six-mic array · 9 h battery', src: ['engadget'], flag: 'Engadget: available today. Hypebeast: ships Oct 13.' },
  { name: 'Ray-Ban Meta Audio', detail: 'From $349 · no camera · 43 g · 12 h audio · ships Oct 13', src: ['engadget', 'hypebeast'] },
  { name: 'Meta Ray-Ban Display', detail: '$799 US · EU pre-orders open · new navigation + hologram avatars in WhatsApp', src: ['engadget'] },
  { name: 'Muse Charm', detail: 'Preview only: keychain-size Muse agent device, "more later this year"', src: ['engadget', 'meta'] },
];

// XR device lineage for the table. Dates are well-established history.
export const LINEAGE = [
  { era: 'past', year: '1838', name: 'Wheatstone stereoscope', note: 'Mirrors and two images: the first demonstration of binocular depth.', tl: '6f77c65f' },
  { era: 'past', year: '1861', name: 'Holmes stereoscope', note: 'Hand-held viewer that put 3D photographs in parlors.', tl: '76c60fca' },
  { era: 'past', year: '1968', name: 'Sutherland HMD', note: 'The "Sword of Damocles": head-tracked computer graphics.', tl: 'bc1aa481' },
  { era: 'present', year: '2013', name: 'Consumer VR headsets', note: 'Dev kits restart the modern VR era.', tl: '932d6566' },
  { era: 'present', year: '2019', name: 'Standalone headsets', note: 'Untethered 6DoF with inside-out tracking.', tl: '93b45477' },
  { era: 'present', year: '2023', name: 'AI camera glasses', note: 'Smart glasses become an everyday wearable.', tl: 'a9497cd2' },
  { era: 'future', year: '2027', name: 'Meta VR Glasses', note: 'Announced: ~100 g visor + compute puck.', tl: '' },
];
