import amp from '../assets/stageplot-icons/amp.svg';
import guitarAmp from '../assets/stageplot-icons/guitar-amp.svg';
import bassAmp from '../assets/stageplot-icons/bass-amp.svg';
import keyboardAmp from '../assets/stageplot-icons/keyboard-amp.svg';
import bass from '../assets/stageplot-icons/bass.svg';
import custom from '../assets/stageplot-icons/custom.svg';
import drums from '../assets/stageplot-icons/drums.svg';
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
  'drum-kick': drums,
  'drum-snare': drums,
  'drum-hihat': drums,
  'drum-rack-tom': drums,
  'drum-floor-tom': drums,
  'drum-overhead': drums,
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
