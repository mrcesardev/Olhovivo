import { Admin } from '@/components/admin';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Dashboard editorial | Radar do Congresso',
  robots: { index: false, follow: false },
};
export default function AdminPage() {
  return <Admin demo={!process.env.DATABASE_URL} />;
}
