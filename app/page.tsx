'use client';
import { useState, useEffect } from 'react';
import { useT } from '@/hooks/use-t';
import { storeLangue, getStoredLangue, type Langue } from '@/lib/i18n';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Music, Upload, Play } from 'lucide-react';

const LANGS: { code: Langue; src: string; alt: string }[] = [
  { code: 'fr', src: 'https://flagcdn.com/32x24/fr.png', alt: 'Français' },
  { code: 'es', src: 'https://flagcdn.com/32x24/es.png', alt: 'Español' },
  { code: 'en', src: 'https://flagcdn.com/32x24/gb.png', alt: 'English' },
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
            <div className="flex gap-2 items-center">
              {LANGS.map(({ code, src, alt }) => (
                <button
                  key={code}
                  onClick={() => handleLang(code)}
                  title={alt}
                  className={`
                    transition-all rounded overflow-hidden
                    ${activeLang === code
                      ? 'ring-2 ring-[#F5A623] ring-offset-1 scale-110 opacity-100'
                      : 'opacity-60 hover:opacity-100 hover:scale-105'
                    }
                  `}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} width={32} height={24} alt={alt} style={{ display: 'block' }} />
                </button>
              ))}
            </div>
            <Link href="/login">
              <Button variant="outline" size="sm">{t('landing_connect')}</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm" className="bg-[#F5A623] hover:bg-[#F5A623]/90">{t('landing_start_free')}</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1
          className="text-4xl lg:text-5xl font-bold text-[#2C2C2A] leading-tight mb-3"
          dangerouslySetInnerHTML={{
            __html: t('landing_hero_title').replace(
              /vraiment|realmente|truly/gi,
              (m) => `<span style="color:#F5A623">${m}</span>`,
            ),
          }}
        />
        <p className="text-lg font-semibold text-[#F5A623] mb-4">Choisissez le moment de la journée</p>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          {t('landing_hero_desc')}
        </p>
        <Link href="/signup">
          <Button size="lg" className="bg-[#F5A623] hover:bg-[#F5A623]/90 text-white text-lg px-8 py-4 h-auto">
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
              icon: <Music className="h-8 w-8 text-white" />,
              bg:   'bg-[#F5A623]',
              title: t('landing_step1_title'),
              desc:  t('landing_step1_desc'),
            },
            {
              icon: <Upload className="h-8 w-8 text-white" />,
              bg:   'bg-[#7BA05B]',
              title: t('landing_step2_title'),
              desc:  t('landing_step2_desc'),
            },
            {
              icon: <Play className="h-8 w-8 text-white" />,
              bg:   'bg-[#4A6FA5]',
              title: t('landing_step3_title'),
              desc:  t('landing_step3_desc'),
            },
          ].map((step, i) => (
            <Card key={i} className="text-center bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl border border-white/50 hover:-translate-y-1 transition-all duration-200">
              <CardContent className="p-8">
                <div className="flex justify-center mb-4">
                  <div className={`w-16 h-16 rounded-full ${step.bg} flex items-center justify-center shadow-md`}>
                    {step.icon}
                  </div>
                </div>
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
          <Button size="lg" className="bg-[#F5A623] hover:bg-[#F5A623]/90 text-white text-lg px-8 py-4 h-auto">
            {t('landing_create_account')}
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="w-full bg-[#2C3E50] py-10 px-4 mt-12">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-6 text-center">

          {/* Logo + Copyright principal */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-3xl font-bold text-white tracking-wide">
              © 2026 NEUROLOGIS
            </p>
            <p className="text-lg text-[#7BA05B] font-semibold">
              {t('footer_created_by')} Jean Charles Orozco
            </p>
            <p className="text-sm text-gray-400">
              Avignon, France — {t('footer_rights')}
            </p>
          </div>

          {/* Séparateur */}
          <div className="w-24 h-px bg-gray-600" />

          {/* Disclaimer médical */}
          <div className="max-w-2xl">
            <p className="text-sm text-gray-300 leading-relaxed">
              ⚕️ <strong className="text-white">{t('footer_not_medical')}.</strong>{' '}
              {t('disclaimer_text')}
            </p>
          </div>

          {/* Infos légales */}
          <div className="flex flex-col gap-1">
            <p className="text-xs text-gray-500">{t('footer_hosting')}</p>
            <p className="text-xs text-gray-500">{t('footer_not_medical')}</p>
          </div>

          {/* Liens */}
          <div className="flex flex-wrap justify-center gap-4 text-xs text-gray-400">
            <a href="/app/aide" className="hover:text-white transition-colors">
              {t('disclaimer_learn_more')} &amp; FAQ
            </a>
            <span>·</span>
            <a href="mailto:support@neurologis.fr" className="hover:text-white transition-colors">
              support@neurologis.fr
            </a>
            <span>·</span>
            <a href="mailto:privacy@neurologis.fr" className="hover:text-white transition-colors">
              Données personnelles
            </a>
          </div>

        </div>
      </footer>
    </div>
  );
}
