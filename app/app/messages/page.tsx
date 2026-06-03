'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import {
  Mic, Square, Trash2, Pin, X, CheckCircle2, Lightbulb, Info, Pencil, Check,
} from 'lucide-react';
import { useT } from '@/hooks/use-t';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Affectation {
  id: string;
  type_affectation: 'playlist_phase' | 'titre_specifique';
  position: 'debut' | 'fin';
  phase: string | null;
  titre_id: string | null;
}

interface Message {
  id: string;
  titre: string;
  texte_source: string;
  phase: string;
  actif: boolean;
  auto_genere: boolean;
  audio_url: string | null;
  affectations: Affectation[];
}

interface TitreAudio {
  id: string;
  titre: string;
  artiste: string;
}

interface VoixStatus {
  hasVoice: boolean;
  status: 'pending' | 'ready' | 'error' | null;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const PHASES = [
  { value: 'matin',      label: '🌅 Matin',      className: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'soins',      label: '🕊️ Soins',      className: 'bg-sky-100 text-sky-800 border-sky-200' },
  { value: 'repas',      label: '🍽️ Repas',      className: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'apres-midi', label: '🌤️ Après-midi', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'coucher',    label: '🌙 Coucher',    className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { value: 'toutes',     label: '🎵 Toutes',     className: 'bg-gray-100 text-gray-700 border-gray-200' },
];

const phaseLabel = (v: string) => PHASES.find(p => p.value === v)?.label ?? v;
const phaseClass = (v: string) => PHASES.find(p => p.value === v)?.className ?? '';

// ── Composant principal ───────────────────────────────────────────────────────

export default function MessagesPage() {
  const { t } = useT();

  // Data
  const [messages, setMessages]     = useState<Message[]>([]);
  const [titres, setTitres]         = useState<TitreAudio[]>([]);
  const [voixStatus, setVoixStatus] = useState<VoixStatus>({ hasVoice: false, status: null });
  const [loading, setLoading]       = useState(true);

  // Recording
  const [recording, setRecording]   = useState(false);
  const [cloning, setCloning]       = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);

  // Create form
  const [newMsg, setNewMsg] = useState({ titre: '', texte: '', phase: 'matin' });
  const [generating, setGenerating] = useState(false);

  // Edit inline
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editForm,    setEditForm]    = useState({ titre: '', texte: '' });
  const [savingEdit,  setSavingEdit]  = useState(false);

  // Modal d'affectation
  const [modalMsgId,        setModalMsgId]        = useState<string | null>(null);
  const [modalType,         setModalType]         = useState<'playlist_phase' | 'titre_specifique'>('playlist_phase');
  const [modalPosition,     setModalPosition]     = useState<'debut' | 'fin'>('debut');
  const [modalPhase,        setModalPhase]        = useState('matin');
  const [modalTitreId,      setModalTitreId]      = useState('');
  const [savingAffectation, setSavingAffectation] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [msgRes, voixRes, titresRes] = await Promise.all([
      fetch('/api/messages'),
      fetch('/api/voix/status'),
      fetch('/api/titres'),
    ]);
    if (msgRes.ok)    { const { messages: d } = await msgRes.json();  setMessages(d ?? []); }
    if (voixRes.ok)   { setVoixStatus(await voixRes.json()); }
    if (titresRes.ok) { const { titres: d } = await titresRes.json(); setTitres(d ?? []); }
    setLoading(false);
  }

  // ── Enregistrement ─────────────────────────────────────────────────────────

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast({ title: t('error_title'), description: 'Enregistrement audio : HTTPS + navigateur compatible requis.', variant: 'destructive' });
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        setRecordedBlob(new Blob(chunksRef.current, { type: 'audio/webm' }));
        stream.getTracks().forEach(tr => tr.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        toast({ title: t('mic_denied'), description: t('mic_denied_desc'), variant: 'destructive' });
      } else if (name === 'NotFoundError') {
        toast({ title: t('mic_not_found'), description: t('mic_not_found_desc'), variant: 'destructive' });
      } else {
        toast({ title: t('error_title'), description: t('error_generic'), variant: 'destructive' });
      }
    }
  }

  function stopRecording() { mediaRecorderRef.current?.stop(); setRecording(false); }

  async function submitVoice() {
    if (!recordedBlob) return;
    setCloning(true);
    const fd = new FormData();
    fd.append('audio', recordedBlob, 'voice.webm');
    const res = await fetch('/api/voix/clone', { method: 'POST', body: fd });
    if (res.ok) {
      setVoixStatus({ hasVoice: true, status: 'ready' });
      toast({ title: t('voice_cloned_toast'), description: t('voice_cloned_desc') });
      setRecordedBlob(null);
      await fetch('/api/messages/generer-auto', { method: 'POST' });
      await loadAll();
    } else {
      const err = await res.json().catch(() => ({}));
      toast({
        title: err.code === 'ELEVENLABS_NOT_CONFIGURED' ? 'Fonctionnalité non disponible' : 'Erreur de clonage',
        description: err.code === 'ELEVENLABS_NOT_CONFIGURED'
          ? 'Le clonage de voix nécessite une clé API ElevenLabs.'
          : (err.error ?? 'Le clonage a échoué'),
        variant: 'destructive',
      });
    }
    setCloning(false);
  }

  // ── Créer un message ────────────────────────────────────────────────────────

  async function genererMessage() {
    if (!newMsg.titre || !newMsg.texte) {
      toast({ title: t('missing_fields_toast'), variant: 'destructive' });
      return;
    }
    setGenerating(true);
    const res = await fetch('/api/messages/generer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titre: newMsg.titre, texte: newMsg.texte, phase: newMsg.phase, mode_diffusion: 'ouverture' }),
    });
    if (res.ok) {
      setNewMsg({ titre: '', texte: '', phase: 'matin' });
      await loadAll();
      toast({ title: t('message_created_toast'), description: t('message_created_desc') });
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: 'Erreur', description: err.error ?? t('error_generic'), variant: 'destructive' });
    }
    setGenerating(false);
  }

  // ── Modifier un message ─────────────────────────────────────────────────────

  function startEdit(msg: Message) {
    setEditingId(msg.id);
    setEditForm({ titre: msg.titre, texte: msg.texte_source });
  }

  function cancelEdit() { setEditingId(null); }

  async function saveEdit(msg: Message) {
    setSavingEdit(true);
    const textChanged = editForm.texte !== msg.texte_source;
    const res = await fetch(`/api/messages/${msg.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titre:            editForm.titre,
        texte_source:     editForm.texte,
        regenerate_audio: textChanged,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setMessages(prev => prev.map(m => m.id === msg.id
        ? { ...m, titre: updated.titre, texte_source: updated.texte_source, audio_url: updated.audio_url ?? m.audio_url }
        : m
      ));
      setEditingId(null);
      toast({ title: '✅ Message mis à jour', description: textChanged ? 'Audio régénéré.' : '' });
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: 'Erreur', description: err.error ?? t('error_generic'), variant: 'destructive' });
    }
    setSavingEdit(false);
  }

  // ── Supprimer ───────────────────────────────────────────────────────────────

  async function supprimerMessage(id: string) {
    if (!confirm(t('delete_message_confirm'))) return;
    await fetch(`/api/messages/${id}`, { method: 'DELETE' });
    setMessages(m => m.filter(x => x.id !== id));
  }

  // ── Modal d'affectation ─────────────────────────────────────────────────────

  function openModal(msgId: string) {
    const msg = messages.find(m => m.id === msgId);
    setModalMsgId(msgId);
    setModalType('playlist_phase');
    setModalPosition('debut');
    setModalPhase(msg?.phase && msg.phase !== 'toutes' ? msg.phase : 'matin');
    setModalTitreId(titres[0]?.id ?? '');
  }

  async function saveAffectation() {
    if (!modalMsgId) return;
    setSavingAffectation(true);
    const res = await fetch('/api/messages/affecter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_id:       modalMsgId,
        type_affectation: modalType,
        position:         modalPosition,
        phase:            modalType === 'playlist_phase' ? modalPhase : null,
        titre_id:         modalType === 'titre_specifique' ? (modalTitreId || null) : null,
      }),
    });
    if (res.ok) {
      toast({ title: '✅ Affectation enregistrée' });
      setModalMsgId(null);
      await loadAll();
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: 'Erreur', description: err.detail ?? err.error ?? t('error_generic'), variant: 'destructive' });
    }
    setSavingAffectation(false);
  }

  async function deleteAffectation(affectationId: string) {
    await fetch('/api/messages/affecter', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ affectation_id: affectationId }),
    });
    await loadAll();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <div className="py-12 text-center text-muted-foreground">{t('loading')}</div>;

  return (
    <div className="space-y-6">

      {/* En-tête + compteur */}
      <div>
        <h1 className="text-2xl font-bold text-[#2C2C2A]">{t('messages_title')}</h1>
        <div className="flex items-center gap-3 mt-2">
          <Progress value={(messages.length / 20) * 100} className="w-32" />
          <span className="text-sm text-muted-foreground">{messages.length}/20 {t('messages_count')}</span>
        </div>
      </div>

      {/* ── Bandeau explicatif ─────────────────────────────────────────────── */}
      <div className="bg-[#4A6FA5]/5 border border-[#4A6FA5]/20 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-[#4A6FA5]">
          <Lightbulb className="h-4 w-4 flex-shrink-0" />
          <span>{t('msg_how_it_works')}</span>
        </div>
        <ol className="text-sm text-[#2C2C2A] space-y-1 pl-2">
          <li><span className="font-medium text-[#4A6FA5]">1.</span> {t('msg_step1')}</li>
          <li><span className="font-medium text-[#4A6FA5]">2.</span> {t('msg_step2')}</li>
          <li><span className="font-medium text-[#4A6FA5]">3.</span> {t('msg_step3')}</li>
        </ol>
        <p className="text-xs text-muted-foreground flex items-start gap-1 pt-1">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
          Le message jouera automatiquement avant ou après la musique choisie.
        </p>
      </div>

      {/* ── Enregistrement de voix ─────────────────────────────────────────── */}
      {(!voixStatus.hasVoice || voixStatus.status !== 'ready') ? (
        <Card className="bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl border border-[#4A6FA5]/30">
          <CardHeader>
            <CardTitle className="text-[#4A6FA5] text-lg">{t('record_voice_title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-base text-muted-foreground">{t('recording_hint')}</p>
            {cloning ? (
              <div className="text-center py-4">
                <Progress value={undefined} className="animate-pulse mb-2" />
                <p className="text-base text-muted-foreground">{t('cloning_label')}</p>
              </div>
            ) : recordedBlob ? (
              <div className="space-y-3">
                <audio src={URL.createObjectURL(recordedBlob)} controls className="w-full" />
                <div className="flex gap-2">
                  <Button onClick={submitVoice} className="bg-[#4A6FA5] text-base h-11">{t('use_recording_btn')}</Button>
                  <Button variant="outline" className="text-base h-11" onClick={() => setRecordedBlob(null)}>{t('restart_recording_btn')}</Button>
                </div>
              </div>
            ) : recording ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                  <span className="text-red-700 text-base font-medium">{t('recording_label')}</span>
                </div>
                <Button onClick={stopRecording} variant="destructive" className="w-full text-base h-11">
                  <Square className="h-4 w-4 mr-2" /> {t('stop_recording_btn')}
                </Button>
              </div>
            ) : (
              <Button onClick={startRecording} className="bg-[#4A6FA5] text-base h-11">
                <Mic className="h-4 w-4 mr-2" /> {t('record_voice_btn')}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-[#7BA05B]" />
          <span className="text-base font-medium text-[#7BA05B]">{t('voice_ready_badge')}</span>
        </div>
      )}

      {/* ── Créer un message ──────────────────────────────────────────────── */}
      {voixStatus.status === 'ready' && messages.length < 20 && (
        <Card className="bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border border-white/60 hover:-translate-y-1 transition-all duration-200">
          <CardHeader><CardTitle className="text-lg">{t('create_message_title')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-base">{t('msg_title_label')}</Label>
              <Input
                className="mt-2 text-base h-11"
                value={newMsg.titre}
                onChange={e => setNewMsg(m => ({ ...m, titre: e.target.value }))}
                placeholder="Ex: Bonjour du matin..."
              />
            </div>
            <div>
              <Label className="text-base">{t('msg_phase_label')}</Label>
              <Select value={newMsg.phase} onValueChange={v => setNewMsg(m => ({ ...m, phase: v }))}>
                <SelectTrigger className="mt-2 text-base h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PHASES.map(p => <SelectItem key={p.value} value={p.value} className="text-base">{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <Label className="text-base">{t('msg_text_label')}</Label>
                <span className="text-sm text-muted-foreground">{newMsg.texte.length}/500</span>
              </div>
              <Textarea
                value={newMsg.texte}
                onChange={e => setNewMsg(m => ({ ...m, texte: e.target.value.slice(0, 500) }))}
                placeholder="Ex: Bonjour Marie, voici ta musique préférée…"
                rows={4}
                className="text-base"
              />
            </div>
            <Button onClick={genererMessage} disabled={generating} className="w-full bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white text-base h-11 hover:-translate-y-0.5 transition-all">
              {generating ? t('generating_label') : t('save_message_btn')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Mes messages ─────────────────────────────────────────────────── */}
      {messages.length === 0 ? (
        <p className="text-muted-foreground text-sm py-4 text-center">
          Aucun message créé. Enregistrez votre voix pour commencer.
        </p>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <Card key={msg.id} className="bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border border-white/60 hover:-translate-y-1 transition-all duration-200 hover:-translate-y-0.5 transition-all duration-200">
              <CardContent className="p-4 space-y-3">

                {/* En-tête */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <Badge variant="outline" className={`text-xs ${phaseClass(msg.phase)}`}>
                        {phaseLabel(msg.phase)}
                      </Badge>
                      {msg.auto_genere && (
                        <Badge variant="secondary" className="text-xs">{t('auto_generated_badge')}</Badge>
                      )}
                    </div>

                    {/* Formulaire d'édition inline ou affichage normal */}
                    {editingId === msg.id ? (
                      <div className="space-y-2 mt-1">
                        <Input
                          value={editForm.titre}
                          onChange={e => setEditForm(f => ({ ...f, titre: e.target.value }))}
                          className="text-base h-9"
                          placeholder={t('msg_title_label')}
                        />
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-xs text-muted-foreground">{t('msg_text_label')}</span>
                            <span className="text-xs text-muted-foreground">{editForm.texte.length}/500</span>
                          </div>
                          <Textarea
                            value={editForm.texte}
                            onChange={e => setEditForm(f => ({ ...f, texte: e.target.value.slice(0, 500) }))}
                            rows={3}
                            className="text-sm"
                          />
                        </div>
                        {editForm.texte !== msg.texte_source && (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            Le texte a été modifié — l&apos;audio sera régénéré à la sauvegarde.
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm" className="bg-[#7BA05B] text-white text-sm"
                            onClick={() => saveEdit(msg)}
                            disabled={savingEdit || !editForm.titre.trim() || !editForm.texte.trim()}
                          >
                            {savingEdit ? t('saving_label') : <><Check className="h-3.5 w-3.5 mr-1" />Sauvegarder</>}
                          </Button>
                          <Button size="sm" variant="outline" className="text-sm" onClick={cancelEdit}>
                            {t('cancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="font-semibold text-base">{msg.titre}</p>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{msg.texte_source}</p>
                      </>
                    )}
                  </div>

                  {editingId !== msg.id && (
                    <Button
                      size="sm" variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-red-50 shrink-0 mt-0.5"
                      onClick={() => supprimerMessage(msg.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Player audio (masqué en mode édition) */}
                {msg.audio_url && editingId !== msg.id && (
                  <audio src={msg.audio_url} controls className="w-full h-8" />
                )}

                {/* Affectations actuelles */}
                {editingId !== msg.id && msg.affectations && msg.affectations.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Affectations</p>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.affectations.map((aff) => {
                        const label = aff.type_affectation === 'playlist_phase'
                          ? `📋 Playlist ${phaseLabel(aff.phase ?? '')} — ${aff.position === 'debut' ? t('msg_position_debut') : t('msg_position_fin')}`
                          : `🎵 ${titres.find(tr => tr.id === aff.titre_id)?.titre ?? 'Titre'} — ${aff.position === 'debut' ? t('msg_position_debut') : t('msg_position_fin')}`;
                        return (
                          <span
                            key={aff.id}
                            className="inline-flex items-center gap-1 text-xs bg-[#4A6FA5]/10 text-[#4A6FA5] border border-[#4A6FA5]/20 rounded-full px-2 py-0.5"
                          >
                            {label}
                            <button
                              onClick={() => deleteAffectation(aff.id)}
                              className="hover:opacity-60 ml-0.5"
                              title="Supprimer cette affectation"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Actions (masquées en mode édition) */}
                {editingId !== msg.id && (
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <Button
                      variant="outline" className="w-full sm:w-auto h-12 text-base"
                      onClick={() => startEdit(msg)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Modifier
                    </Button>
                    <Button
                      className="w-full sm:w-auto h-12 text-base bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white hover:-translate-y-0.5 transition-all"
                      onClick={() => openModal(msg.id)}
                    >
                      <Pin className="h-3.5 w-3.5 mr-1.5" />
                      {t('msg_affect_btn')}
                    </Button>
                  </div>
                )}

              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Modal d'affectation ───────────────────────────────────────────── */}
      {modalMsgId && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setModalMsgId(null); }}
        >
          <div className="bg-white rounded-2xl w-full max-w-md mx-4 sm:mx-0 p-5 space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#2C2C2A]">Où diffuser ce message ?</h2>
              <button onClick={() => setModalMsgId(null)} className="text-muted-foreground hover:text-[#2C2C2A]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {[
              { value: 'playlist_phase' as const, label: t('msg_affect_playlist'), icon: '📋' },
              { value: 'titre_specifique' as const, label: t('msg_affect_titre'), icon: '🎵' },
            ].map(opt => (
              <label
                key={opt.value}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  modalType === opt.value ? 'border-[#4A6FA5] bg-[#4A6FA5]/5' : 'border-[#EDEAE3] hover:border-[#4A6FA5]/30'
                }`}
              >
                <input type="radio" name="modal_type" value={opt.value} checked={modalType === opt.value}
                  onChange={() => setModalType(opt.value)} className="sr-only" />
                <span className="text-xl">{opt.icon}</span>
                <span className="font-medium text-base">{opt.label}</span>
              </label>
            ))}

            {modalType === 'playlist_phase' ? (
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Playlist</Label>
                <Select value={modalPhase} onValueChange={setModalPhase}>
                  <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PHASES.filter(p => p.value !== 'toutes').map(p => (
                      <SelectItem key={p.value} value={p.value} className="text-base">{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Titre musical</Label>
                {titres.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun titre — ajoutez d&apos;abord des titres dans &quot;Mes titres&quot;.</p>
                ) : (
                  <Select value={modalTitreId} onValueChange={setModalTitreId}>
                    <SelectTrigger className="h-10 text-base"><SelectValue placeholder="Choisir un titre…" /></SelectTrigger>
                    <SelectContent>
                      {titres.map(tr => (
                        <SelectItem key={tr.id} value={tr.id} className="text-base">{tr.titre} — {tr.artiste}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div>
              <Label className="text-sm font-medium mb-1.5 block">Position</Label>
              <div className="flex gap-2">
                {[{ value: 'debut' as const, label: t('msg_position_debut') }, { value: 'fin' as const, label: t('msg_position_fin') }].map(pos => (
                  <button key={pos.value} onClick={() => setModalPosition(pos.value)}
                    className={`flex-1 py-2 rounded-lg border-2 text-base font-medium transition-colors ${
                      modalPosition === pos.value ? 'bg-[#4A6FA5] text-white border-[#4A6FA5]' : 'border-[#EDEAE3] text-[#2C2C2A] hover:border-[#4A6FA5]/40'
                    }`}>
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1 h-12 text-base" onClick={() => setModalMsgId(null)}>{t('cancel')}</Button>
              <Button className="flex-1 h-12 text-base bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white" onClick={saveAffectation}
                disabled={savingAffectation || (modalType === 'titre_specifique' && !modalTitreId)}>
                {savingAffectation ? t('saving_label') : '✅ Confirmer l\'affectation'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
