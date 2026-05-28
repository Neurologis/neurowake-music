'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Check, X, HelpCircle, Upload, ShoppingCart, Search, ChevronRight, Loader2 } from 'lucide-react';

type PhaseRecommandee = 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher';

interface Titre {
  id: string;
  titre: string;
  artiste: string;
  annee: number | null;
  pochette_url: string | null;
  statut: 'propose' | 'valide' | 'refuse' | 'incertain' | 'importe';
  musicbrainz_id?: string | null;
  phase_recommandee?: PhaseRecommandee | null;
  itunes_url?: string;
  amazon_url?: string;
}

const PAGE_SIZE = 10;

const PHASE_CONFIG: Record<PhaseRecommandee, { label: string; className: string }> = {
  matin:      { label: '🌅 Matin',      className: 'bg-amber-100 text-amber-800 border-amber-200' },
  soins:      { label: '🕊️ Soins',      className: 'bg-sky-100 text-sky-800 border-sky-200' },
  repas:      { label: '🍽️ Repas',      className: 'bg-green-100 text-green-800 border-green-200' },
  'apres-midi':{ label: '🌤️ Après-midi', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  coucher:    { label: '🌙 Coucher',    className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
};

export default function DecouvertePage() {
  const router = useRouter();

  // All titles fetched from API
  const [allTitres, setAllTitres] = useState<Titre[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Pagination
  const [page, setPage] = useState(0);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Titre[]>([]);
  const [searching, setSearching] = useState(false);

  // Upload
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    loadTitres();
  }, []);

  async function loadTitres() {
    setLoading(true);
    try {
      const res = await fetch('/api/decouverte/titres');

      if (!res.ok) {
        console.error('[decouverte] API error:', res.status);
        toast({
          title: 'Erreur de chargement',
          description: `Impossible de charger les titres (${res.status}). Rechargez la page.`,
          variant: 'destructive',
        });
        return;
      }

      const { titres: data } = await res.json();
      console.log(`[decouverte] Loaded ${data?.length ?? 0} titles`);
      setAllTitres(data ?? []);
    } catch (err) {
      console.error('[decouverte] loadTitres error:', err);
      toast({
        title: 'Erreur réseau',
        description: 'Impossible de charger les recommandations. Vérifiez votre connexion et rechargez.',
        variant: 'destructive',
      });
    } finally {
      // Always clear loading — even if fetch threw or timed out
      setLoading(false);
    }
  }

  // Titles shown on the current page
  const currentTitres = allTitres.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hasNextPageLocal = (page + 1) * PAGE_SIZE < allTitres.length;

  const nbValides = allTitres.filter((t) => ['valide', 'importe'].includes(t.statut)).length;
  const nbImportes = allTitres.filter((t) => t.statut === 'importe').length;

  async function valider(id: string, clicked: 'valide' | 'refuse' | 'incertain') {
    const current = allTitres.find((t) => t.id === id);
    const newStatut: Titre['statut'] = current?.statut === clicked ? 'propose' : clicked;

    setAllTitres((t) => t.map((x) => (x.id === id ? { ...x, statut: newStatut } : x)));
    await fetch('/api/decouverte/valider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titre_id: id, statut: newStatut }),
    });
  }

  async function handleNext() {
    if (hasNextPageLocal) {
      setPage((p) => p + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Exhausted local list — ask the AI for more
    setLoadingMore(true);
    try {
      const res = await fetch('/api/decouverte/plus', { method: 'POST' });
      if (res.ok) {
        const { titres: more } = await res.json();
        if (more && more.length > 0) {
          setAllTitres((prev) => [...prev, ...more]);
          setPage((p) => p + 1);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          toast({ title: 'Vous avez tout exploré !', description: 'Aucun nouveau titre à suggérer pour ce profil.' });
        }
      }
    } catch {
      toast({ title: 'Erreur réseau', description: 'Impossible de charger plus de titres.', variant: 'destructive' });
    } finally {
      setLoadingMore(false);
    }
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
        setAllTitres((t) => t.map((x) => (x.id === titre.id ? { ...x, statut: 'importe' } : x)));
        toast({ title: 'Titre importé !', description: `${titre.titre} ajouté à votre bibliothèque` });
      } else {
        toast({ title: 'Erreur', description: "Impossible d'importer le fichier", variant: 'destructive' });
      }
      setUploading(null);
    };
    input.click();
  }

  function TitreCard({ titre }: { titre: Titre }) {
    const isImporte = titre.statut === 'importe';
    const phase = titre.phase_recommandee ? PHASE_CONFIG[titre.phase_recommandee] : null;

    return (
      <Card className={isImporte ? 'border-[#7BA05B] bg-green-50' : ''}>
        <CardContent className="p-4">
          <div className="flex gap-4">
            {titre.pochette_url ? (
              <Image src={titre.pochette_url} alt={titre.titre} width={64} height={64} className="rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 bg-[#EDEAE3] rounded-lg flex items-center justify-center flex-shrink-0 text-2xl">🎵</div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{titre.titre}</div>
                  <div className="text-sm text-muted-foreground">
                    {titre.artiste}{titre.annee ? ` (${titre.annee})` : ''}
                  </div>
                </div>
                {phase && (
                  <Badge variant="outline" className={`text-xs shrink-0 ${phase.className}`}>
                    {phase.label}
                  </Badge>
                )}
              </div>

              {!isImporte && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Button
                    size="sm"
                    variant={titre.statut === 'valide' ? 'default' : 'outline'}
                    className={titre.statut === 'valide'
                      ? 'bg-[#7BA05B] hover:bg-[#7BA05B]/80 text-white border-[#7BA05B]'
                      : 'border-[#7BA05B] text-[#7BA05B] hover:bg-green-50'}
                    onClick={() => valider(titre.id, 'valide')}
                  >
                    <Check className="h-4 w-4 mr-1" /> Il aimait
                  </Button>
                  <Button
                    size="sm"
                    variant={titre.statut === 'refuse' ? 'default' : 'outline'}
                    className={titre.statut === 'refuse'
                      ? 'bg-destructive hover:bg-destructive/80 text-white border-destructive'
                      : 'border-destructive text-destructive hover:bg-red-50'}
                    onClick={() => valider(titre.id, 'refuse')}
                  >
                    <X className="h-4 w-4 mr-1" /> Pas vraiment
                  </Button>
                  <Button
                    size="sm"
                    variant={titre.statut === 'incertain' ? 'default' : 'outline'}
                    className={titre.statut === 'incertain' ? 'bg-gray-400 hover:bg-gray-400/80 text-white' : ''}
                    onClick={() => valider(titre.id, 'incertain')}
                  >
                    <HelpCircle className="h-4 w-4 mr-1" /> Je ne sais pas
                  </Button>
                </div>
              )}

              {(titre.statut === 'valide' || titre.statut === 'incertain') && !isImporte && (
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
                    <a href={titre.itunes_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="w-full justify-start">
                        <ShoppingCart className="h-4 w-4 mr-2" /> Acheter iTunes 1,29€
                      </Button>
                    </a>
                  )}
                  {titre.amazon_url && (
                    <a href={titre.amazon_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="w-full justify-start">
                        <ShoppingCart className="h-4 w-4 mr-2" /> Acheter Amazon 0,99€
                      </Button>
                    </a>
                  )}
                </div>
              )}

              {isImporte && (
                <Badge variant="outline" className="mt-2 border-[#7BA05B] text-[#7BA05B]">✓ Importé</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] p-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-[#2C2C2A]">La musique de votre proche</h1>
          <p className="text-muted-foreground mt-1">
            Voici les titres qui lui correspondent probablement. Validez ceux qu&apos;il aimait.
          </p>
          <div className="flex items-center gap-4 mt-2 text-sm">
            {nbValides > 0 && (
              <span className="text-[#7BA05B] font-medium">{nbValides} validé(s)</span>
            )}
            {nbImportes > 0 && (
              <span className="text-[#4A6FA5] font-medium">{nbImportes} importé(s)</span>
            )}
            {!loading && allTitres.length > 0 && (
              <span className="text-muted-foreground">
                Page {page + 1} · titres {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, allTitres.length)} sur {allTitres.length}
              </span>
            )}
          </div>
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

        {/* Liste paginée */}
        {loading ? (
          <div className="py-12 text-center space-y-3">
            <div className="text-4xl animate-spin inline-block">🎵</div>
            <p className="text-muted-foreground font-medium">Analyse du profil musical en cours…</p>
            <p className="text-sm text-muted-foreground">L&apos;IA sélectionne les titres les plus adaptés. Cela peut prendre 30 secondes.</p>
          </div>
        ) : currentTitres.length === 0 ? (
          <div className="py-12 text-center space-y-4">
            <p className="text-muted-foreground">Aucun titre proposé pour l&apos;instant.</p>
            <div className="flex flex-col gap-2 items-center">
              <Button variant="outline" onClick={loadTitres}>
                🔄 Réessayer la génération IA
              </Button>
              <p className="text-xs text-muted-foreground">Ou utilisez la recherche ci-dessus pour ajouter des titres manuellement.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {currentTitres.map((t) => <TitreCard key={t.id} titre={t} />)}
          </div>
        )}

        {/* Actions bas de page */}
        <div className="mt-8 pb-8 space-y-3">
          {/* Voir d'autres titres */}
          {!loading && allTitres.length > 0 && (
            <Button
              onClick={handleNext}
              variant="outline"
              className="w-full"
              disabled={loadingMore}
            >
              {loadingMore ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération de nouveaux titres...</>
              ) : hasNextPageLocal ? (
                <><ChevronRight className="h-4 w-4 mr-2" /> Voir les {Math.min(PAGE_SIZE, allTitres.length - (page + 1) * PAGE_SIZE)} titres suivants</>
              ) : (
                <><ChevronRight className="h-4 w-4 mr-2" /> Voir d&apos;autres titres (IA)</>
              )}
            </Button>
          )}

          {/* Continuer vers le lecteur */}
          <Button onClick={() => router.push('/app')} size="lg" className="w-full">
            Continuer vers le lecteur →
          </Button>
        </div>
      </div>
    </div>
  );
}
