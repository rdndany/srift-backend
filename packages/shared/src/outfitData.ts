import type { ClassId } from './classes';

/**
 * The list of the outfits and what each is made of: plain data, with nothing imported at run time, so that the items table (`items.ts`) can have
 * an item for each. What an outfit does and how it is worn is in `outfits.ts`; the picture is made by the client (`setGear.ts` on the web side).
 */

export type OutfitTier = 'common' | 'rare' | 'epic';
export const OUTFIT_TIERS: readonly OutfitTier[] = ['common', 'rare', 'epic'];

export interface OutfitDef {
  id: string;
  /** The class whose sets these are: only a hero of it can wear it. */
  cls: ClassId;
  name: string;
  blurb: string;
  tier: OutfitTier;
  /** The main cloth (the hoodie, the robe, the leathers), the second cloth (the trousers, the lining), the trim (the metal of the edges and settings, the buckles and the badge), as CSS colours. */
  shirt: string;
  pants: string;
  trim: string;
  /** The colour of the light the set shines with (its seams, gems, blades and sparks). */
  glow: string;
}

export const OUTFITS: readonly OutfitDef[] = [
  // The Warrior's: plate, horns and crowns, spiked pauldrons, wings of blades.
  { id: 'mossback', cls: 'warrior', name: 'Mossback', blurb: 'Bronze and bark-green plate under antlers, with leaf-bright blades at the back and leaves that drift around you.', tier: 'common', shirt: '#3f7a35', pants: '#2c3e22', trim: '#d6c17a', glow: '#7dff6a' },
  { id: 'dusk-wanderer', cls: 'warrior', name: 'Dusk Wanderer', blurb: 'Violet plate and a tall spire of a helm, with small blades of dusk-light and runes that circle you.', tier: 'common', shirt: '#5b3f8c', pants: '#231c36', trim: '#c9a2ff', glow: '#b48cff' },
  { id: 'frostbound', cls: 'warrior', name: 'Frostbound', blurb: 'Ice-pale plate, a crown of crystals, and snow that falls around you without ever landing.', tier: 'common', shirt: '#cfe3ee', pants: '#4a6a8a', trim: '#bfe9ff', glow: '#7fd8ff' },
  { id: 'crimson-warden', cls: 'warrior', name: 'Crimson Warden', blurb: 'Black steel with a red fire in its seams, great curved horns, spiked pauldrons, wings of blades and a ring of light on the ground. Embers rise from it.', tier: 'rare', shirt: '#8c1d2a', pants: '#1b1a20', trim: '#e8ecf4', glow: '#ff3d3d' },
  { id: 'sunforged', cls: 'warrior', name: 'Sunforged', blurb: 'Gold plate that shines with its own light: a halo and a crown of rays, wings of golden blades, and sparks that climb into the air.', tier: 'rare', shirt: '#c98f1a', pants: '#4a2f1a', trim: '#fff0a0', glow: '#ffcc33' },
  { id: 'tidecaller', cls: 'warrior', name: 'Tidecaller', blurb: 'Pearl and deep-sea plate, fins at the helm, wings of tide-blue blades, and bubbles that rise from a ring of light.', tier: 'rare', shirt: '#1f8c93', pants: '#12284d', trim: '#f2ece0', glow: '#44f0ff' },
  { id: 'voidwalker', cls: 'warrior', name: 'Voidwalker', blurb: 'Plate the colour of the space between stars, great horns, five blades to a wing, two rings of runes, and a storm of magenta light pulled in toward its heart.', tier: 'epic', shirt: '#2a1848', pants: '#0d0a14', trim: '#ff3fd0', glow: '#ff2fd0' },
  { id: 'hollow-livery', cls: 'warrior', name: "Hollow King's Livery", blurb: 'Bone plate with an ember in every seam, a crown of spikes, great wings of burning blades, two rings of runes and a rain of fire: the dress of the one who wears the crown.', tier: 'epic', shirt: '#e5dccb', pants: '#4b4742', trim: '#ff7a1a', glow: '#ff8a2a' },
  // The Mage's: robes, hats and hoods, rings that turn about them, shards that float, a circle of runes at the back.
  { id: 'starweaver', cls: 'mage', name: 'Starweaver', blurb: 'A midnight-blue robe sewn with gold stars, a wide pointed hat with a star at its band, and a ring of light that turns about you with little stars in its wake.', tier: 'common', shirt: '#1d2f78', pants: '#0c1438', trim: '#f4d77a', glow: '#6fb4ff' },
  { id: 'emberrobe', cls: 'mage', name: 'Emberrobe', blurb: 'A robe the colour of a banked fire under a hood with a crest of flame, embers rising from the hem and little suns that circle you.', tier: 'common', shirt: '#a8321a', pants: '#3a0f0a', trim: '#ffcf6a', glow: '#ff7a33' },
  { id: 'wintermoon', cls: 'mage', name: 'Wintermoon', blurb: 'Pale silver robes, a circlet with a crescent moon over the brow, a moon of ice behind you and snow that never lands.', tier: 'common', shirt: '#dbe8f6', pants: '#55709a', trim: '#c8d4ee', glow: '#9fe8ff' },
  { id: 'stormcaller', cls: 'mage', name: 'Stormcaller', blurb: 'Storm-purple robes with a high collar, a horned hat, two rings that spin at right angles about you, shards of lightning that hang in the air and a circle of runes at your back.', tier: 'rare', shirt: '#3a2e86', pants: '#151038', trim: '#9fdcff', glow: '#8f9bff' },
  { id: 'runekeeper', cls: 'mage', name: 'Runekeeper', blurb: 'Ivory and gold robes, a tall mitre with a ring of light floating over it, a great turning circle of runes behind you and glyphs that climb the air.', tier: 'rare', shirt: '#efe6cf', pants: '#7a5b2a', trim: '#ffd24a', glow: '#ffd24a' },
  { id: 'sanguine', cls: 'mage', name: 'Sanguine', blurb: 'Black silk lined in blood, a witch\'s hat with horns, a mantle of blades at the shoulders, a blood moon that hangs behind you and red petals on the wind.', tier: 'rare', shirt: '#7a0f2a', pants: '#0f0710', trim: '#d8c8d0', glow: '#ff2f5f' },
  { id: 'aetherlord', cls: 'mage', name: 'Aetherlord', blurb: 'A robe cut from the night sky, a crown of seven shards that float over the head, three rings that turn about you, a great circle of runes at your back, and a storm of light drawn in from the dark.', tier: 'epic', shirt: '#231a5e', pants: '#090722', trim: '#7ff0ff', glow: '#5ff0ff' },
  { id: 'lich-sovereign', cls: 'mage', name: 'Lich Sovereign', blurb: 'Bone and grave-green: a skull crown with horns, a tattered mantle, green soul-fire rising from the hem, two rings of runes, a circle of them at your back and shards of spirit that orbit you.', tier: 'epic', shirt: '#2c3b2a', pants: '#0c120d', trim: '#cfe8c8', glow: '#6dff9a' },

  // The Ranger's: hoods, furs, feathers, a cloak that streams, a quiver, wings of feather or leaf.
  { id: 'greenwarden', cls: 'ranger', name: 'Greenwarden', blurb: 'Forest-green leathers, a hood with a long feather, a quiver of glowing arrows and leaves that fall around you.', tier: 'common', shirt: '#3d6b2e', pants: '#2a2418', trim: '#c9a15a', glow: '#8cff5a' },
  { id: 'duskstalker', cls: 'ranger', name: 'Duskstalker', blurb: 'Dusk-grey leathers, a deep hood and a mask, a ragged cloak that streams behind you and violet fireflies that wander about.', tier: 'common', shirt: '#3b3550', pants: '#14121c', trim: '#a89ac8', glow: '#b78cff' },
  { id: 'sandrunner', cls: 'ranger', name: 'Sandrunner', blurb: 'Sun-faded leathers and a wrapped scarf, a feathered cap, a short cloak, and a cloud of golden dust that rises as you move.', tier: 'common', shirt: '#b58a4a', pants: '#5a3d22', trim: '#f1d9a0', glow: '#ffd27a' },
  { id: 'wildheart', cls: 'ranger', name: 'Wildheart', blurb: 'Furs and bone, a headdress of antlers, a fur mantle, small feathered wings and fireflies of amber light; a ring of the wild under your feet.', tier: 'rare', shirt: '#6b4a2a', pants: '#2f2113', trim: '#e9dcc0', glow: '#ffbf3d' },
  { id: 'stormfeather', cls: 'ranger', name: 'Stormfeather', blurb: 'White and sky-blue leathers, a winged helm, great wings of long feathers, sparks of lightning and a ring of light.', tier: 'rare', shirt: '#e8f0f8', pants: '#355a86', trim: '#9fd0ff', glow: '#6fd4ff' },
  { id: 'emberhawk', cls: 'ranger', name: 'Emberhawk', blurb: 'Rust-red leathers, a hawk\'s crest, wings of feathers that burn at the tips, embers that climb and a ring of fire on the ground.', tier: 'rare', shirt: '#b83d1c', pants: '#2a1410', trim: '#ffd27a', glow: '#ff8a2a' },
  { id: 'moonshadow', cls: 'ranger', name: 'Moonshadow', blurb: 'Silver and violet leathers, a crescent headdress, ribbons of moonlight that stream behind you, great wings of light, two rings, drifting petals and little moons that circle.', tier: 'epic', shirt: '#b9b4e0', pants: '#2a2650', trim: '#f4f0ff', glow: '#c9a8ff' },
  { id: 'worldroot', cls: 'ranger', name: 'Worldroot Avatar', blurb: 'Bark and gold, a crown of antlers in bloom, wings of branches and leaves, two rings of the wild, a spiral of green light and petals that never stop falling: the forest itself in a hero\'s shape.', tier: 'epic', shirt: '#5a4326', pants: '#1f2a14', trim: '#ffe27a', glow: '#9dff4a' },
];

const BY_ID = new Map(OUTFITS.map((o) => [o.id, o]));

export const outfitById = (id: unknown): OutfitDef | null => (typeof id === 'string' ? (BY_ID.get(id) ?? null) : null);

/** The outfits of one class, in the order of the list. */
export const outfitsOfClass = (cls: ClassId | null | undefined): OutfitDef[] => OUTFITS.filter((o) => o.cls === cls);
