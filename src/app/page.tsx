import { Home } from '@/components/home';
import { demoData } from '@/lib/demo';
import type { PublicData } from '@/lib/types';
export const dynamic = 'force-dynamic';
export default function Page() {
  const empty: PublicData = {
    demo: false,
    election: null,
    candidates: [],
    supports: [],
    rosterCount: 0,
    undeclared: 0,
    neutral: 0,
    contested: 0,
    withdrawnSupport: 0,
    updatedAt: null,
    syncAt: null,
    correctionUrl: '',
    results: [],
  };
  return <Home initial={process.env.DATABASE_URL ? empty : demoData('camara')} />;
}
