'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Check, X, HelpCircle, Upload, ShoppingCart, Search } from 'lucide-react';

interface Titre {
  id: string;
  titre: string;
  artiste: string;
  annee: number | null;
  pochette_url: string | null;
  statut: 'propose' | 'valide' | 'refuse' | 'incertain' | 'importe';
  musicbrainz_id?: string | null;
  itunes_url?: string;
  amazon_url?: string;
}

export default function DecouvertePage() {
  const router = useRouter();
  const [titres, setTitres] = useState<Titre[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Titre[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => { loadTitres(); }, []);

  async function loadTitres() {
    const res = await fetch('/api/decouverte/titres');
    if (res.ok) {
      const { titres: data } = await res.json();
      setTitres(data ?? []);
    }
    setLoading(false);
  }

  async function valider(id: string, statut: 'valide' | 'refuse' | 'incertain') {
    setTitres(t => t.map(x => x.id === id ? { ...x, statut } : x));
    await fetch('/api/decouverte/valider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titre_id: id, statut }),
    });
  }

  const searchDebounce = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/decouverte/recherche?q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const { titres: data } = await res.json();
      setSearchResults(data ?? []);
    }
    setSearching(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchDebounce(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery, searchDebounce]);

  async function importerFichier(titre: Titre) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setUploading(titre.id);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('titre', titre.titre);
      fd.append('artiste', titre.artiste);
      if (titre.annee) fd.append('annee', titre.annee.toString());

      const res = await fetch('/api/audio/upload', { method: 'POST', body: fd });
      if (res.ok) {
        await valider(titre.id, 'valide');
        setTitres(t => t.map(x => x.id === titre.id ? { ...x, statut: 'importe' } : x));
        toast({ title: 'Titre importé !', description: `${titre.titre} ajouté à votre bibliothèque` });
      } else {
        toast({ title: 'Erreur', description: 'Impossible d\'importer le fichier', variant: 'destructive' });
      }
      setUploading(null);
    };
    input.click();
  }

  const nbImportes = titres.filter(t => t.statut === 'importe').length;
  const nbValides = titres.filter(t => ['valide', 'importe'].includes(t.statut)).length;

  function TitreCard({ titre }: { titre: Titre }) {
    const isValide = titre.statut === 'valide';
    const isImporte = titre.statut === 'importe';

    return (
      <Card className={`${isImporte ? 'border-[#7BA05B] bg-green-50' : ''}`}>
        <CardContent className="p-4">
          <div className="flex gap-4">
            {titre.pochette_url ? (
              <Image src={titre.pochette_url} alt={titre.titre} width={64} height={64} className="rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 bg-[#EDEAE3] rounded-lg flex items-center justify-center flex-shrink-0 text-2xl">🎵</div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{titre.titre}</div>
              <div className="text-sm text-muted-foreground">{titre.artiste}{titre.annee ? ` (${titre.annee})` : ''}</div>

              {/* Boutons validation */}
              {titre.statut === 'propose' && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Button size="sm" variant="outline" className="border-[#7BA05B] text-[#7BA05B] hover:bg-green-50" onClick={() => valider(titre.id, 'valide')}>
                    <Check className="h-4 w-4 mr-1" /> Il aimait
                  </Button>
                  <Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-red-50" onClick={() => valider(titre.id, 'refuse')}>
                    <X className="h-4 w-4 mr-1" /> Pas vraiment
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => valider(titre.id, 'incertain')}>
                    <HelpCircle className="h-4 w-4 mr-1" /> Je ne sais pas
                  </Button>
                </div>
              )}

              {/* Liens d'achat / import pour les validés */}
              {(isValide || titre.statut === 'incertain') && !isImporte && (
                <div className="flex flex-col gap-2 mt-3">
                  <Button
                    size="sm"
                    className="bg-[#4A6FA5] hover:bg-[#4A6FA5]/90 w-full justify-start"
                    onClick={() => importerFichier(titre)}
                    disabled={uploading === titre.id}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading === titre.id ? 'Import...' : "J'ai ce fichier → Importer"}
                  </Button>
                  {titre.itunes_url && (
                    <div>
                      <a href={titre.itunes_url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="w-full justify-start">
                          <ShoppingCart className="h-4 w-4 mr-2" /> Acheter iTunes 1,29€
                        </Button>
                      </a>
                      <p className="text-xs text-muted-foreground mt-1">Achat direct sur iTunes — indépendant de votre abonnement NeuroWake</p>
                    </div>
                  )}
                  {titre.amazon_url && (
                    <div>
                      <a href={titre.amazon_url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="w-full justify-start">
                          <ShoppingCart className="h-4 w-4 mr-2" /> Acheter Amazon 0,99€
                        </Button>
                      </a>
                      <p className="text-xs text-muted-foreground mt-1">Achat direct sur Amazon — indépendant de votre abonnement NeuroWake</p>
                    </div>
                  )}
                </div>
              )}

              {isImporte && <Badge variant="outline" className="mt-2 border-[#7BA05B] text-[#7BA05B]">✓ Importé</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#2C2C2A]">La musique de votre proche</h1>
          <p className="text-muted-foreground mt-1">
            Voici les titres qui lui correspondent probablement. Validez ceux qu&apos;il aimait, ignorez les autres.
          </p>
          {nbValides > 0 && (
            <p className="text-[#7BA05B] font-medium mt-2">{nbValides} titre(s) validé(s) · {nbImportes} importé(s)</p>
          )}
        </div>

        {/* Barre de recherche */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Rechercher un titre, un artiste..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Résultats de recherche */}
        {searchQuery.length >= 2 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">RÉSULTATS DE RECHERCHE</h2>
            {searching ? (
              <p className="text-muted-foreground text-sm">Recherche...</p>
            ) : searchResults.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucun résultat</p>
            ) : (
              <div className="space-y-3">
                {searchResults.map((t) => (
                  <Card key={t.musicbrainz_id ?? t.titre}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="font-semibold">{t.titre}</div>
                          <div className="text-sm text-muted-foreground">{t.artiste}{t.annee ? ` (${t.annee})` : ''}</div>
                        </div>
                        <Button size="sm" onClick={() => importerFichier(t as Titre)}>
                          <Upload className="h-4 w-4 mr-2" /> Importer
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Liste des titres proposés */}
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Chargement de la musique...</p>
        ) : titres.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Aucun titre proposé. Utilisez la recherche pour ajouter des titres.</p>
        ) : (
          <div className="space-y-3">
            {titres.map((t) => <TitreCard key={t.id} titre={t} />)}
          </div>
        )}

        {/* Bouton continuer */}
        <div className="mt-8 pb-8">
          <Button
            onClick={() => router.push('/app')}
            size="lg"
            className="w-full"
            disabled={nbImportes === 0}
          >
            Continuer →
          </Button>
          {nbImportes === 0 && (
            <p className="text-center text-sm text-muted-foreground mt-2">Importez au moins un titre pour continuer</p>
          )}
        </div>
      </div>
    </div>
  );
}
