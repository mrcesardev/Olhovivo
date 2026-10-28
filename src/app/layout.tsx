import type { Metadata } from 'next';
import '@fontsource/manrope/latin-800.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'Radar do Congresso | Apoios declarados',
  description:
    'Acompanhe declarações públicas de apoio às presidências da Câmara e do Senado, com fontes e revisão editorial.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
