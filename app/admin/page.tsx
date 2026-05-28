'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';

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

const PHASES = ['matin', 'soins', 'repas', 'apres-midi', 'coucher'] as const;
const LANGUES = ['fr', 'es', 'en'] as const;
const PHASE_LABELS: Record<string, string> = { matin: 'Matin', soins: 'Soins', repas: 'Repas', 'apres-midi': 'Après-midi', coucher: 'Coucher' };
const LANGUE_LABELS: Record<string, string> = { fr: '🇫🇷 Français', es: '🇪🇸 Español', en: '🇬🇧 English' };

export default function AdminPage() {
  const [conseils, setConseils] = useState<Conseil[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activePhase, setActivePhase] = useState<string>('matin');
  const [activeLangue, setActiveLangue] = useState<string>('fr');
  const [newTexte, setNewTexte] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTexte, setEditTexte] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [conseilsRes, statsRes] = await Promise.all([
      fetch('/api/admin/conseils'),
      fetch('/api/admin/stats'),
    ]);
    if (conseilsRes.ok) {
      const { conseils: data } = await conseilsRes.json();
      setConseils(data ?? []);
    }
    if (statsRes.ok) setStats(await statsRes.json());
  }

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

  return (
    <div className="min-h-screen bg-[#F7F5F0] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Administration NeuroWake</h1>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Utilisateurs total', value: stats.total },
              { label: 'Abonnés actifs', value: stats.actifs },
              { label: 'En essai', value: stats.trials },
              { label: 'Sessions (7j)', value: stats.sessions_7j },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-[#4A6FA5]">{s.value ?? 0}</p>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Conseils */}
        <Card>
          <CardHeader><CardTitle>Gestion des conseils</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Phase tabs */}
            <div className="flex gap-2 flex-wrap">
              {PHASES.map(p => (
                <Button
                  key={p}
                  size="sm"
                  variant={activePhase === p ? 'default' : 'outline'}
                  className={activePhase === p ? 'bg-[#4A6FA5]' : ''}
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
                  variant={activeLangue === l ? 'default' : 'outline'}
                  className={activeLangue === l ? 'bg-[#4A6FA5]' : ''}
                  onClick={() => setActiveLangue(l)}
                >
                  {LANGUE_LABELS[l]}
                </Button>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">{filtered.length} conseil(s) pour {PHASE_LABELS[activePhase]} · {LANGUE_LABELS[activeLangue]}</p>

            {/* Liste */}
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

            {/* Ajouter */}
            <div className="space-y-2 pt-2 border-t">
              <Textarea
                value={newTexte}
                onChange={e => setNewTexte(e.target.value)}
                placeholder="Texte du nouveau conseil..."
                rows={3}
              />
              <Button onClick={addConseil} className="bg-[#4A6FA5]">
                <Plus className="h-4 w-4 mr-2" /> Ajouter un conseil
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
