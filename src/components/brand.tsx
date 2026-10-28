import { Landmark } from 'lucide-react';
export function Brand() {
  return (
    <a className="brand" href="/">
      <span className="brand-icon">
        <Landmark size={24} />
      </span>
      <span>
        Radar do Congresso<small>TRANSPARÊNCIA EM CADA APOIO</small>
      </span>
    </a>
  );
}
