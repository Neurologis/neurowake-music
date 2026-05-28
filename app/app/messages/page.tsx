'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Mic, Square, Play, Trash2, Check } from 'lucide-react';

interface Message {
  id: string;
  titre: string;
  texte_source: string;
  phase: string;
  mode_diffusion: string;
  actif: boolean;
  auto_genere: boolean;
  audio_url: string | null;
}

interface VoixStatus {
  hasVoice: boolean;
  status: 'pending' | 'ready' | 'error' | null;
}

const PHASES = [
  { value: 'matin', label: 'Matin', color: 'morning' as const },
  { value: 'soins', label: 'Soins', color: 'care' as const },
  { value: 'repas', label: 'Repas', color: 'meal' as const },
  { value: 'apres-midi', label: 'Après-midi', color: 'afternoon' as const },
  { value: 'coucher', label: 'Coucher', color: 'bedtime' as const },
  { value: 'toutes', label: 'Toutes', color: 'all' as const },
];

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [voixStatus, setVoixStatus] = useState<VoixStatus>({ hasVoice: false, status: null });
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Form state
  const [newMsg, setNewMsg] = useState({
    titre: '',
    texte: '',
    phase: 'matin',
    mode_diffusion: 'ouverture',
  });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [msgRes, voixRes] = await Promise.all([
      fetch('/api/messages'),
      fetch('/api/voix/status'),
    ]);
    if (msgRes.ok) {
      const { messages: data } = await msgRes.json();
      setMessages(data ?? []);
    }
    if (voixRes.ok) {
      setVoixStatus(await voixRes.json());
    }
    setLoading(false);
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      setRecordedBlob(blob);
      stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function submitVoice() {
    if (!recordedBlob) return;
    setCloning(true);
    const fd = new FormData();
    fd.append('audio', recordedBlob, 'voice.webm');

    const res = await fetch('/api/voix/clone', { method: 'POST', body: fd });
    if (res.ok) {
      setVoixStatus({ hasVoice: true, status: 'ready' });
      toast({ title: 'Voix clonée !', description: 'Vos messages seront lus avec votre voix.' });
      setRecordedBlob(null);
      // Auto-generate 5 messages
      await fetch('/api/messages/generer-auto', { method: 'POST' });
      await loadAll();
    } else {
      toast({ title: 'Erreur', description: 'Le clonage a échoué', variant: 'destructive' });
    }
    setCloning(false);
  }

  async function genererMessage() {
    if (!newMsg.titre || !newMsg.texte) {
      toast({ title: 'Champs manquants', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    const res = await fetch('/api/messages/generer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMsg),
    });
    if (res.ok) {
      setNewMsg({ titre: '', texte: '', phase: 'matin', mode_diffusion: 'ouverture' });
      await loadAll();
      toast({ title: 'Message créé !', description: 'Le message audio a été généré.' });
    } else {
      const err = await res.json();
      toast({ title: 'Erreur', description: err.error, variant: 'destructive' });
    }
    setGenerating(false);
  }

  async function activerMessage(id: string) {
    await fetch(`/api/messages/${id}/activer`, { method: 'POST' });
    await loadAll();
  }

  async function supprimerMessage(id: string) {
    if (!confirm('Supprimer ce message ?')) return;
    await fetch(`/api/messages/${id}`, { method: 'DELETE' });
    setMessages(m => m.filter(x => x.id !== id));
  }

  const phaseLabel = (p: string) => PHASES.find(x => x.value === p)?.label ?? p;
  const phaseColor = (p: string) => PHASES.find(x => x.value === p)?.color ?? 'all';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#2C2C2A]">Mes messages</h1>
        <div className="flex items-center gap-3 mt-2">
          <Progress value={(messages.length / 20) * 100} className="w-32" />
          <span className="text-sm text-muted-foreground">{messages.length}/20 messages créés</span>
        </div>
      </div>

      {/* Section clone de voix */}
      {!voixStatus.hasVoice || voixStatus.status !== 'ready' ? (
        <Card className="border-[#4A6FA5] bg-[#4A6FA5]/5">
          <CardHeader>
            <CardTitle className="text-[#4A6FA5]">Enregistrez votre voix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Parlez pendant 30 à 60 secondes. Lisez un texte naturellement, comme si vous parliez à votre proche.
            </p>
            {cloning ? (
              <div className="text-center py-4">
                <Progress value={undefined} className="animate-pulse mb-2" />
                <p className="text-sm text-muted-foreground">Clonage en cours... (30-60 secondes)</p>
              </div>
            ) : recordedBlob ? (
              <div className="space-y-3">
                <audio src={URL.createObjectURL(recordedBlob)} controls className="w-full" />
                <div className="flex gap-2">
                  <Button onClick={submitVoice} className="bg-[#4A6FA5]">Utiliser cet enregistrement</Button>
                  <Button variant="outline" onClick={() => setRecordedBlob(null)}>Recommencer</Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={recording ? stopRecording : startRecording}
                variant={recording ? 'destructive' : 'default'}
                className={recording ? '' : 'bg-[#4A6FA5]'}
              >
                {recording ? <><Square className="h-4 w-4 mr-2" /> Arrêter</> : <><Mic className="h-4 w-4 mr-2" /> Enregistrer ma voix</>}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Badge className="bg-[#7BA05B] text-white">✓ Votre voix est prête</Badge>
      )}

      {/* Mode de diffusion */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="font-medium">Mode de diffusion</p>
          {[
            { value: 'ouverture', label: 'Avant la musique', desc: 'Le message est joué au début de chaque session' },
            { value: 'cloture', label: 'Ouverture + clôture', desc: 'Message au début et à la fin' },
            { value: 'rotation', label: 'Entre les chansons', desc: 'Intercalé entre les titres' },
          ].map((mode) => (
            <label key={mode.value} className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="mode_diffusion"
                value={mode.value}
                checked={newMsg.mode_diffusion === mode.value}
                onChange={() => setNewMsg(m => ({ ...m, mode_diffusion: mode.value }))}
                className="mt-1"
              />
              <div>
                <p className="font-medium text-sm">{mode.label}</p>
                <p className="text-xs text-muted-foreground">{mode.desc}</p>
              </div>
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Créer un message */}
      {voixStatus.status === 'ready' && messages.length < 20 && (
        <Card>
          <CardHeader><CardTitle>Créer un message</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Titre du message</Label>
              <Input
                className="mt-2"
                value={newMsg.titre}
                onChange={(e) => setNewMsg(m => ({ ...m, titre: e.target.value }))}
                placeholder="Ex: Bonjour du matin..."
              />
            </div>
            <div>
              <Label>Phase</Label>
              <Select value={newMsg.phase} onValueChange={(v) => setNewMsg(m => ({ ...m, phase: v }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHASES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <Label>Texte du message</Label>
                <span className="text-xs text-muted-foreground">{newMsg.texte.length}/500</span>
              </div>
              <Textarea
                value={newMsg.texte}
                onChange={(e) => setNewMsg(m => ({ ...m, texte: e.target.value.slice(0, 500) }))}
                placeholder="Ex: Bonjour Marie, c'est une belle journée qui commence. Voici ta musique préférée..."
                rows={4}
              />
            </div>
            <Button onClick={genererMessage} disabled={generating} className="w-full bg-[#4A6FA5]">
              {generating ? 'Génération audio...' : 'Sauvegarder'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Liste des messages */}
      <div className="space-y-3">
        {messages.map((msg) => (
          <Card key={msg.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={phaseColor(msg.phase)}>{phaseLabel(msg.phase)}</Badge>
                    {msg.auto_genere && <Badge variant="secondary">Auto-généré</Badge>}
                    {msg.actif && <Badge className="bg-[#7BA05B] text-white">Actif</Badge>}
                  </div>
                  <p className="font-semibold">{msg.titre}</p>
                  <p className="text-sm text-muted-foreground line-clamp-2">{msg.texte_source}</p>
                  {msg.audio_url && (
                    <audio src={msg.audio_url} controls className="mt-2 w-full h-8" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {!msg.actif && (
                    <Button size="sm" variant="outline" onClick={() => activerMessage(msg.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => supprimerMessage(msg.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
