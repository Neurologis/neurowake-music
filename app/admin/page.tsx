'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Edit2, Check, X, Copy, Power, Calendar, Music2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Conseil {
  id: string;
  phase: string;
  langue: string;
  texte: string;
  actif: boolean;
  ordre: number;
}

interface Stats {
  total: number;
  actifs: number;
  trials: number;
  sessions_7j: number;
}

interface SessionCollective {
  id: string;
  nom: string;
  description: string | null;
  code_acces: string;
  playlist_url: string;
  date_expiration: string;
  nb_ecoutes_max: number;
  actif: boolean;
  gamma_enabled: boolean;
  messages_actifs: boolean;
  created_at: string;
  sessions_acces?: Array<{ count: number }>;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PHASES = ['matin', 'soins', 'repas', 'apres-midi', 'coucher'] as const;
const LANGUES = ['fr', 'es', 'en'] as const;
const PHASE_LABELS: Record<string, string> = {
  matin: 'Matin', soins: 'Soins', repas: 'Repas', 'apres-midi': 'Après-midi', coucher: 'Coucher',
};
const LANGUE_LABELS: Record<string, string> = {
  fr: '🇫🇷 Français', es: '🇪🇸 Español', en: '🇬🇧 English',
};

type AdminTab = 'conseils' | 'sessions';

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('conseils');

  // ── Conseils state ──────────────────────────────────────────────────────────
  const [conseils, setConseils] = useState<Conseil[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activePhase, setActivePhase] = useState<string>('matin');
  const [activeLangue, setActiveLangue] = useState<string>('fr');
  const [newTexte, setNewTexte] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTexte, setEditTexte] = useState('');

  // ── Sessions state ──────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionCollective[]>([]);
  const [sessionForm, setSessionForm] = useState({
    nom:             '',
    description:     '',
    playlist_url:    '',
    date_expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    nb_ecoutes_max:  3,
    gamma_enabled:   true,
    messages_actifs: false,
  });
  const [creatingSession, setCreatingSession] = useState(false);
  const [showSessionForm, setShowSessionForm] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [conseilsRes, statsRes, sessionsRes] = await Promise.all([
      fetch('/api/admin/conseils'),
      fetch('/api/admin/stats'),
      fetch('/api/admin/sessions'),
    ]);
    if (conseilsRes.ok) {
      const { conseils: data } = await conseilsRes.json();
      setConseils(data ?? []);
    }
    if (statsRes.ok) setStats(await statsRes.json());
    if (sessionsRes.ok) {
      const { sessions: data } = await sessionsRes.json();
      setSessions(data ?? []);
    }
  }

  // ── Conseils actions ────────────────────────────────────────────────────────

  const filtered = conseils.filter(c => c.phase === activePhase && c.langue === activeLangue);

  async function addConseil() {
    if (!newTexte.trim()) return;
    const res = await fetch('/api/admin/conseils', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: activePhase, langue: activeLangue, texte: newTexte, ordre: filtered.length }),
    });
    if (res.ok) {
      setNewTexte('');
      await loadAll();
      toast({ title: 'Conseil ajouté' });
    }
  }

  async function toggleActif(id: string, actif: boolean) {
    await fetch(`/api/admin/conseils/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actif: !actif }),
    });
    setConseils(c => c.map(x => x.id === id ? { ...x, actif: !actif } : x));
  }

  async function saveEdit(id: string) {
    await fetch(`/api/admin/conseils/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texte: editTexte }),
    });
    setConseils(c => c.map(x => x.id === id ? { ...x, texte: editTexte } : x));
    setEditingId(null);
    toast({ title: 'Conseil mis à jour' });
  }

  async function deleteConseil(id: string) {
    if (!confirm('Supprimer ce conseil ?')) return;
    await fetch(`/api/admin/conseils/${id}`, { method: 'DELETE' });
    setConseils(c => c.filter(x => x.id !== id));
  }

  // ── Sessions actions ────────────────────────────────────────────────────────

  async function createSession() {
    if (!sessionForm.nom.trim() || !sessionForm.playlist_url.trim()) {
      toast({ title: 'Champs requis', description: 'Nom et URL playlist sont obligatoires', variant: 'destructive' });
      return;
    }
    setCreatingSession(true);
    try {
      const res = await fetch('/api/admin/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sessionForm,
          date_expiration: new Date(sessionForm.date_expiration).toISOString(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(s => [data, ...s]);
        setShowSessionForm(false);
        setSessionForm(f => ({ ...f, nom: '', description: '', playlist_url: '' }));
        toast({ title: `✅ Session créée`, description: `Code : ${data.code_acces}` });
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: 'Erreur', description: err.error, variant: 'destructive' });
      }
    } finally {
      setCreatingSession(false);
    }
  }

  async function toggleSession(id: string, actif: boolean) {
    const res = await fetch(`/api/admin/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actif: !actif }),
    });
    if (res.ok) {
      setSessions(s => s.map(x => x.id === id ? { ...x, actif: !actif } : x));
      toast({ title: !actif ? '✅ Session activée' : '⏸ Session désactivée' });
    }
  }

  async function deleteSession(id: string, nom: string) {
    if (!confirm(`Supprimer la session "${nom}" ?`)) return;
    const res = await fetch(`/api/admin/sessions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setSessions(s => s.filter(x => x.id !== id));
      toast({ title: 'Session supprimée' });
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      toast({ title: '📋 Code copié', description: code });
    });
  }

  function formatExpiry(iso: string) {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] p-4 lg:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Administration NeuroWake</h1>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Utilisateurs total', value: stats.total },
              { label: 'Abonnés actifs',     value: stats.actifs },
              { label: 'En essai',           value: stats.trials },
              { label: 'Sessions (7j)',       value: stats.sessions_7j },
            ].map(s => (
              <Card key={s.label} className="bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border border-white/60">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-[#4A6FA5]">{s.value ?? 0}</p>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Tab nav */}
        <div className="flex gap-2">
          {([
            { key: 'conseils',  label: '💡 Conseils' },
            { key: 'sessions',  label: '🎵 Sessions Collectives' },
          ] as const).map(tab => (
            <Button
              key={tab.key}
              size="sm"
              className={`h-10 ${activeTab === tab.key ? 'bg-gradient-to-r from-[#4A6FA5] to-[#6B8EC9] text-white' : 'bg-white border border-gray-200 text-[#2C2C2A]'}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* ── TAB CONSEILS ────────────────────────────────────────────────────── */}
        {activeTab === 'conseils' && (
          <Card className="bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border border-white/60">
            <CardHeader><CardTitle>Gestion des conseils</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Phase tabs */}
              <div className="flex gap-2 flex-wrap">
                {PHASES.map(p => (
                  <Button
                    key={p}
                    size="sm"
                    className={`${activePhase === p ? 'bg-[#4A6FA5] text-white' : 'bg-white border border-gray-200 text-[#2C2C2A]'}`}
                    onClick={() => setActivePhase(p)}
                  >
                    {PHASE_LABELS[p]}
                  </Button>
                ))}
              </div>

              {/* Langue tabs */}
              <div className="flex gap-2">
                {LANGUES.map(l => (
                  <Button
                    key={l}
                    size="sm"
                    className={`${activeLangue === l ? 'bg-[#4A6FA5] text-white' : 'bg-white border border-gray-200 text-[#2C2C2A]'}`}
                    onClick={() => setActiveLangue(l)}
                  >
                    {LANGUE_LABELS[l]}
                  </Button>
                ))}
              </div>

              <p className="text-sm text-muted-foreground">
                {filtered.length} conseil(s) — {PHASE_LABELS[activePhase]} · {LANGUE_LABELS[activeLangue]}
              </p>

              <div className="space-y-3">
                {filtered.map(c => (
                  <div key={c.id} className={`p-3 rounded-lg border ${c.actif ? 'bg-white' : 'bg-gray-50'}`}>
                    {editingId === c.id ? (
                      <div className="space-y-2">
                        <Textarea value={editTexte} onChange={e => setEditTexte(e.target.value)} rows={3} />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit(c.id)}><Check className="h-4 w-4" /></Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <p className={`text-sm flex-1 ${!c.actif ? 'text-muted-foreground' : ''}`}>{c.texte}</p>
                        <div className="flex items-center gap-2">
                          <Switch checked={c.actif} onCheckedChange={() => toggleActif(c.id, c.actif)} />
                          <button onClick={() => { setEditingId(c.id); setEditTexte(c.texte); }} className="text-muted-foreground hover:text-[#4A6FA5]">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => deleteConseil(c.id)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-2 border-t">
                <Textarea value={newTexte} onChange={e => setNewTexte(e.target.value)} placeholder="Texte du nouveau conseil..." rows={3} />
                <Button onClick={addConseil} className="bg-[#4A6FA5] text-white">
                  <Plus className="h-4 w-4 mr-2" /> Ajouter un conseil
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── TAB SESSIONS COLLECTIVES ──────────────────────────────────────── */}
        {activeTab === 'sessions' && (
          <div className="space-y-4">

            {/* Bouton créer */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Music2 className="h-5 w-5 text-[#F5A623]" />
                Sessions Collectives
              </h2>
              <Button
                className="bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white hover:-translate-y-0.5 transition-all"
                onClick={() => setShowSessionForm(!showSessionForm)}
              >
                <Plus className="h-4 w-4 mr-2" /> Créer une session
              </Button>
            </div>

            {/* Formulaire de création */}
            {showSessionForm && (
              <Card className="bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border border-[#F5A623]/30">
                <CardHeader><CardTitle className="text-base">Nouvelle session</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Nom de la session *</label>
                      <Input
                        value={sessionForm.nom}
                        onChange={e => setSessionForm(f => ({ ...f, nom: e.target.value }))}
                        placeholder="Ex: Gamma Cognition Juin 2026"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">URL playlist VPS *</label>
                      <Input
                        value={sessionForm.playlist_url}
                        onChange={e => setSessionForm(f => ({ ...f, playlist_url: e.target.value }))}
                        placeholder="Ex: sessions/gamma-cognition"
                        className="h-11 font-mono text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Description (optionnel)</label>
                    <Textarea
                      value={sessionForm.description}
                      onChange={e => setSessionForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Description courte de la session..."
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium flex items-center gap-1">
                        <Calendar className="h-4 w-4" /> Date d&apos;expiration *
                      </label>
                      <Input
                        type="datetime-local"
                        value={sessionForm.date_expiration}
                        onChange={e => setSessionForm(f => ({ ...f, date_expiration: e.target.value }))}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Écoutes max / utilisateur</label>
                      <Input
                        type="number"
                        min={1} max={100}
                        value={sessionForm.nb_ecoutes_max}
                        onChange={e => setSessionForm(f => ({ ...f, nb_ecoutes_max: parseInt(e.target.value) || 3 }))}
                        className="h-11"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <Switch
                        checked={sessionForm.gamma_enabled}
                        onCheckedChange={v => setSessionForm(f => ({ ...f, gamma_enabled: v }))}
                      />
                      <span className="text-sm font-medium">🧠 40Hz activé par défaut</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <Switch
                        checked={sessionForm.messages_actifs}
                        onCheckedChange={v => setSessionForm(f => ({ ...f, messages_actifs: v }))}
                      />
                      <span className="text-sm font-medium">🎙️ Messages activés</span>
                    </label>
                  </div>

                  <div className="flex gap-3 pt-2 border-t">
                    <Button
                      onClick={createSession}
                      disabled={creatingSession}
                      className="bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white h-11"
                    >
                      {creatingSession ? 'Création…' : <><Plus className="h-4 w-4 mr-2" /> Créer la session</>}
                    </Button>
                    <Button variant="outline" onClick={() => setShowSessionForm(false)} className="h-11">
                      Annuler
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Liste des sessions */}
            {sessions.length === 0 ? (
              <Card className="bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border border-white/60">
                <CardContent className="p-8 text-center text-muted-foreground">
                  Aucune session créée. Cliquez sur &quot;Créer une session&quot; pour commencer.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {sessions.map(session => {
                  const isExpired = new Date(session.date_expiration) < new Date();
                  const nbEcoutes = (session.sessions_acces?.[0] as unknown as { count?: number })?.count ?? 0;
                  return (
                    <Card
                      key={session.id}
                      className={`bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border transition-all ${
                        !session.actif || isExpired ? 'opacity-60 border-gray-200' : 'border-white/60 hover:-translate-y-0.5'
                      }`}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-bold text-base">{session.nom}</span>
                              <Badge
                                className={`text-xs ${
                                  !session.actif ? 'bg-gray-100 text-gray-600' :
                                  isExpired ? 'bg-red-100 text-red-700' :
                                  'bg-green-100 text-green-700'
                                }`}
                              >
                                {!session.actif ? 'Inactif' : isExpired ? 'Expiré' : '● Actif'}
                              </Badge>
                              {session.gamma_enabled && (
                                <Badge className="bg-blue-100 text-blue-700 text-xs">🧠 40Hz</Badge>
                              )}
                            </div>
                            {session.description && (
                              <p className="text-sm text-muted-foreground mb-1">{session.description}</p>
                            )}
                            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">
                                {session.code_acces}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatExpiry(session.date_expiration)}
                              </span>
                              <span>{nbEcoutes} écoute{nbEcoutes > 1 ? 's' : ''}</span>
                              <span className="text-xs text-gray-400 font-mono truncate max-w-[180px]">
                                {session.playlist_url}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 text-sm"
                            onClick={() => copyCode(session.code_acces)}
                          >
                            <Copy className="h-3.5 w-3.5 mr-1.5" /> Copier le code
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={`h-9 text-sm ${session.actif ? 'text-amber-600 border-amber-300 hover:bg-amber-50' : 'text-green-600 border-green-300 hover:bg-green-50'}`}
                            onClick={() => toggleSession(session.id, session.actif)}
                          >
                            <Power className="h-3.5 w-3.5 mr-1.5" />
                            {session.actif ? 'Désactiver' : 'Activer'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9 text-sm text-destructive hover:text-destructive hover:bg-red-50"
                            onClick={() => deleteSession(session.id, session.nom)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Supprimer
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
