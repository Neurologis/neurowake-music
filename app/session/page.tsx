'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Loader2, Music2 } from 'lucide-react';

export default function SessionPage() {
  const router = useRouter();

  const [code,     setCode]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Format code as user types: uppercase, auto-insert dashes
  function handleCodeChange(raw: string) {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const parts = [clean.slice(0, 4), clean.slice(4, 8), clean.slice(8, 12)].filter(Boolean);
    setCode(parts.join('-'));
  }

  async function handleJoin() {
    if (!code.trim()) {
      setError("Veuillez entrer un code d'accès.");
      return;
    }
    setLoading(true);
    setError('');

    try {
      // 1. Try to create account if email+password provided and no session yet
      if (email.trim() && password.trim()) {
        const signupRes = await fetch('/api/auth/signup-quick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password: password.trim() }),
        });
        // Ignore if already exists — will be authenticated via login
        if (!signupRes.ok) {
          // Try to log in instead
          await fetch('/api/auth/login-quick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), password: password.trim() }),
          });
        }
      }

      // 2. Validate the session code
      const res = await fetch('/api/sessions/rejoindre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_acces: code.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'MAX_REACHED') {
          setError("Vous avez atteint le nombre maximum d'écoutes pour cette session.");
        } else {
          setError('Code invalide ou expiré. Vérifiez le code et réessayez.');
        }
        return;
      }

      // 3. Redirect to session player
      router.push(`/session/${data.session.id}/lecteur`);

    } catch {
      setError('Erreur réseau. Vérifiez votre connexion et réessayez.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF8EE] via-[#F7F5F0] to-[#EEF2F9] flex flex-col items-center justify-center p-4">

      {/* Logo */}
      <div className="mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logoappli.png" alt="NeuroWake Music" className="h-28 w-auto mx-auto" />
      </div>

      <div className="w-full max-w-md bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-white/60 overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#F5A623] to-[#E8A856] px-6 py-5 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Music2 className="h-6 w-6 text-white" />
            <h1 className="text-white font-bold text-xl">Session Collective</h1>
          </div>
          <p className="text-white/85 text-sm">
            Rejoignez une session musicale partagée
          </p>
        </div>

        <div className="p-6 space-y-5">

          {/* Code d'accès */}
          <div className="space-y-2">
            <label className="text-base font-semibold text-[#2C2C2A] block">
              Code d&apos;accès
            </label>
            <Input
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="Ex: GAMMA-2026-XK9"
              className="text-center text-lg font-mono tracking-widest h-14 uppercase"
              maxLength={14}
              disabled={loading}
            />
          </div>

          {/* Création de compte optionnelle */}
          <div className="border border-dashed border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-sm text-gray-500 text-center">
              Si vous n&apos;avez pas encore de compte (optionnel)
            </p>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Votre adresse e-mail"
              className="h-12 text-base"
              disabled={loading}
            />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Choisissez un mot de passe"
              className="h-12 text-base"
              disabled={loading}
            />
          </div>

          {/* Erreur */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Bouton rejoindre */}
          <Button
            onClick={handleJoin}
            disabled={loading || !code.trim()}
            className="w-full h-14 text-base font-semibold bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white hover:-translate-y-0.5 transition-all shadow-md"
            size="lg"
          >
            {loading
              ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Vérification…</>
              : <><Music2 className="h-5 w-5 mr-2" /> Rejoindre la session →</>
            }
          </Button>

          {/* Lien connexion */}
          <p className="text-center text-sm text-gray-500">
            Vous avez déjà un compte ?{' '}
            <Link href="/login" className="text-[#4A6FA5] hover:underline font-medium">
              Se connecter
            </Link>
          </p>

        </div>
      </div>

      {/* Lien retour */}
      <p className="mt-6 text-sm text-gray-400">
        <Link href="/" className="hover:text-gray-600 transition-colors">← Retour à l&apos;accueil</Link>
      </p>
    </div>
  );
}
