'use client';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Upload, Play, Trash2, MoreHorizontal, RefreshCw, Infinity } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

interface Titre {
  id: string;
  titre: string;
  artiste: string;
  annee: number | null;
  duree_secondes: number | null;
  repetitions: number;
  boucle_infinie: boolean;
  note_aidant: string | null;
  dans_playlist_favorite: boolean;
  ordre: number;
}

const REP_OPTIONS = [
  { label: '1×', value: 1, loop: false },
  { label: '2×', value: 2, loop: false },
  { label: '3×', value: 3, loop: false },
  { label: '5×', value: 5, loop: false },
  { label: '10×', value: 10, loop: false },
  { label: '∞', value: 1, loop: true },
];

export default function TitresPage() {
  const [titres, setTitres] = useState<Titre[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [showReps, setShowReps] = useState<string | null>(null);

  const loadTitres = useCallback(async () => {
    const url = search ? `/api/titres?q=${encodeURIComponent(search)}` : '/api/titres';
    const res = await fetch(url);
    if (res.ok) {
      const { titres: data } = await res.json();
      setTitres(data ?? []);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { loadTitres(); }, [loadTitres]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/audio/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        toast({ title: 'Erreur', description: `Impossible d'importer ${file.name}`, variant: 'destructive' });
      }
    }
    await loadTitres();
    toast({ title: 'Import réussi', description: `${files.length} fichier(s) ajouté(s)` });
    setUploading(false);
  }

  async function updateTitre(id: string, updates: Partial<Titre>) {
    setTitres(t => t.map(x => x.id === id ? { ...x, ...updates } : x));
    await fetch(`/api/titres/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  }

  async function deleteTitre(id: string) {
    if (!confirm('Supprimer ce titre ?')) return;
    setTitres(t => t.filter(x => x.id !== id));
    await fetch(`/api/titres/${id}`, { method: 'DELETE' });
    toast({ title: 'Titre supprimé' });
  }

  async function saveNote(id: string) {
    await updateTitre(id, { note_aidant: editNotes[id] });
    setEditNotes(n => { const copy = { ...n }; delete copy[id]; return copy; });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#2C2C2A]">Mes titres</h1>
          <p className="text-muted-foreground text-sm">{titres.length} titre(s) importé(s)</p>
        </div>
        <Button
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'audio/*';
            input.multiple = true;
            input.onchange = (e) => handleUpload((e.target as HTMLInputElement).files);
            input.click();
          }}
          disabled={uploading}
          className="bg-[#4A6FA5]"
        >
          <Upload className="h-4 w-4 mr-2" />
          {uploading ? 'Import...' : 'Ajouter'}
        </Button>
      </div>

      {/* Recherche */}
      <Input
        placeholder="Rechercher dans mes titres..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Zone drag & drop */}
      <div
        className="border-2 border-dashed border-[#EDEAE3] rounded-xl p-8 text-center cursor-pointer hover:border-[#4A6FA5] transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleUpload(e.dataTransfer.files);
        }}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'audio/*';
          input.multiple = true;
          input.onchange = (e) => handleUpload((e.target as HTMLInputElement).files);
          input.click();
        }}
      >
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground">Glissez vos fichiers audio ici ou cliquez pour sélectionner</p>
        <p className="text-xs text-muted-foreground mt-1">MP3, WAV, FLAC, M4A acceptés — max 50MB par fichier</p>
      </div>

      {/* Liste des titres */}
      {loading ? (
        <p className="text-center text-muted-foreground py-8">Chargement...</p>
      ) : titres.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Aucun titre importé. Glissez vos fichiers audio ci-dessus.</p>
      ) : (
        <div className="space-y-3">
          {titres.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-[#EDEAE3] rounded-lg flex items-center justify-center flex-shrink-0 text-xl">🎵</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{t.titre}</p>
                        <p className="text-sm text-muted-foreground">{t.artiste}{t.annee ? ` · ${t.annee}` : ''}{t.duree_secondes ? ` · ${formatDuration(t.duree_secondes)}` : ''}</p>
                      </div>
                      <button onClick={() => deleteTitre(t.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Options */}
                    <div className="flex flex-wrap items-center gap-4 mt-3">
                      {/* Favorite toggle */}
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={t.dans_playlist_favorite}
                          onCheckedChange={(checked) => updateTitre(t.id, { dans_playlist_favorite: checked })}
                        />
                        <span className="text-sm text-muted-foreground">Playlist Favorite</span>
                      </div>

                      {/* Répétitions */}
                      <div className="relative">
                        <button
                          onClick={() => setShowReps(showReps === t.id ? null : t.id)}
                          className="flex items-center gap-1 text-sm text-[#4A6FA5] hover:underline"
                        >
                          {t.boucle_infinie ? (
                            <><Infinity className="h-4 w-4" /> Boucle infinie</>
                          ) : (
                            <><RefreshCw className="h-4 w-4" /> {t.repetitions}×</>
                          )}
                        </button>
                        {showReps === t.id && (
                          <div className="absolute z-10 top-8 left-0 bg-white border rounded-lg shadow-lg p-2 flex gap-1">
                            {REP_OPTIONS.map((opt) => (
                              <button
                                key={`${opt.value}-${opt.loop}`}
                                className={`px-3 py-2 text-sm rounded-md ${
                                  (t.boucle_infinie === opt.loop && t.repetitions === opt.value)
                                    ? 'bg-[#4A6FA5] text-white'
                                    : 'hover:bg-[#EDEAE3]'
                                }`}
                                onClick={() => {
                                  updateTitre(t.id, { repetitions: opt.value, boucle_infinie: opt.loop });
                                  setShowReps(null);
                                }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Note */}
                    {editNotes[t.id] !== undefined ? (
                      <div className="mt-3 space-y-2">
                        <Textarea
                          value={editNotes[t.id]}
                          onChange={(e) => setEditNotes(n => ({ ...n, [t.id]: e.target.value }))}
                          placeholder="Note personnelle..."
                          className="text-sm"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveNote(t.id)}>Enregistrer</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditNotes(n => { const c = { ...n }; delete c[t.id]; return c; })}>Annuler</Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditNotes(n => ({ ...n, [t.id]: t.note_aidant ?? '' }))}
                        className="mt-2 text-xs text-muted-foreground hover:text-[#4A6FA5]"
                      >
                        {t.note_aidant || '+ Ajouter une note'}
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
