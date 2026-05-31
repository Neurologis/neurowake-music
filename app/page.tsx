'use client';
import { useState, useEffect } from 'react';
import { useT } from '@/hooks/use-t';
import { storeLangue, getStoredLangue, type Langue } from '@/lib/i18n';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Music, Upload, Play, Shield } from 'lucide-react';

const LANGS: { code: Langue; flag: string }[] = [
  { code: 'fr', flag: '🇫🇷' },
  { code: 'es', flag: '🇪🇸' },
  { code: 'en', flag: '🇬🇧' },
];

export default function LandingPage() {
  const { t } = useT();
  const [activeLang, setActiveLang] = useState<Langue>('fr');

  useEffect(() => {
    setActiveLang(getStoredLangue());
  }, []);

  function handleLang(code: Langue) {
    storeLangue(code);
    setActiveLang(code);
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0]">
      {/* Header */}
      <header className="bg-[#F7F5F0] border-b border-[#EDEAE3]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logoappli.png" alt="NeuroWake Music" className="h-40 w-auto" />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {LANGS.map(({ code, flag }) => (
                <button
                  key={code}
                  onClick={() => handleLang(code)}
                  title={code.toUpperCase()}
                  className={`
                    text-2xl leading-none transition-all px-1 py-0.5 rounded
                    ${activeLang === code
                      ? 'ring-2 ring-[#4A6FA5] ring-offset-1 scale-110'
                      : 'hover:scale-110 opacity-70 hover:opacity-100'
                    }
                  `}
                >
                  {flag}
                </button>
              ))}
            </div>
            <Link href="/login">
              <Button variant="outline" size="sm">{t('landing_connect')}</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm" className="bg-[#4A6FA5]">{t('landing_start_free')}</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl lg:text-5xl font-bold text-[#2C2C2A] leading-tight mb-6">
          {t('landing_hero_title')}
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          {t('landing_hero_desc')}
        </p>
        <Link href="/signup">
          <Button size="lg" className="bg-[#4A6FA5] text-lg px-8 py-4 h-auto">
            {t('landing_cta_free')}
          </Button>
        </Link>
        <p className="text-sm text-muted-foreground mt-3">{t('landing_no_card')}</p>
      </section>

      {/* 3 étapes */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-center text-[#2C2C2A] mb-10">{t('landing_how_title')}</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: <Music className="h-8 w-8 text-[#4A6FA5]" />,
              title: t('landing_step1_title'),
              desc:  t('landing_step1_desc'),
            },
            {
              icon: <Upload className="h-8 w-8 text-[#4A6FA5]" />,
              title: t('landing_step2_title'),
              desc:  t('landing_step2_desc'),
            },
            {
              icon: <Play className="h-8 w-8 text-[#4A6FA5]" />,
              title: t('landing_step3_title'),
              desc:  t('landing_step3_desc'),
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
              { emoji: '📱', label: t('landing_feat1') },
              { emoji: '🎵', label: t('landing_feat2') },
              { emoji: '🎙️', label: t('landing_feat3') },
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
        <h2 className="text-2xl font-bold text-[#2C2C2A] mb-4">{t('landing_cta_title')}</h2>
        <p className="text-muted-foreground mb-8">{t('landing_cta_desc')}</p>
        <Link href="/signup">
          <Button size="lg" className="bg-[#4A6FA5] text-lg px-8 py-4 h-auto">
            {t('landing_create_account')}
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <Shield className="h-4 w-4" />
            <span>{t('landing_disclaimer')}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} NeuroWake Music · <Link href="mailto:contact@neurologis.fr" className="hover:underline">contact@neurologis.fr</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
