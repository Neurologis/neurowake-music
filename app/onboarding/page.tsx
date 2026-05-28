'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Send } from 'lucide-react';

type Message = { role: 'user' | 'assistant'; content: string };
type Phase = 'form' | 'chat' | 'summary' | 'generating';

interface ProfileData {
  prenom_proche: string;
  annee_naissance: string;
  ville_jeunesse: string;
  pays_jeunesse: string;
  genres_preferes: string[];
  passions: string[];
  chanson_madeleine: string;
  sensibilite_volume: 'douce' | 'normale' | 'sensible';
  acouphenes: boolean;
  langue: 'fr';
}

// 1920–2010 covers the realistic range for the app's use case
const ANNEES = Array.from({ length: 91 }, (_, i) => (1920 + i).toString()).reverse();

export default function OnboardingPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('form');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [extractedData, setExtractedData] = useState<Partial<ProfileData>>({});
  const [formData, setFormData] = useState({
    prenom_proche: '',
    annee_naissance: '1940',
    ville_jeunesse: '',
    pays_jeunesse: 'France',
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleFormNext() {
    if (!formData.ville_jeunesse || !formData.annee_naissance) {
      toast({ title: 'Informations manquantes', description: 'Veuillez remplir tous les champs obligatoires', variant: 'destructive' });
      return;
    }
    setPhase('chat');
    startChat();
  }

  async function startChat() {
    const annee = parseInt(formData.annee_naissance);
    const bump_debut = annee + 15;
    const bump_fin = annee + 30;

    const welcomeMsg = formData.prenom_proche
      ? `Bonjour ! Je vais vous aider à créer un profil musical pour ${formData.prenom_proche}. Pour commencer, quels types de musique aimait-il/elle dans sa jeunesse (entre ${bump_debut} et ${bump_fin}) ? Variété française, rock, jazz, chanson populaire...`
      : `Bonjour ! Je vais vous aider à créer un profil musical pour votre proche. Pour commencer, quels types de musique aimait-il/elle dans sa jeunesse ? Variété française, rock, jazz, chanson populaire...`;

    setMessages([{ role: 'assistant', content: welcomeMsg }]);
  }

  async function sendMessage() {
    if (!input.trim() || isTyping) return;
    const userMsg = input.trim();
    setInput('');
    const newHistory: Message[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(newHistory);
    setIsTyping(true);

    try {
      console.log('[onboarding] → sending message, history length:', newHistory.length - 1);

      const res = await fetch('/api/onboarding/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, history: newHistory.slice(0, -1), langue: 'fr' }),
      });

      // Always parse body — needed for error details too
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch (parseErr) {
        console.error('[onboarding] Failed to parse API response JSON:', parseErr);
        toast({ title: 'Erreur', description: 'Réponse invalide du serveur. Réessayez.', variant: 'destructive' });
        setMessages(newHistory); // keep chat without an empty bubble
        return;
      }

      console.log('[onboarding] ← API response:', {
        status: res.status,
        ok: res.ok,
        isComplete: data.isComplete,
        responseLength: typeof data.response === 'string' ? data.response.length : 'N/A',
        error: data.error ?? null,
      });

      // Non-2xx: surface the real error, never render an empty bubble
      if (!res.ok) {
        const errMsg = (data.error as string) ?? `Erreur serveur (${res.status})`;
        console.error('[onboarding] API returned error:', res.status, data);
        toast({ title: 'Erreur assistant', description: errMsg, variant: 'destructive' });
        setMessages(newHistory); // keep chat without an empty bubble
        return;
      }

      if (data.isComplete && data.data) {
        setExtractedData(data.data as Partial<ProfileData>);
        setMessages([...newHistory, { role: 'assistant', content: "Parfait ! Voici ce que j'ai retenu. Vérifiez et validez votre profil." }]);
        setPhase('summary');
        return;
      }

      // Normal reply — guard against empty string
      const responseText = typeof data.response === 'string' ? data.response.trim() : '';
      if (!responseText) {
        console.error('[onboarding] Empty or missing response field in:', data);
        toast({ title: 'Erreur', description: "Réponse vide reçue. Réessayez.", variant: 'destructive' });
        setMessages(newHistory); // no empty bubble
        return;
      }

      setMessages([...newHistory, { role: 'assistant', content: responseText }]);
    } catch (err) {
      console.error('[onboarding] Network error:', err);
      toast({ title: 'Erreur réseau', description: "Vérifiez votre connexion et réessayez.", variant: 'destructive' });
      setMessages(newHistory); // no empty bubble
    } finally {
      setIsTyping(false);
    }
  }

  async function completeOnboarding() {
    setPhase('generating');
    const annee = parseInt(formData.annee_naissance);

    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profil: {
            prenom_proche: formData.prenom_proche || null,
            annee_naissance: annee,
            ville_jeunesse: formData.ville_jeunesse,
            pays_jeunesse: formData.pays_jeunesse,
            bump_annee_debut: annee + 15,
            bump_annee_fin: annee + 30,
            ...extractedData,
            langue: 'fr',
            conversation_history: messages,
          },
        }),
      });

      if (res.ok) {
        router.push('/decouverte');
      } else {
        // Read the error body so we can surface the real cause
        const errBody = await res.json().catch(() => ({})) as { error?: string; code?: string; detail?: string };
        console.error('[onboarding/complete] HTTP', res.status, errBody);
        const detail = errBody.detail ?? errBody.error ?? `HTTP ${res.status}`;
        toast({
          title: 'Erreur de sauvegarde',
          description: `Impossible de créer le profil (${detail}). Réessayez ou contactez le support.`,
          variant: 'destructive',
        });
        setPhase('summary');
      }
    } catch (err) {
      console.error('[onboarding/complete] fetch error:', err);
      toast({ title: 'Erreur réseau', description: 'Vérifiez votre connexion et réessayez.', variant: 'destructive' });
      setPhase('summary');
    }
  }

  const progressValue = phase === 'form' ? 20 : phase === 'chat' ? 60 : phase === 'summary' ? 85 : 100;

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-semibold text-[#2C2C2A]">Créons le profil musical</h1>
            <span className="text-sm text-muted-foreground">
              {phase === 'form' ? 'Étape 1/3' : phase === 'chat' ? 'Étape 2/3' : 'Étape 3/3'}
            </span>
          </div>
          <Progress value={progressValue} />
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full p-4">

        {/* PHASE FORM */}
        {phase === 'form' && (
          <Card className="mt-6">
            <CardContent className="p-6 space-y-6">
              <div>
                <Label>Prénom du proche (optionnel)</Label>
                <Input
                  className="mt-2"
                  value={formData.prenom_proche}
                  onChange={(e) => setFormData(p => ({ ...p, prenom_proche: e.target.value }))}
                  placeholder="Ex : Marie, Louis..."
                />
              </div>
              <div>
                <Label>Année de naissance *</Label>
                <Select value={formData.annee_naissance} onValueChange={(v) => setFormData(p => ({ ...p, annee_naissance: v }))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANNEES.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ville ou région de jeunesse *</Label>
                <Input
                  className="mt-2"
                  value={formData.ville_jeunesse}
                  onChange={(e) => setFormData(p => ({ ...p, ville_jeunesse: e.target.value }))}
                  placeholder="Ex : Lyon, Bretagne, Paris..."
                />
              </div>
              <div>
                <Label>Pays de jeunesse</Label>
                <Select value={formData.pays_jeunesse} onValueChange={(v) => setFormData(p => ({ ...p, pays_jeunesse: v }))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['France','Espagne','Belgique','Suisse','Canada','Québec','Maroc','Tunisie','Algérie','Italie','Portugal','Autre'].map(p =>
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleFormNext} className="w-full" size="lg">
                Continuer →
              </Button>
            </CardContent>
          </Card>
        )}

        {/* PHASE CHAT */}
        {phase === 'chat' && (
          <div className="flex flex-col h-[calc(100vh-160px)]">
            <div className="flex-1 overflow-y-auto space-y-4 py-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                    m.role === 'user'
                      ? 'bg-[#4A6FA5] text-white rounded-br-sm'
                      : 'bg-white border rounded-bl-sm text-[#2C2C2A]'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white border rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="loading-dots flex gap-1">
                      <span className="w-2 h-2 bg-[#4A6FA5] rounded-full" />
                      <span className="w-2 h-2 bg-[#4A6FA5] rounded-full" />
                      <span className="w-2 h-2 bg-[#4A6FA5] rounded-full" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="border-t bg-white p-4 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Votre réponse..."
                  disabled={isTyping}
                />
                <Button onClick={sendMessage} disabled={isTyping || !input.trim()} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              {/* Safety-net button: shown after 8+ messages so the user can
                  always proceed even if the automatic JSON trigger fails */}
              {messages.length >= 8 && !isTyping && (
                <button
                  onClick={() => setPhase('summary')}
                  className="w-full text-xs text-[#4A6FA5] underline text-center py-1 hover:opacity-70 transition-opacity"
                >
                  J&apos;ai tout dit → Passer à la validation du profil
                </button>
              )}
            </div>
          </div>
        )}

        {/* PHASE SUMMARY */}
        {phase === 'summary' && (
          <Card className="mt-6">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-xl font-semibold">Récapitulatif du profil</h2>
              {formData.prenom_proche && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Prénom</span>
                  <span className="font-medium">{formData.prenom_proche}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Né(e) en</span>
                <span className="font-medium">{formData.annee_naissance}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Région</span>
                <span className="font-medium">{formData.ville_jeunesse}, {formData.pays_jeunesse}</span>
              </div>
              {extractedData.genres_preferes && extractedData.genres_preferes.length > 0 && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Genres préférés</span>
                  <span className="font-medium text-right">{extractedData.genres_preferes.join(', ')}</span>
                </div>
              )}
              {extractedData.passions && extractedData.passions.length > 0 && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Passions</span>
                  <span className="font-medium text-right">{extractedData.passions.join(', ')}</span>
                </div>
              )}
              <Button onClick={completeOnboarding} className="w-full" size="lg">
                Créer mon profil musical
              </Button>
            </CardContent>
          </Card>
        )}

        {/* PHASE GENERATING */}
        {phase === 'generating' && (
          <div className="mt-20 text-center space-y-6">
            <div className="text-5xl animate-spin">🎵</div>
            <h2 className="text-2xl font-semibold">Génération de votre profil en cours...</h2>
            <p className="text-muted-foreground">Nous recherchons la musique de sa jeunesse (10-30 secondes)</p>
            <Progress value={undefined} className="h-2 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
