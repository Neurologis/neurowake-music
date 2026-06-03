'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Check, X, HelpCircle, Upload, ShoppingCart, Search, ChevronRight, Loader2, HardDrive, LogOut } from 'lucide-react';
import * as localStore from '@/lib/local-audio-store';
import { createClient } from '@/lib/supabase/client';

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
  description?: string | null;
  itunes_url?: string;
  amazon_url?: string;
}

interface TitrePreview {
  titre: string;
  artiste: string;
  annee: number | null;
  pochette_url?: string | null;
  itunes_url?: string;
  description?: string;
  phase_recommandee?: PhaseRecommandee;
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
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

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

  // Preview carte avant confirmation d'ajout depuis recherche
  const [titrePreview, setTitrePreview]     = useState<TitrePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

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

  /**
   * Step 1 — Génère une preview IA (description + phase) pour un titre trouvé via iTunes.
   * Affiche la carte de prévisualisation sans encore persister en base.
   */
  async function lancerPreview(t: Titre) {
    if (allTitres.some((x) => x.titre === t.titre && x.artiste === t.artiste)) return;
    // Afficher la preview de base immédiatement, puis enrichir avec l'IA
    setTitrePreview({ titre: t.titre, artiste: t.artiste, annee: t.annee, pochette_url: t.pochette_url, itunes_url: t.itunes_url });
    setLoadingPreview(true);
    try {
      const res = await fetch('/api/decouverte/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titre: t.titre, artiste: t.artiste, annee: t.annee }),
      });
      if (res.ok) {
        const { description, phase_recommandee } = await res.json();
        setTitrePreview((prev) => prev ? { ...prev, description, phase_recommandee } : prev);
      }
    } catch {
      // Preview sans description — l'ajout reste possible
    } finally {
      setLoadingPreview(false);
    }
  }

  /**
   * Step 2 — L'aidant confirme depuis la preview : persiste en base.
   */
  async function confirmerAjout() {
    if (!titrePreview) return;
    const t = titrePreview;
    setTitrePreview(null);

    const tempId = `search-${Date.now()}`;
    const optimistic: Titre = {
      id: tempId, titre: t.titre, artiste: t.artiste, annee: t.annee,
      pochette_url: t.pochette_url ?? null, statut: 'valide',
      phase_recommandee: t.phase_recommandee ?? null,
      description: t.description ?? null,
      itunes_url: t.itunes_url,
    };
    setAllTitres((prev) => [...prev, optimistic]);

    try {
      const res = await fetch('/api/decouverte/ajouter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titre: t.titre, artiste: t.artiste, annee: t.annee, pochette_url: t.pochette_url, itunes_url: t.itunes_url }),
      });
      if (res.ok) {
        const { titre: saved } = await res.json();
        setAllTitres((prev) => prev.map((x) => x.id === tempId
          ? { ...saved, statut: 'valide', itunes_url: t.itunes_url, pochette_url: t.pochette_url }
          : x
        ));
        toast({ title: 'Titre ajouté ✅', description: `${t.titre} — ${t.artiste}` });
      } else {
        toast({ title: 'Erreur serveur', description: "Le titre n'a pas pu être sauvegardé.", variant: 'destructive' });
        setAllTitres((prev) => prev.filter((x) => x.id !== tempId));
      }
    } catch {
      toast({ title: 'Erreur réseau', description: "Impossible de sauvegarder le titre.", variant: 'destructive' });
      setAllTitres((prev) => prev.filter((x) => x.id !== tempId));
    }
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

  /**
   * Associate a local audio file with a recommended titre.
   * The file stays on the user's device — only metadata is saved to the server.
   *
   * IMPORTANT: We create the DB record FIRST so we can use the real UUID as the
   * IndexedDB key for the FSA file handle. This makes the association persistent
   * across browser sessions (no more lost files after page reload).
   *
   * Steps:
   *   1. Create titres_audio DB record (empty filename for now)
   *   2. Open file picker with the REAL titre ID → FSA handle stored under real ID
   *   3. If user cancels → delete the DB record
   *   4. PATCH the DB record with the filename
   *   5. Copy file to NeuroWake Music folder
   *   6. Mark the recommended titre as 'valide'
   */
  async function importerFichier(titre: Titre) {
    setUploading(titre.id);
    try {
      // Step 1 — Create DB record first (filename will be patched after pick)
      const createRes = await fetch('/api/titres', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titre:             titre.titre,
          artiste:           titre.artiste,
          annee:             titre.annee,
          filename:          '',
          phase_recommandee: titre.phase_recommandee ?? null,
        }),
      });

      if (!createRes.ok) {
        toast({ title: 'Erreur', description: "Impossible d'enregistrer le titre.", variant: 'destructive' });
        return;
      }

      const newTitre = await createRes.json();

      // Step 2 — Pick file using the REAL ID so FSA handle is stored persistently
      const file = await localStore.pickAndAssociate(newTitre.id);
      if (!file) {
        // User cancelled — clean up the orphan DB record
        await fetch(`/api/titres/${newTitre.id}`, { method: 'DELETE' });
        return;
      }

      // Step 3 — Patch DB with the actual filename
      await fetch(`/api/titres/${newTitre.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_path: file.name }),
      });

      // Step 4 — Copy to NeuroWake Music folder (best-effort)
      const copied = await localStore.copyToMusicFolder(file);
      if (copied) {
        console.log('[découverte] Fichier copié dans NeuroWake Music :', file.name);
      }

      // Step 5 — Mark titre_recommande as valide (set directly, no toggle)
      await fetch('/api/decouverte/valider', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titre_id: titre.id, statut: 'valide' }),
      });
      setAllTitres(ts => ts.map(x => x.id === titre.id ? { ...x, statut: 'importe' } : x));

      toast({
        title: 'Titre associé ✅',
        description: copied
          ? `${titre.titre} — copié dans NeuroWake Music`
          : `${titre.titre} — fichier sur votre appareil`,
      });
    } catch (err) {
      console.error('[découverte] importerFichier error:', err);
      toast({ title: 'Erreur', description: "Impossible d'associer le fichier.", variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  }

  function TitreCard({ titre }: { titre: Titre }) {
    const isImporte = titre.statut === 'importe';
    const phase = titre.phase_recommandee ? PHASE_CONFIG[titre.phase_recommandee] : null;

    return (
      <Card className={`bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${isImporte ? 'border-[#7BA05B]/50' : 'border-white/50'}`}>
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
                  {titre.description && (
                    <p className="text-sm text-muted-foreground italic mt-1 leading-snug">
                      {titre.description}
                    </p>
                  )}
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
                    className={titre.statut === 'valide'
                      ? 'bg-gradient-to-r from-[#7BA05B] to-[#5d8a3e] text-white shadow-md hover:-translate-y-0.5 transition-all'
                      : 'border border-[#7BA05B] text-[#7BA05B] bg-white hover:bg-green-50 hover:-translate-y-0.5 transition-all'}
                    onClick={() => valider(titre.id, 'valide')}
                  >
                    <Check className="h-4 w-4 mr-1" /> Il aimait
                  </Button>
                  <Button
                    size="sm"
                    className={titre.statut === 'refuse'
                      ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-md hover:-translate-y-0.5 transition-all'
                      : 'border border-destructive text-destructive bg-white hover:bg-red-50 hover:-translate-y-0.5 transition-all'}
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
                  {/* Associate local file */}
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-[#4A6FA5] to-[#6B8EC9] text-white w-full justify-start hover:-translate-y-0.5 transition-all"
                    onClick={() => importerFichier(titre)}
                    disabled={uploading === titre.id}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading === titre.id
                      ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Association…</>
                      : "J'ai ce fichier → Associer depuis mon appareil"}
                  </Button>

                  {/* Purchase links with post-purchase instruction */}
                  {(titre.itunes_url || titre.amazon_url) && (
                    <div className="space-y-1.5">
                      {titre.itunes_url && (
                        <a href={titre.itunes_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="w-full justify-start">
                            <ShoppingCart className="h-4 w-4 mr-2" /> Acheter sur iTunes 1,29€
                          </Button>
                        </a>
                      )}
                      {titre.amazon_url && (
                        <a href={titre.amazon_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="w-full justify-start">
                            <ShoppingCart className="h-4 w-4 mr-2" /> Acheter sur Amazon 0,99€
                          </Button>
                        </a>
                      )}
                      <p className="text-xs text-muted-foreground flex items-start gap-1 pt-1">
                        <HardDrive className="h-3 w-3 mt-0.5 flex-shrink-0 text-[#4A6FA5]" />
                        Après l&apos;achat, téléchargez le fichier sur votre appareil puis associez-le avec le bouton ci-dessus.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {isImporte && (
                <Badge variant="outline" className="mt-2 border-[#7BA05B] text-[#7BA05B]">
                  ✓ Fichier associé sur cet appareil
                </Badge>
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
          <div className="flex items-center justify-between gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[#2C2C2A]">La musique de votre proche</h1>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[#2C2C2A] transition-colors shrink-0"
              title="Se déconnecter"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
          <p className="text-muted-foreground mt-1">
            Voici les titres qui lui correspondent probablement. Validez ceux qu&apos;il aimait.
          </p>

          {/* Bannière stockage local */}
          <div className="mt-3 flex items-start gap-2 bg-[#4A6FA5]/5 border border-[#4A6FA5]/20 rounded-lg p-3">
            <HardDrive className="h-4 w-4 text-[#4A6FA5] mt-0.5 flex-shrink-0" />
            <p className="text-xs text-[#2C2C2A]">
              <strong>NeuroWake Music</strong> lit les fichiers directement depuis votre appareil.
              Aucun fichier musical n&apos;est envoyé sur internet.
              Après avoir validé un titre, associez son fichier audio depuis votre ordinateur, tablette ou téléphone.
            </p>
          </div>
        </div>
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

        {/* Résultats de recherche iTunes */}
        {searchQuery.length >= 2 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">
              RÉSULTATS iTunes ({searchResults.length})
            </h2>
            {searching ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Recherche en cours…
              </div>
            ) : searchResults.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">Aucun résultat pour &laquo;&nbsp;{searchQuery}&nbsp;&raquo;</p>
            ) : (
              <div className="space-y-2">
                {searchResults.map((t) => {
                  const dejaAjoute = allTitres.some((x) => x.titre === t.titre && x.artiste === t.artiste);
                  const isPreviewLoading = loadingPreview && titrePreview?.titre === t.titre && titrePreview?.artiste === t.artiste;
                  return (
                    <Card key={t.id ?? t.titre} className="bg-white/80 backdrop-blur-sm shadow-md rounded-xl border border-white/50 hover:-translate-y-0.5 transition-all duration-200">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          {t.pochette_url ? (
                            <Image src={t.pochette_url} alt={t.titre} width={48} height={48} className="rounded-md object-cover flex-shrink-0" unoptimized />
                          ) : (
                            <div className="w-12 h-12 bg-[#EDEAE3] rounded-md flex items-center justify-center flex-shrink-0 text-xl">🎵</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate">{t.titre}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {t.artiste}{t.annee ? ` · ${t.annee}` : ''}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="bg-[#4A6FA5] hover:bg-[#4A6FA5]/90 text-white shrink-0"
                            onClick={() => lancerPreview(t)}
                            disabled={dejaAjoute || isPreviewLoading}
                          >
                            {dejaAjoute
                              ? '✓ Ajouté'
                              : isPreviewLoading
                              ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Analyse…</>
                              : '+ Ajouter'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Carte de prévisualisation IA */}
            {titrePreview && (
              <div className="mt-4 bg-[#4A6FA5]/5 border border-[#4A6FA5]/20 rounded-xl p-4 space-y-2">
                <p className="font-semibold text-base">{titrePreview.titre} — {titrePreview.artiste}</p>
                {loadingPreview ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyse musicothérapeutique en cours…
                  </div>
                ) : (
                  <>
                    {titrePreview.description && (
                      <p className="text-sm text-muted-foreground italic leading-snug">
                        {titrePreview.description}
                      </p>
                    )}
                    {titrePreview.phase_recommandee && PHASE_CONFIG[titrePreview.phase_recommandee] && (
                      <span className={`inline-block text-xs px-2 py-1 rounded-full border font-medium ${PHASE_CONFIG[titrePreview.phase_recommandee].className}`}>
                        {PHASE_CONFIG[titrePreview.phase_recommandee].label}
                      </span>
                    )}
                  </>
                )}
                <div className="flex gap-2 pt-1">
                  <Button onClick={confirmerAjout} className="flex-1 bg-[#4A6FA5] text-white" disabled={loadingPreview}>
                    ✅ Ajouter ce titre à ma liste
                  </Button>
                  <Button variant="outline" onClick={() => setTitrePreview(null)} className="shrink-0">
                    Annuler
                  </Button>
                </div>
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
          {/* Charger plus de titres (conditionnel — visible seulement si des titres sont chargés) */}
          {!loading && allTitres.length > 0 && (
            <Button
              onClick={handleNext}
              variant="outline"
              className="w-full"
              disabled={loadingMore}
            >
              {loadingMore ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération de nouveaux titres…</>
              ) : hasNextPageLocal ? (
                <><ChevronRight className="h-4 w-4 mr-2" /> Voir les {Math.min(PAGE_SIZE, allTitres.length - (page + 1) * PAGE_SIZE)} titres suivants</>
              ) : (
                <><ChevronRight className="h-4 w-4 mr-2" /> Voir d&apos;autres titres (IA)</>
              )}
            </Button>
          )}

          {/* ──────────────────────────────────────────────────────────────
              BOUTON PERMANENT — toujours visible, même en cours de chargement
              Permet à l'utilisateur de sortir quand il le décide.
          ────────────────────────────────────────────────────────────────── */}
          <Button
            onClick={() => router.push('/app')}
            size="lg"
            className="w-full bg-[#7BA05B] hover:bg-[#7BA05B]/90 text-white font-semibold"
          >
            {nbValides > 0 ? (
              <>
                J&apos;ai terminé — {nbValides} titre{nbValides > 1 ? 's' : ''} sélectionné{nbValides > 1 ? 's' : ''} → Aller au lecteur
                <ChevronRight className="h-4 w-4 ml-2" />
              </>
            ) : (
              <>
                J&apos;ai terminé ma sélection → Aller au lecteur
                <ChevronRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
