import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Music, Upload, Play, Shield } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F7F5F0]">
      {/* Header */}
      <header className="bg-[#0d0d0d] border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src="/Logo Neurowake Music.png" alt="NeuroWake Music" className="h-40 w-auto" />
          <div className="flex gap-3">
            <Link href="/login">
              <Button variant="outline">Se connecter</Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-[#4A6FA5]">Commencer gratuitement</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl lg:text-5xl font-bold text-[#2C2C2A] leading-tight mb-6">
          La musique qui lui parle vraiment
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Créez une playlist personnalisée à partir des souvenirs musicaux de votre proche.
          Simple pour l&apos;aidant. Profond pour celui qui écoute.
        </p>
        <Link href="/signup">
          <Button size="lg" className="bg-[#4A6FA5] text-lg px-8 py-4 h-auto">
            Commencer gratuitement — 14 jours
          </Button>
        </Link>
        <p className="text-sm text-muted-foreground mt-3">Aucune carte bancaire requise</p>
      </section>

      {/* 3 étapes */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-center text-[#2C2C2A] mb-10">Comment ça marche</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: <Music className="h-8 w-8 text-[#4A6FA5]" />,
              title: 'Créer le profil',
              desc: 'Quelques questions sur sa jeunesse, ses goûts musicaux et ses passions',
            },
            {
              icon: <Upload className="h-8 w-8 text-[#4A6FA5]" />,
              title: 'Importer la musique',
              desc: 'Validez les titres suggérés et importez vos fichiers audio depuis votre collection',
            },
            {
              icon: <Play className="h-8 w-8 text-[#4A6FA5]" />,
              title: 'Lancer la session',
              desc: 'Profitez de playlists adaptées à chaque moment de la journée avec messages vocaux',
            },
          ].map((step, i) => (
            <Card key={i} className="text-center">
              <CardContent className="p-8">
                <div className="flex justify-center mb-4">{step.icon}</div>
                <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm">{step.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Caractéristiques */}
      <section className="bg-white py-12">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-6 text-center">
            {[
              { emoji: '📱', label: 'Fonctionne sur tous les appareils' },
              { emoji: '🎵', label: 'Aucun abonnement musical requis' },
              { emoji: '🎙️', label: 'Messages avec votre propre voix' },
            ].map((f, i) => (
              <div key={i} className="p-6">
                <div className="text-4xl mb-3">{f.emoji}</div>
                <p className="font-medium text-[#2C2C2A]">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-bold text-[#2C2C2A] mb-4">Prêt à commencer ?</h2>
        <p className="text-muted-foreground mb-8">14 jours gratuits, sans engagement</p>
        <Link href="/signup">
          <Button size="lg" className="bg-[#4A6FA5] text-lg px-8 py-4 h-auto">
            Créer mon compte
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <Shield className="h-4 w-4" />
            <span>NeuroWake Music n&apos;est pas un dispositif médical</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} NeuroWake Music · <Link href="mailto:contact@neurologis.fr" className="hover:underline">contact@neurologis.fr</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
