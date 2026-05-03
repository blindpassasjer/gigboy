import amp from '../assets/stageplot-icons/amp.svg';
import bass from '../assets/stageplot-icons/bass.svg';
import custom from '../assets/stageplot-icons/custom.svg';
import drums from '../assets/stageplot-icons/drums.svg';
import guitar from '../assets/stageplot-icons/guitar.svg';
import keys from '../assets/stageplot-icons/keys.svg';
import monitor from '../assets/stageplot-icons/monitor.svg';
import vocals from '../assets/stageplot-icons/vocals.svg';

const ICON_BY_KIND: Record<string, string> = {
  amp,
  bass,
  custom,
  drums,
  guitar,
  keys,
  monitor,
  vocals,
};

export function stageplotIconForKind(kind: string) {
  return ICON_BY_KIND[kind] ?? custom;
}
