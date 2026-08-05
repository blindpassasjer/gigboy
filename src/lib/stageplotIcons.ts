import type { StageplotItem } from '../types';
import amp from '../assets/stageplot-icons/amp.svg';
import guitarAmp from '../assets/stageplot-icons/guitar-amp.svg';
import bassAmp from '../assets/stageplot-icons/bass-amp.svg';
import keyboardAmp from '../assets/stageplot-icons/keyboard-amp.svg';
import bass from '../assets/stageplot-icons/bass.svg';
import custom from '../assets/stageplot-icons/custom.svg';
import drums from '../assets/stageplot-icons/drums.svg';
import drumKick from '../assets/stageplot-icons/drum-kick.svg';
import drumSnare from '../assets/stageplot-icons/drum-snare.svg';
import drumHihat from '../assets/stageplot-icons/drum-hihat.svg';
import drumRackTom from '../assets/stageplot-icons/drum-rack-tom.svg';
import drumFloorTom from '../assets/stageplot-icons/drum-floor-tom.svg';
import drumCrash from '../assets/stageplot-icons/drum-crash.svg';
import drumRide from '../assets/stageplot-icons/drum-ride.svg';
import drumOverhead from '../assets/stageplot-icons/drum-overhead.svg';
import guitar from '../assets/stageplot-icons/guitar.svg';
import keys from '../assets/stageplot-icons/keys.svg';
import monitor from '../assets/stageplot-icons/monitor.svg';
import vocals from '../assets/stageplot-icons/vocals.svg';
import iem from '../assets/stageplot-icons/iem.svg';
import pa from '../assets/stageplot-icons/pa.svg';
import subs from '../assets/stageplot-icons/subs.svg';
import violin from '../assets/stageplot-icons/violin.svg';
import trumpet from '../assets/stageplot-icons/trumpet.svg';
import saxophone from '../assets/stageplot-icons/saxophone.svg';

const ICON_BY_KIND: Record<string, string> = {
  amp,
  'guitar-amp': guitarAmp,
  'bass-amp': bassAmp,
  'keyboard-amp': keyboardAmp,
  bass,
  custom,
  drums,
  'drum-kick': drumKick,
  'drum-snare': drumSnare,
  'drum-hihat': drumHihat,
  'drum-rack-tom': drumRackTom,
  'drum-floor-tom': drumFloorTom,
  'drum-crash': drumCrash,
  'drum-ride': drumRide,
  'drum-overhead': drumOverhead,
  guitar,
  keys,
  monitor,
  vocals,
  iem,
  pa,
  subs,
  violin,
  trumpet,
  saxophone,
};

export function stageplotIconForKind(kind: string) {
  return ICON_BY_KIND[kind] ?? custom;
}

// Relative on-stage size for each item kind, so e.g. a kick drum reads as
// physically larger than a hi-hat or overhead mic, matching real proportions.
const ICON_SCALE_BY_KIND: Record<string, number> = {
  drums: 1.3,
  'drum-kick': 1.3,
  'drum-floor-tom': 1.15,
  'drum-rack-tom': 1.05,
  'drum-snare': 1,
  'drum-crash': 0.9,
  'drum-ride': 0.9,
  'drum-hihat': 0.85,
  'drum-overhead': 0.8,
  pa: 1.2,
  subs: 1.2,
  amp: 1.1,
  'guitar-amp': 1.1,
  'bass-amp': 1.1,
  'keyboard-amp': 1.1,
  monitor: 0.95,
  iem: 0.75,
};

export function stageplotIconScaleForKind(kind: string) {
  return ICON_SCALE_BY_KIND[kind] ?? 1;
}

// The on-stage/legend badge shows the mixer channel when one is assigned,
// since that's what a stage plot's numbers conventionally mean — falling
// back to list position (visually distinct) only for unassigned items, so
// the two kinds of number are never mistakable for each other.
export function stageplotItemBadge(
  item: StageplotItem,
  index: number
): { value: string; isChannel: boolean } {
  const channel = item.channel?.trim();
  return channel ? { value: channel, isChannel: true } : { value: `#${index + 1}`, isChannel: false };
}
