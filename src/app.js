import {
  loadData,
  saveData,
  getStorageInfo,
  buildArchivedCopy,
  cutoffYearsAgo,
} from './lib/storage.js';
import {
  emptyData,
  parseImport,
  MODES_REGLEMENT,
  TYPES_BIEN,
  DEFAULT_EMAIL_TEMPLATES,
  generateBailleurId,
  generateBienId,
  generateLocataireId,
} from './lib/schema.js';
import { renderTemplate, AVAILABLE_PLACEHOLDERS } from './lib/email-template.js';
// Lazy-load de lib/pdf.js : module ~250 kB (jsPDF + dépendances) chargé uniquement au
// premier clic sur Générer/Regénérer. Le 2e+ appel passe par le cache module ESM.
// Le SW pré-cache aussi le chunk, donc le 1er appel hors-ligne fonctionne après 1ʳ visite.
let _pdfModulePromise = null;
function loadPdfModule() {
  if (!_pdfModulePromise) _pdfModulePromise = import('./lib/pdf.js');
  return _pdfModulePromise;
}
import { defaultPeriod, formatPeriodFR } from './lib/period.js';
import { moisTexte, formatDateFR } from './lib/format.js';
import { toast, confirmDialog, choiceDialog } from './lib/toast.js';
import { emptyLocataireForm, emptyBailleurForm, emptyBienForm } from './lib/forms.js';
import { readImageAsDataUrl } from './lib/image-upload.js';
import {
  buildHistoriqueEntry,
  buildHistoriqueRecuEntry,
  findDoublons,
  findDoublonsRecu,
  filterAndSort,
  listeFiltreLocataires,
  listeFiltreAnnees,
  listeFiltreBiens,
  nextNumeroQuittance,
  nextNumeroRecu,
  resolveBailleurForRender,
} from './lib/historique.js';

const MOIS_OPTIONS = [
  { value: '01', label: 'Janvier' },
  { value: '02', label: 'Février' },
  { value: '03', label: 'Mars' },
  { value: '04', label: 'Avril' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Juin' },
  { value: '07', label: 'Juillet' },
  { value: '08', label: 'Août' },
  { value: '09', label: 'Septembre' },
  { value: '10', label: 'Octobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Décembre' },
];

export function appData() {
  // Defaults pour les sélecteurs Mois / Année et la période couverte : on les calcule ICI
  // (factory, synchrone) plutôt que dans init() pour éviter une race entre Alpine x-model et
  // x-for sur les <select> — sinon l'affichage initial montre le premier item au lieu du mois
  // courant, même si le modèle est correct (bug observé : refresh → « Janvier 2021 » affiché).
  const today = new Date();
  const currentYear = today.getFullYear();
  const initialMois = String(today.getMonth() + 1).padStart(2, '0');
  const initialAnnee = String(currentYear);
  const initialAnneeOptions = [];
  for (let y = currentYear - 5; y <= currentYear + 2; y++) initialAnneeOptions.push(String(y));
  const initialPeriode = defaultPeriod(initialMois, initialAnnee);

  return {
    moisOptions: MOIS_OPTIONS,
    modesReglement: MODES_REGLEMENT,
    typesBien: TYPES_BIEN,
    anneeOptions: initialAnneeOptions,
    data: emptyData(),
    activeTab: 'generate',

    // Génération
    selectedBailleurId: '',
    selectedLocataireId: '',
    moisNum: initialMois,
    annee: initialAnnee,
    overridePeriode: false,
    periodeDebut: initialPeriode.debut,
    periodeFin: initialPeriode.fin,
    overrideMontants: false,
    loyerOverride: '',
    chargesOverride: '',
    modeReglement: '',
    dateEncaissement: '',
    emailLocataire: '',

    // Modale unifiée locataire (création + édition). mode ∈ 'create' | 'edit'.
    editingLocataire: { open: false, mode: 'create', id: null, form: emptyLocataireForm(), previousActive: null },

    // Modale unifiée bailleur
    editingBailleur: { open: false, mode: 'create', id: null, form: emptyBailleurForm(), previousActive: null },

    // Modale unifiée bien
    editingBien: { open: false, mode: 'create', id: null, form: emptyBienForm(), previousActive: null },

    // Filtres de l'onglet Historique
    filterLocataire: '',
    filterAnnee: '',
    filterBailleurId: '',
    filterBienLibelle: '',
    filterType: '', // '' (tous), 'quittance', 'recu_dg_entree', 'recu_dg_sortie'

    // État onglet Dépôt de garantie. Parallèle à la sélection Quittance mais indépendant
    // (deux sélections autonomes pour ne pas mélanger les flux).
    dgSelectedBailleurId: '',
    dgSelectedLocataireId: '',
    dgSousType: 'entree', // 'entree' | 'sortie'
    dgMontantInitial: '',
    dgMontantRestitue: '',
    dgRetenuesTexte: '',
    dgDateEvenement: '',

    // Indique si on a déjà averti l'utilisateur du fallback police (Inter indisponible).
    // Volontairement non persisté : un refresh remet à zéro.
    fontFallbackWarned: false,

    // Ordre des onglets pour la navigation clavier (←/→/Home/End). DOIT correspondre à
    // l'ordre DOM des `<button role="tab">` dans index.html. Si vous réordonnez les onglets,
    // pensez à mettre à jour cette liste — sinon ←/→ devient incohérent avec l'ordre visuel.
    tabsOrder: ['generate', 'depot-garantie', 'historique', 'locataires', 'patrimoine', 'configuration'],

    // Indique que des données ont été modifiées depuis le dernier export.
    // Persiste en mémoire uniquement : un refresh remet à false (l'utilisateur a vécu le risque consciemment).
    dirty: false,

    // Lock anti double-clic sur les boutons de génération PDF. Empêche un 2e clic pendant
    // qu'un PDF est en cours de génération (race observable sur sticky CTA fixed iOS,
    // ou simplement quand la police Inter prend ~500 ms à charger).
    _busy: false,

    init() {
      this.data = loadData();

      // Auto-sélection si un seul bailleur existe. Les assignations ici se font AVANT que les
      // watchers soient enregistrés ci-dessous, donc la cascade locataire ne se déclencherait
      // pas — on calcule directement l'auto-sélection initiale du locataire.
      if (this.data.bailleurs.length === 1) {
        const bailleurId = this.data.bailleurs[0].id;
        this.selectedBailleurId = bailleurId;
        this.dgSelectedBailleurId = bailleurId;
        const bienIds = new Set(
          this.data.biens.filter((b) => b.bailleurId === bailleurId).map((b) => b.id),
        );
        const locs = this.data.locataires.filter((l) => bienIds.has(l.bienId));
        if (locs.length === 1) {
          this.selectedLocataireId = locs[0].id;
          this.dgSelectedLocataireId = locs[0].id;
          // Pré-remplit emailLocataire / modeReglement depuis la fiche (sinon les champs
          // restent vides au premier render alors que le locataire est déjà sélectionné).
          this.onSelectLocataire();
          this.onDgSelectLocataire();
        }
      }

      this.$watch('moisNum', () => this.syncPeriode());
      this.$watch('annee', () => this.syncPeriode());
      this.$watch('overridePeriode', (val) => {
        if (!val) this.syncPeriode();
      });
      // Quand on change de bailleur, on réinitialise le locataire sélectionné.
      // Confort : si le bailleur n'a qu'un seul locataire, on l'auto-sélectionne directement.
      this.$watch('selectedBailleurId', () => {
        const locs = this.locatairesDuBailleur;
        this.selectedLocataireId = locs.length === 1 ? locs[0].id : '';
        this.onSelectLocataire();
      });
      // Cascade des filtres historique : bailleur → bien → locataire.
      // Quand un filtre amont change, on réinitialise les filtres aval devenus orphelins.
      this.$watch('filterBailleurId', () => {
        if (this.filterBienLibelle && !this.historiqueBiens.includes(this.filterBienLibelle)) {
          this.filterBienLibelle = '';
        }
        if (this.filterLocataire && !this.historiqueLocataires.includes(this.filterLocataire)) {
          this.filterLocataire = '';
        }
      });
      this.$watch('filterBienLibelle', () => {
        if (this.filterLocataire && !this.historiqueLocataires.includes(this.filterLocataire)) {
          this.filterLocataire = '';
        }
      });

      // Onglet DG : cascade bailleur → locataire (identique à l'onglet quittance).
      // Confort : auto-sélection si un seul locataire rattaché au bailleur.
      // Le watcher sur dgSelectedLocataireId enchaînera onDgSelectLocataire().
      this.$watch('dgSelectedBailleurId', () => {
        const locs = this.dgLocatairesDuBailleur;
        this.dgSelectedLocataireId = locs.length === 1 ? locs[0].id : '';
      });
      this.$watch('dgSelectedLocataireId', () => this.onDgSelectLocataire());

      // Synchronisation bidirectionnelle du locataire sélectionné entre Quittance et DG.
      // Sans ce sync, l'utilisateur qui prépare une quittance puis bascule sur DG doit
      // re-sélectionner manuellement le même locataire (frustrant pour le cas usuel : un
      // bailleur émet quittance + reçu DG pour le même locataire à des moments distincts).
      // Le flag `_syncingLocataire` casse la boucle mutuelle des watchers.
      this.$watch('selectedLocataireId', (newId) => {
        if (this._syncingLocataire) return;
        if (!newId || newId === this.dgSelectedLocataireId) return;
        const loc = this.data.locataires.find((l) => l.id === newId);
        if (!loc) return;
        const bien = this.data.biens.find((b) => b.id === loc.bienId);
        if (!bien) return;
        this._syncingLocataire = true;
        try {
          // Aligner le bailleur DG si différent (le watcher dgSelectedBailleurId déclenchera
          // un reset de dgSelectedLocataireId — c'est OK, on le repose juste après).
          if (this.dgSelectedBailleurId !== bien.bailleurId) {
            this.dgSelectedBailleurId = bien.bailleurId;
          }
          this.dgSelectedLocataireId = newId;
        } finally {
          this._syncingLocataire = false;
        }
      });
      this.$watch('dgSelectedLocataireId', (newId) => {
        if (this._syncingLocataire) return;
        if (!newId || newId === this.selectedLocataireId) return;
        const loc = this.data.locataires.find((l) => l.id === newId);
        if (!loc) return;
        const bien = this.data.biens.find((b) => b.id === loc.bienId);
        if (!bien) return;
        this._syncingLocataire = true;
        try {
          if (this.selectedBailleurId !== bien.bailleurId) {
            this.selectedBailleurId = bien.bailleurId;
          }
          this.selectedLocataireId = newId;
        } finally {
          this._syncingLocataire = false;
        }
      });

      // Routing par URL param (?tab=...) — utilisé par les shortcuts du manifest PWA.
      // Lu une seule fois à l'init : un changement d'URL ultérieur (history.pushState côté
      // app, navigation popstate côté navigateur) ne re-déclenchera pas le routing. En PWA
      // standalone, init() retourne quasi-systématiquement au cold-start, donc OK en pratique.
      // Passe par switchTab pour bénéficier des effets de bord centraux (flush templates, etc.).
      try {
        const requested = new URLSearchParams(window.location.search).get('tab');
        if (requested && this.tabsOrder.includes(requested) && requested !== this.activeTab) {
          this.switchTab(requested, { focusPanel: false });
        }
      } catch {
        // URLSearchParams indisponible (très anciens navigateurs) : on ignore.
      }
    },

    // ---------- Accesseurs ----------

    get selectedBailleur() {
      if (!this.selectedBailleurId) return null;
      return this.data.bailleurs.find((b) => b.id === this.selectedBailleurId) || null;
    },

    get selectedLocataire() {
      if (!this.selectedLocataireId) return null;
      return this.data.locataires.find((l) => l.id === this.selectedLocataireId) || null;
    },

    get selectedBien() {
      const loc = this.selectedLocataire;
      if (!loc) return null;
      return this.data.biens.find((b) => b.id === loc.bienId) || null;
    },

    // Loyer / charges effectifs pour le mois en cours (avec override appliqué si activé).
    // Utilisés pour l'aperçu temps réel sur l'onglet Quittance avant génération.
    get effectiveLoyer() {
      const loc = this.selectedLocataire;
      if (!loc) return 0;
      if (this.overrideMontants) return parseFloat(this.loyerOverride) || 0;
      return parseFloat(loc.loyer) || 0;
    },
    get effectiveCharges() {
      const loc = this.selectedLocataire;
      if (!loc) return 0;
      if (this.overrideMontants) return parseFloat(this.chargesOverride) || 0;
      return parseFloat(loc.charges) || 0;
    },
    get effectivePeriodeLabel() {
      if (!this.periodeDebut || !this.periodeFin) return '';
      return formatPeriodFR(this.periodeDebut, this.periodeFin);
    },

    // Libellé humain de l'onglet courant, pour l'annonce aria-live aux lecteurs d'écran.
    get currentTabLabel() {
      const labels = {
        'generate': 'Quittance',
        'depot-garantie': 'Dépôt de garantie',
        'historique': 'Historique',
        'locataires': 'Locataires',
        'patrimoine': 'Patrimoine',
        'configuration': 'Configuration',
      };
      return labels[this.activeTab] || this.activeTab;
    },

    // Locataires rattachés au bailleur sélectionné (via leurs biens).
    get locatairesDuBailleur() {
      const id = this.selectedBailleurId;
      if (!id) return [];
      const bienIds = new Set(this.data.biens.filter((b) => b.bailleurId === id).map((b) => b.id));
      return this.data.locataires.filter((l) => bienIds.has(l.bienId));
    },

    bienById(id) {
      return this.data.biens.find((b) => b.id === id) || null;
    },
    bailleurById(id) {
      return this.data.bailleurs.find((b) => b.id === id) || null;
    },

    biensDuBailleur(bailleurId) {
      return this.data.biens.filter((b) => b.bailleurId === bailleurId);
    },

    // ---------- UI génériques ----------

    syncPeriode() {
      if (this.overridePeriode) return;
      if (!this.moisNum || !this.annee) return;
      const p = defaultPeriod(this.moisNum, this.annee);
      this.periodeDebut = p.debut;
      this.periodeFin = p.fin;
    },

    switchTab(name, { focusPanel = true } = {}) {
      // Si on quitte Configuration alors qu'une frappe est en cours de debounce,
      // on flush pour ne pas perdre l'édition de template en cas de close immédiat.
      if (this.activeTab === 'configuration' && name !== 'configuration') {
        this.flushPendingTemplates();
      }
      this.activeTab = name;
      this.$nextTick(() => {
        if (!focusPanel) return;
        const panel = document.getElementById(`panel-${name}`);
        // preventScroll: on garde le focus (a11y) sans laisser le navigateur
        // faire défiler la page jusqu'au panel — gênant en haut de page mobile.
        if (panel) panel.focus({ preventScroll: true });
      });
    },

    onTabsKey(event) {
      const order = this.tabsOrder;
      const i = order.indexOf(this.activeTab);
      if (i === -1) return;
      let next = null;
      if (event.key === 'ArrowRight') next = order[(i + 1) % order.length];
      else if (event.key === 'ArrowLeft') next = order[(i - 1 + order.length) % order.length];
      else if (event.key === 'Home') next = order[0];
      else if (event.key === 'End') next = order[order.length - 1];
      if (!next) return;
      event.preventDefault();
      if (this.activeTab === 'configuration' && next !== 'configuration') {
        this.flushPendingTemplates();
      }
      this.activeTab = next;
      this.$nextTick(() => {
        const tab = document.getElementById(`tab-${next}`);
        if (tab) tab.focus({ preventScroll: true });
      });
    },

    onSelectLocataire() {
      const loc = this.selectedLocataire;
      if (!loc) {
        this.emailLocataire = '';
        this.modeReglement = '';
        return;
      }
      this.emailLocataire = loc.email || '';
      this.modeReglement = loc.modeReglement || '';
      this.overrideMontants = false;
      this.loyerOverride = '';
      this.chargesOverride = '';
      this.dateEncaissement = '';
    },

    toggleOverrideMontants() {
      if (this.overrideMontants && this.selectedLocataire) {
        this.loyerOverride = this.selectedLocataire.loyer;
        this.chargesOverride = this.selectedLocataire.charges;
      }
    },

    persist() {
      const res = saveData(this.data);
      if (res.ok) return;
      if (res.quotaExceeded) {
        // Le navigateur a refusé l'écriture : le payload courant en mémoire est plus gros
        // que la dernière version persistée. On alerte fortement et on oriente vers l'onglet
        // Configuration où l'utilisateur peut exporter + archiver.
        toast(
          'Stockage saturé : impossible de sauvegarder. Allez dans Configuration pour exporter et archiver.',
          'error',
          8000,
        );
      } else {
        toast('Erreur de sauvegarde locale', 'error');
      }
    },

    // ----- Storage : monitoring & archivage -----

    get storageInfo() {
      // Lecture explicite de `this.data` pour qu'Alpine track ce getter et le re-évalue
      // après chaque mutation (sinon la jauge resterait figée jusqu'au prochain render).
      // eslint-disable-next-line no-unused-expressions
      this.data;
      return getStorageInfo();
    },

    formatBytes(n) {
      if (!n || n < 1024) return `${n || 0} o`;
      const kb = n / 1024;
      if (kb < 1024) return `${kb.toFixed(1)} Ko`;
      return `${(kb / 1024).toFixed(2)} Mo`;
    },

    // Compte les entrées d'historique antérieures à `years` ans (utile pour le bouton d'archivage).
    countHistoriqueOlderThan(years) {
      const cutoff = cutoffYearsAgo(years);
      return this.data.historique.filter((h) => (h?.dateGeneration || '') < cutoff).length;
    },

    // Archive (purge) les entrées d'historique antérieures à `years` ans après confirmation.
    // L'utilisateur est invité à exporter d'abord — l'historique purgé est définitivement perdu
    // côté localStorage (mais préservé dans le JSON exporté avant la purge).
    async archiveAncienHistorique(years = 2) {
      const cutoff = cutoffYearsAgo(years);
      const n = this.countHistoriqueOlderThan(years);
      if (n === 0) {
        toast(`Aucune entrée antérieure à ${years} ans`, 'info');
        return;
      }
      const ok = await confirmDialog({
        title: 'Archiver l’historique ancien',
        message:
          `Supprimer ${n} entrée(s) d'historique antérieure(s) au ${formatDateFR(cutoff)} ? ` +
          `Pensez à exporter vos données AVANT (bouton Exporter en bas) — la purge est définitive.`,
        confirmLabel: 'Archiver',
        danger: true,
      });
      if (!ok) return;
      this.data = buildArchivedCopy(this.data, cutoff);
      const saveRes = saveData(this.data);
      if (!saveRes.ok) {
        toast('Archivage effectué mais sauvegarde refusée. Exportez maintenant.', 'error', 8000);
        return;
      }
      this.dirty = true;
      toast(`${n} entrée(s) archivée(s)`, 'success');
    },

    // ----- Templates d'email -----

    // Liste des placeholders supportés (réexposée pour l'UI Configuration).
    emailPlaceholders: AVAILABLE_PLACEHOLDERS,

    // Restaure une (ou plusieurs) clé(s) de template à leurs valeurs par défaut.
    // On recrée l'objet emailTemplates entier (au lieu d'assigner par index) pour garantir
    // la propagation Alpine vers les textareas bound par x-model. Pas de confirmation
    // (helper interne) — utiliser resetEmailTemplatePair côté UI pour le confirm.
    _resetEmailTemplateKeys(keys) {
      if (!this.data.settings) this.data.settings = { emailTemplates: {} };
      const patch = {};
      for (const k of keys) {
        if (k in DEFAULT_EMAIL_TEMPLATES) patch[k] = DEFAULT_EMAIL_TEMPLATES[k];
      }
      this.data.settings.emailTemplates = {
        ...this.data.settings.emailTemplates,
        ...patch,
      };
      this.persistTemplates();
    },

    // Réinitialise un couple sujet+corps après une seule confirmation utilisateur
    // (évite le double prompt qui découlerait d'enchaîner deux resetEmailTemplate).
    async resetEmailTemplatePair(subjectKey, bodyKey) {
      const tpl = this.data.settings?.emailTemplates || {};
      const isModified =
        (tpl[subjectKey] && tpl[subjectKey] !== DEFAULT_EMAIL_TEMPLATES[subjectKey]) ||
        (tpl[bodyKey] && tpl[bodyKey] !== DEFAULT_EMAIL_TEMPLATES[bodyKey]);
      if (isModified) {
        const ok = await confirmDialog({
          title: 'Réinitialiser ce modèle ?',
          message: 'Le sujet et le corps de ce modèle seront remplacés par les valeurs par défaut. Cette action ne peut pas être annulée.',
          confirmLabel: 'Réinitialiser',
          danger: true,
        });
        if (!ok) return;
      }
      this._resetEmailTemplateKeys([subjectKey, bodyKey]);
    },

    // Persistance debouncée pour les inputs de templates (évite un saveData() à chaque frappe).
    // Le debounce simple ici se contente d'annuler le timer précédent au prochain appel.
    _templatesTimer: null,
    persistTemplates() {
      clearTimeout(this._templatesTimer);
      this._templatesTimer = setTimeout(() => {
        this._templatesTimer = null;
        this.persist();
        this.dirty = true;
      }, 400);
    },
    // Force le flush immédiat si un debounce est pending — appelé quand on quitte Configuration
    // pour ne pas perdre une frappe récente si l'utilisateur ferme/recharge dans la fenêtre 400 ms.
    flushPendingTemplates() {
      if (!this._templatesTimer) return;
      clearTimeout(this._templatesTimer);
      this._templatesTimer = null;
      this.persist();
      this.dirty = true;
    },

    // ---------- CRUD bailleurs ----------

    openCreateBailleur() {
      this.editingBailleur = {
        open: true,
        mode: 'create',
        id: null,
        form: emptyBailleurForm(),
        previousActive: document.activeElement,
      };
      this.$nextTick(() => {
        const el = document.getElementById('edit-bailleur-nom');
        if (el) el.focus();
      });
    },

    openEditBailleur(id) {
      const b = this.bailleurById(id);
      if (!b) return;
      this.editingBailleur = {
        open: true,
        mode: 'edit',
        id,
        form: { ...b },
        previousActive: document.activeElement,
      };
      this.$nextTick(() => {
        const el = document.getElementById('edit-bailleur-nom');
        if (el) el.focus();
      });
    },

    closeBailleurModal() {
      const prev = this.editingBailleur.previousActive;
      this.editingBailleur.open = false;
      this.$nextTick(() => {
        if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus();
      });
    },

    // Mapping des codes d'erreur du module image-upload vers des toasts utilisateur.
    // Le helper pur ne connaît pas le système de toasts, on injecte ce callback à chaque appel.
    _onImageUploadError(reason) {
      if (reason === 'type') toast('Format non supporté (PNG ou JPEG uniquement)', 'error');
      else if (reason === 'size') toast('Image trop volumineuse (max 500 Ko)', 'error', 5000);
      else if (reason === 'read') toast("Impossible de lire l'image", 'error');
    },

    async uploadSignatureImage(event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      const dataUrl = await readImageAsDataUrl(file, (r) => this._onImageUploadError(r));
      if (!dataUrl) return;
      this.editingBailleur.form.signatureImage = dataUrl;
    },

    removeSignatureImage() {
      this.editingBailleur.form.signatureImage = '';
    },

    async uploadLogo(event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      const dataUrl = await readImageAsDataUrl(file, (r) => this._onImageUploadError(r));
      if (!dataUrl) return;
      this.editingBailleur.form.logo = dataUrl;
    },

    removeLogo() {
      this.editingBailleur.form.logo = '';
    },

    saveBailleur() {
      const f = this.editingBailleur.form;
      if (!f.nom?.trim() || !f.adresse?.trim() || !f.ville?.trim() || !f.signature?.trim()) {
        toast('Veuillez remplir tous les champs obligatoires (*)', 'warning');
        return;
      }
      const payload = {
        nom: f.nom.trim(),
        adresse: f.adresse.trim(),
        ville: f.ville.trim(),
        signature: f.signature.trim(),
        signatureActive: typeof f.signatureActive === 'boolean' ? f.signatureActive : true,
        signatureImage: f.signatureImage || '',
        logo: f.logo || '',
        email: (f.email || '').trim(),
        telephone: (f.telephone || '').trim(),
      };
      if (this.editingBailleur.mode === 'create') {
        const id = generateBailleurId();
        this.data.bailleurs.push({ id, ...payload });
        if (this.data.bailleurs.length === 1) this.selectedBailleurId = id;
        toast('Bailleur ajouté', 'success');
      } else {
        const idx = this.data.bailleurs.findIndex((b) => b.id === this.editingBailleur.id);
        if (idx === -1) return;
        this.data.bailleurs[idx] = { id: this.editingBailleur.id, ...payload };
        toast('Bailleur modifié', 'success');
      }
      this.persist();
      this.dirty = true;
      this.closeBailleurModal();
    },

    async deleteBailleur(id) {
      const b = this.bailleurById(id);
      if (!b) return;
      const biens = this.biensDuBailleur(id);
      const bienIds = new Set(biens.map((x) => x.id));
      const locs = this.data.locataires.filter((l) => bienIds.has(l.bienId));
      const ok = await confirmDialog({
        title: 'Supprimer le bailleur',
        message:
          `Supprimer ${b.nom} ?` +
          (biens.length || locs.length
            ? ` Cela supprimera aussi ${biens.length} bien(s) et ${locs.length} locataire(s) rattaché(s). L'historique est conservé.`
            : ''),
        confirmLabel: 'Supprimer',
        danger: true,
      });
      if (!ok) return;
      this.data.locataires = this.data.locataires.filter((l) => !bienIds.has(l.bienId));
      this.data.biens = this.data.biens.filter((x) => x.bailleurId !== id);
      this.data.bailleurs = this.data.bailleurs.filter((x) => x.id !== id);
      if (this.selectedBailleurId === id) this.selectedBailleurId = '';
      if (this.dgSelectedBailleurId === id) this.dgSelectedBailleurId = '';
      if (this.filterBailleurId === id) this.filterBailleurId = '';
      this.persist();
      this.dirty = true;
      toast('Bailleur supprimé', 'success');
    },

    // ---------- CRUD biens ----------

    openCreateBien() {
      if (this.data.bailleurs.length === 0) {
        toast("Créez d'abord un bailleur", 'warning');
        return;
      }
      this.editingBien = {
        open: true,
        mode: 'create',
        id: null,
        form: emptyBienForm(),
        previousActive: document.activeElement,
      };
      this.$nextTick(() => {
        const el = document.getElementById('edit-bien-libelle');
        if (el) el.focus();
      });
    },

    openEditBien(id) {
      const bien = this.bienById(id);
      if (!bien) return;
      this.editingBien = {
        open: true,
        mode: 'edit',
        id,
        form: { ...bien },
        previousActive: document.activeElement,
      };
      this.$nextTick(() => {
        const el = document.getElementById('edit-bien-libelle');
        if (el) el.focus();
      });
    },

    closeBienModal() {
      const prev = this.editingBien.previousActive;
      this.editingBien.open = false;
      this.$nextTick(() => {
        if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus();
      });
    },

    saveBien() {
      const f = this.editingBien.form;
      if (!f.libelle?.trim() || !f.adresse?.trim() || !f.bailleurId) {
        toast('Veuillez remplir tous les champs obligatoires (*)', 'warning');
        return;
      }
      if (!this.bailleurById(f.bailleurId)) {
        toast('Bailleur introuvable', 'error');
        return;
      }
      const payload = {
        bailleurId: f.bailleurId,
        libelle: f.libelle.trim(),
        adresse: f.adresse.trim(),
        type: f.type || 'autre',
        reference: (f.reference || '').trim(),
      };
      if (this.editingBien.mode === 'create') {
        this.data.biens.push({ id: generateBienId(), ...payload });
        toast('Bien ajouté', 'success');
      } else {
        const idx = this.data.biens.findIndex((b) => b.id === this.editingBien.id);
        if (idx === -1) return;
        this.data.biens[idx] = { id: this.editingBien.id, ...payload };
        toast('Bien modifié', 'success');
      }
      this.persist();
      this.dirty = true;
      this.closeBienModal();
    },

    async deleteBien(id) {
      const bien = this.bienById(id);
      if (!bien) return;
      const locs = this.data.locataires.filter((l) => l.bienId === id);
      const ok = await confirmDialog({
        title: 'Supprimer le bien',
        message:
          `Supprimer ${bien.libelle} ?` +
          (locs.length
            ? ` Cela supprimera aussi ${locs.length} locataire(s) rattaché(s). L'historique est conservé.`
            : ''),
        confirmLabel: 'Supprimer',
        danger: true,
      });
      if (!ok) return;
      this.data.locataires = this.data.locataires.filter((l) => l.bienId !== id);
      this.data.biens = this.data.biens.filter((b) => b.id !== id);
      this.persist();
      this.dirty = true;
      toast('Bien supprimé', 'success');
    },

    // ---------- CRUD locataires ----------

    openCreateLocataire() {
      if (this.data.biens.length === 0) {
        toast("Créez d'abord un bien pour rattacher le locataire", 'warning');
        return;
      }
      this.editingLocataire = {
        open: true,
        mode: 'create',
        id: null,
        form: emptyLocataireForm(),
        previousActive: document.activeElement,
      };
      this.$nextTick(() => {
        const input = document.getElementById('edit-nom');
        if (input) input.focus();
      });
    },

    openEditLocataire(id) {
      const loc = this.data.locataires.find((l) => l.id === id);
      if (!loc) return;
      this.editingLocataire = {
        open: true,
        mode: 'edit',
        id,
        form: {
          nom: loc.nom,
          email: loc.email || '',
          bienId: loc.bienId,
          loyer: loc.loyer,
          charges: loc.charges,
          modeReglement: loc.modeReglement || '',
          referenceBail: loc.referenceBail || '',
          coOccupants: loc.coOccupants || '',
          depotGarantie: loc.depotGarantie || 0,
        },
        previousActive: document.activeElement,
      };
      this.$nextTick(() => {
        const input = document.getElementById('edit-nom');
        if (input) input.focus();
      });
    },

    closeLocataireModal() {
      const prev = this.editingLocataire.previousActive;
      this.editingLocataire.open = false;
      this.$nextTick(() => {
        if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus();
      });
    },

    saveLocataire() {
      const f = this.editingLocataire.form;
      if (!f.nom?.trim() || !f.bienId || f.loyer === '' || f.loyer === null) {
        toast('Veuillez remplir tous les champs obligatoires (*)', 'warning');
        return;
      }
      if (!this.bienById(f.bienId)) {
        toast('Bien introuvable', 'error');
        return;
      }
      const payload = {
        bienId: f.bienId,
        nom: f.nom.trim(),
        email: (f.email || '').trim(),
        loyer: parseFloat(f.loyer),
        charges: parseFloat(f.charges) || 0,
        modeReglement: f.modeReglement || '',
        referenceBail: (f.referenceBail || '').trim(),
        coOccupants: (f.coOccupants || '').trim(),
        depotGarantie: parseFloat(f.depotGarantie) || 0,
      };
      if (this.editingLocataire.mode === 'create') {
        this.data.locataires.push({ id: generateLocataireId(), ...payload });
        toast('Locataire ajouté', 'success');
      } else {
        const idx = this.data.locataires.findIndex((l) => l.id === this.editingLocataire.id);
        if (idx === -1) return;
        this.data.locataires[idx] = { id: this.editingLocataire.id, ...payload };
        toast('Locataire modifié', 'success');
      }
      this.persist();
      this.dirty = true;
      this.closeLocataireModal();
    },

    async deleteLocataire(id) {
      const loc = this.data.locataires.find((l) => l.id === id);
      if (!loc) return;
      const ok = await confirmDialog({
        title: 'Supprimer le locataire',
        message: `Êtes-vous sûr de vouloir supprimer ${loc.nom} ? L'historique est conservé.`,
        confirmLabel: 'Supprimer',
        danger: true,
      });
      if (!ok) return;
      this.data.locataires = this.data.locataires.filter((l) => l.id !== id);
      if (this.selectedLocataireId === id) this.selectedLocataireId = '';
      if (this.dgSelectedLocataireId === id) this.dgSelectedLocataireId = '';
      this.persist();
      this.dirty = true;
      toast('Locataire supprimé', 'success');
    },

    // ---------- Génération ----------

    // Validation minimale pour identifier (bailleur, locataire, mois, année) — suffit pour
    // détecter un doublon et proposer la réédition d'une quittance archivée.
    validateBaseSelection() {
      if (!this.selectedBailleurId) {
        toast('Sélectionnez un bailleur', 'warning');
        return false;
      }
      if (!this.selectedLocataireId) {
        toast('Sélectionnez un locataire', 'warning');
        return false;
      }
      if (!this.moisNum || !this.annee) {
        toast('Sélectionnez un mois et une année', 'warning');
        return false;
      }
      return true;
    },

    // Validation complète, requise uniquement pour générer une NOUVELLE quittance. La réédition
    // (à partir d'un snapshot d'historique) ne dépend pas de l'état courant des fiches.
    validateForNewGeneration() {
      const b = this.selectedBailleur;
      if (!b || !b.nom || !b.adresse || !b.ville || !b.signature) {
        toast("Complétez la configuration du bailleur d'abord", 'warning');
        this.switchTab('patrimoine');
        return false;
      }
      const bien = this.selectedBien;
      if (!bien) {
        toast('Bien introuvable pour ce locataire', 'error');
        return false;
      }
      if (this.overridePeriode && this.periodeDebut > this.periodeFin) {
        toast('La date de début doit précéder la date de fin', 'warning');
        return false;
      }
      return true;
    },

    notifyFontFallbackOnce(fontFallback) {
      if (fontFallback && !this.fontFallbackWarned) {
        this.fontFallbackWarned = true;
        toast(
          'Police Inter indisponible (réseau ?). Le PDF utilise la police par défaut.',
          'info',
          5000,
        );
      }
    },

    async buildAndReturn() {
      const bailleur = this.selectedBailleur;
      const bien = this.selectedBien;
      const loc = this.selectedLocataire;
      let loyer = loc.loyer;
      let charges = loc.charges;
      if (this.overrideMontants) {
        loyer = parseFloat(this.loyerOverride) || loyer;
        charges = parseFloat(this.chargesOverride) || charges;
      }
      const numero = nextNumeroQuittance(
        this.data.historique,
        bailleur.id,
        this.moisNum,
        this.annee,
      );
      // Date d'émission figée à l'instant du clic — partagée entre le PDF et l'entrée snapshot
      // d'historique pour que la réédition future donne le même document.
      const dateEmission = new Date().toISOString().slice(0, 10);
      const { buildPDF } = await loadPdfModule();
      const { doc, filename, fontFallback } = await buildPDF({
        bailleur,
        bien,
        locataire: loc,
        moisNum: this.moisNum,
        annee: this.annee,
        loyer,
        charges,
        periodeDebut: this.periodeDebut,
        periodeFin: this.periodeFin,
        modeReglement: this.modeReglement || '',
        dateEncaissement: this.dateEncaissement || '',
        numeroQuittance: numero,
        dateEmission,
      });
      this.notifyFontFallbackOnce(fontFallback);
      return { doc, filename, loyer, charges, numeroQuittance: numero, dateEmission };
    },

    // Helper interne : ouvre le dialogue à 3 choix (Annuler / Nouvelle / Rééditer) commun
    // aux flux quittance et reçu DG. Retourne 'new' | 'reissue' | null.
    // Ordre des choix : du moins primaire au plus primaire (mobile flex-col-reverse pose la
    // primaire en haut, desktop justify-end la pose à droite — alignée au curseur).
    async _askDoublonChoice({ title, message, newLabel, reissueLabel }) {
      const choice = await choiceDialog({
        title,
        message,
        choices: [
          { value: null, label: 'Annuler', variant: 'secondary' },
          { value: 'new', label: newLabel, variant: 'secondary' },
          { value: 'reissue', label: reissueLabel, variant: 'primary', autoFocus: true },
        ],
      });
      return choice;
    },

    // Trois issues possibles :
    //   - { action: 'new' }                     → générer une nouvelle quittance (push historique)
    //   - { action: 'reissue', existing: entry } → rééditer le PDF de l'entrée existante (pas de push)
    //   - null                                  → annulation utilisateur
    async confirmDoublonIfAny() {
      const loc = this.selectedLocataire;
      const doublons = findDoublons(
        this.data.historique,
        this.selectedBailleurId,
        loc.nom,
        this.moisNum,
        this.annee,
      );
      if (doublons.length === 0) return { action: 'new' };
      const dernier = doublons.reduce((acc, h) => (h.dateGeneration > acc.dateGeneration ? h : acc));
      const dateTxt = new Date(dernier.dateGeneration).toLocaleDateString('fr-FR');
      const label = moisTexte(this.moisNum, this.annee);
      const choice = await this._askDoublonChoice({
        title: 'Quittance déjà émise',
        message: `Une quittance pour ${loc.nom} – ${label} a déjà été générée le ${dateTxt}${dernier.numeroQuittance ? ` (${dernier.numeroQuittance})` : ''}. Que souhaitez-vous faire ?`,
        newLabel: '📄 Générer une nouvelle',
        reissueLabel: "🔁 Rééditer l'existante",
      });
      if (choice === 'reissue') return { action: 'reissue', existing: dernier };
      if (choice === 'new') return { action: 'new' };
      return null;
    },

    // Reconstruit un PDF à partir d'un snapshot d'historique (réédition à l'identique, pas de push).
    // Les images (signatureImage, logo) ne sont **pas** snapshottées : on les relit sur le bailleur
    // courant via resolveBailleurForRender. Fallback gracieux si le bailleur a été supprimé.
    async _buildPDFFromEntry(entry) {
      const visuel = resolveBailleurForRender(entry, this.data.bailleurs);
      const bailleurRender = {
        ...entry.bailleur,
        signatureActive: visuel.signatureActive,
        signatureImage: visuel.signatureImage,
        logo: visuel.logo,
      };
      const { buildPDF, buildRecuDGPDF } = await loadPdfModule();
      const isRecu = entry.type === 'recu_dg_entree' || entry.type === 'recu_dg_sortie';
      if (isRecu) {
        const sousType = entry.type === 'recu_dg_entree' ? 'entree' : 'sortie';
        const { doc, filename, fontFallback } = await buildRecuDGPDF({
          sousType,
          bailleur: bailleurRender,
          bien: entry.bien,
          locataire: entry.locataire,
          montantInitial: entry.montantInitial,
          montantRestitue: entry.montantRestitue,
          retenuesTexte: entry.retenuesTexte || '',
          dateEvenement: entry.dateEvenement || '',
          numeroRecu: entry.numeroQuittance || '',
          dateEmission: entry.dateEmission || '',
        });
        this.notifyFontFallbackOnce(fontFallback);
        return { doc, filename };
      }
      const { doc, filename, fontFallback } = await buildPDF({
        bailleur: bailleurRender,
        bien: entry.bien,
        locataire: entry.locataire,
        moisNum: entry.moisNum,
        annee: entry.annee,
        loyer: entry.loyer,
        charges: entry.charges,
        periodeDebut: entry.periodeDebut,
        periodeFin: entry.periodeFin,
        modeReglement: entry.modeReglement || '',
        dateEncaissement: entry.dateEncaissement || '',
        numeroQuittance: entry.numeroQuittance || '',
        dateEmission: entry.dateEmission || '',
      });
      this.notifyFontFallbackOnce(fontFallback);
      return { doc, filename };
    },

    pushHistorique({ loyer, charges, numeroQuittance, dateEmission }) {
      this.data.historique.push(
        buildHistoriqueEntry({
          bailleur: this.selectedBailleur,
          bien: this.selectedBien,
          locataire: this.selectedLocataire,
          moisNum: this.moisNum,
          annee: this.annee,
          loyer,
          charges,
          periodeDebut: this.periodeDebut,
          periodeFin: this.periodeFin,
          modeReglement: this.modeReglement || '',
          dateEncaissement: this.dateEncaissement || '',
          numeroQuittance,
          dateEmission,
        }),
      );
      this.persist();
      // Pas de `this.dirty = true` ici : la génération d'une quittance pousse une entrée
      // dans l'historique (journal append-only) mais ne modifie ni les bailleurs, ni les
      // biens, ni les locataires — l'utilisateur n'a pas besoin d'exporter immédiatement
      // après chaque PDF. La bannière n'apparaît que sur les modifs de patrimoine.
    },

    // Construit le PDF selon la décision du dialogue doublon. Retourne
    // { doc, filename, reissued, bailleur } ou null si l'utilisateur a annulé.
    //
    // - 'new'     → validation complète, génération neuve, push historique. bailleur = courant.
    // - 'reissue' → réédition à partir du snapshot d'historique (pas de validation au-delà
    //               de la sélection, pas de push). bailleur = snapshot (pour cohérence email).
    //
    // Précondition : validateBaseSelection() doit avoir réussi (bailleur+locataire+mois+année).
    async _resolveAndBuild() {
      const decision = await this.confirmDoublonIfAny();
      if (!decision) return null;
      if (decision.action === 'reissue') {
        const { doc, filename } = await this._buildPDFFromEntry(decision.existing);
        return { doc, filename, reissued: true, bailleur: decision.existing.bailleur };
      }
      // 'new' : on valide le reste maintenant — la fiche bailleur courante doit être complète.
      if (!this.validateForNewGeneration()) return null;
      const { doc, filename, loyer, charges, numeroQuittance, dateEmission } = await this.buildAndReturn();
      // On enregistre l'historique AVANT le téléchargement : si le save échoue (rare : quotas
      // navigateur, blocage de download), au moins la trace existe et l'anti-doublon fonctionnera
      // au prochain essai.
      this.pushHistorique({ loyer, charges, numeroQuittance, dateEmission });
      return { doc, filename, reissued: false, bailleur: this.selectedBailleur };
    },

    // Wrap une opération async pour bloquer les boutons de génération pendant son exécution.
    // Les 3 flows PDF (generatePDF, generateRecuDG, regenererPDF) passent par ici pour
    // éviter qu'un double-clic ne génère deux PDF (et deux entrées historique avec des
    // numéros incrémentés). Les boutons « Préparer l'email » n'ont pas besoin de lock :
    // ils n'écrivent rien et l'ouverture du mailto est instantanée.
    // Reset garanti via try/finally.
    async _withBusy(fn) {
      if (this._busy) return null;
      this._busy = true;
      try {
        return await fn();
      } finally {
        this._busy = false;
      }
    },

    async generatePDF() {
      if (!this.validateBaseSelection()) return;
      await this._withBusy(async () => {
        const built = await this._resolveAndBuild();
        if (!built) return;
        built.doc.save(built.filename);
        toast(built.reissued ? 'PDF réédité' : 'Quittance téléchargée', 'success');
      });
    },

    // V2.3.x : « Préparer l'email » ne génère plus le PDF (séparation des flows).
    // Précondition : l'utilisateur doit avoir téléchargé le PDF d'abord (entrée historique
    // présente). Sinon on l'oriente vers le bouton Télécharger via un toast — sans ouvrir
    // le mailto pour éviter un email sans pièce jointe correspondante.
    // La signature email vient du snapshot historique (cohérent avec le PDF déjà téléchargé,
    // même si la fiche bailleur a évolué depuis).
    generateAndEmail() {
      if (!this.validateBaseSelection()) return;
      const loc = this.selectedLocataire;
      const doublons = findDoublons(
        this.data.historique,
        this.selectedBailleurId,
        loc.nom,
        this.moisNum,
        this.annee,
      );
      if (doublons.length === 0) {
        toast(
          'Téléchargez d\'abord le PDF avec « Télécharger la quittance », puis revenez préparer l\'email.',
          'warning',
          6000,
        );
        return;
      }
      // On utilise le snapshot le plus récent (cohérent avec le PDF téléchargé en dernier).
      const dernier = doublons.reduce((acc, h) => (h.dateGeneration > acc.dateGeneration ? h : acc));
      const dest = (this.emailLocataire || loc.email || '').trim();
      const label = moisTexte(this.moisNum, this.annee);
      const vars = {
        locataire: loc.nom || '',
        mois: label,
        annee: this.annee || '',
        bailleur: dernier.bailleur?.nom || '',
        signature: dernier.bailleur?.signature || '',
      };
      const tpl = this.data.settings?.emailTemplates || {};
      const sujet = renderTemplate(tpl.quittanceSubject || DEFAULT_EMAIL_TEMPLATES.quittanceSubject, vars);
      const corps = renderTemplate(tpl.quittanceBody || DEFAULT_EMAIL_TEMPLATES.quittanceBody, vars);
      const mailto = `mailto:${dest}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
      window.location.href = mailto;
      toast("Email préparé. Attachez le PDF déjà téléchargé.", 'info', 6000);
    },

    // ----- Dépôt de garantie -----

    get dgSelectedBailleur() {
      if (!this.dgSelectedBailleurId) return null;
      return this.data.bailleurs.find((b) => b.id === this.dgSelectedBailleurId) || null;
    },

    get dgSelectedLocataire() {
      if (!this.dgSelectedLocataireId) return null;
      return this.data.locataires.find((l) => l.id === this.dgSelectedLocataireId) || null;
    },

    get dgSelectedBien() {
      const loc = this.dgSelectedLocataire;
      if (!loc) return null;
      return this.data.biens.find((b) => b.id === loc.bienId) || null;
    },

    get dgLocatairesDuBailleur() {
      const id = this.dgSelectedBailleurId;
      if (!id) return [];
      const bienIds = new Set(this.data.biens.filter((b) => b.bailleurId === id).map((b) => b.id));
      return this.data.locataires.filter((l) => bienIds.has(l.bienId));
    },

    // Montants effectifs du reçu DG (parsing défensif sur l'entrée user).
    // Utilisés par l'aperçu temps réel sur l'onglet Dépôt de garantie.
    get dgEffectiveMontantInitial() {
      return parseFloat(this.dgMontantInitial) || 0;
    },
    get dgEffectiveMontantRestitue() {
      return parseFloat(this.dgMontantRestitue) || 0;
    },
    get dgEffectiveRetenu() {
      return Math.max(0, this.dgEffectiveMontantInitial - this.dgEffectiveMontantRestitue);
    },

    // Pré-remplit montant initial depuis la fiche locataire au changement de sélection.
    // Reset aussi les champs transients (retenues texte, date événement) pour éviter de
    // polluer le reçu du locataire suivant avec les saisies du précédent.
    onDgSelectLocataire() {
      this.dgRetenuesTexte = '';
      this.dgDateEvenement = '';
      const loc = this.dgSelectedLocataire;
      if (!loc) {
        this.dgMontantInitial = '';
        this.dgMontantRestitue = '';
        return;
      }
      const dg = Number(loc.depotGarantie) || 0;
      this.dgMontantInitial = dg ? String(dg) : '';
      this.dgMontantRestitue = dg ? String(dg) : '';
    },

    validateDGSelection() {
      if (!this.dgSelectedBailleurId) {
        toast('Sélectionnez un bailleur', 'warning');
        return false;
      }
      if (!this.dgSelectedLocataireId) {
        toast('Sélectionnez un locataire', 'warning');
        return false;
      }
      const b = this.dgSelectedBailleur;
      if (!b || !b.nom || !b.adresse || !b.ville || !b.signature) {
        toast("Complétez la configuration du bailleur d'abord", 'warning');
        this.switchTab('patrimoine');
        return false;
      }
      if (!this.dgSelectedBien) {
        toast('Bien introuvable pour ce locataire', 'error');
        return false;
      }
      const mi = parseFloat(this.dgMontantInitial);
      if (!(mi > 0)) {
        toast('Renseignez le montant du dépôt de garantie', 'warning');
        return false;
      }
      if (this.dgSousType === 'sortie') {
        const mr = parseFloat(this.dgMontantRestitue);
        if (Number.isNaN(mr) || mr < 0) {
          toast('Renseignez le montant restitué', 'warning');
          return false;
        }
        if (mr > mi) {
          toast('Le montant restitué ne peut pas dépasser le dépôt initial', 'warning');
          return false;
        }
      }
      return true;
    },

    async _confirmDoublonRecuIfAny() {
      const loc = this.dgSelectedLocataire;
      const doublons = findDoublonsRecu(
        this.data.historique,
        this.dgSelectedBailleurId,
        loc.nom,
        this.dgSousType,
      );
      if (doublons.length === 0) return { action: 'new' };
      const dernier = doublons.reduce((acc, h) => (h.dateGeneration > acc.dateGeneration ? h : acc));
      const dateTxt = new Date(dernier.dateGeneration).toLocaleDateString('fr-FR');
      const sousTypeLabel = this.dgSousType === 'entree' ? "d'encaissement" : 'de restitution';
      const choice = await this._askDoublonChoice({
        title: 'Reçu déjà émis',
        message: `Un reçu de dépôt de garantie ${sousTypeLabel} pour ${loc.nom} a déjà été généré le ${dateTxt}${dernier.numeroQuittance ? ` (${dernier.numeroQuittance})` : ''}. Que souhaitez-vous faire ?`,
        newLabel: '📄 Générer un nouveau',
        reissueLabel: "🔁 Rééditer l'existant",
      });
      if (choice === 'reissue') return { action: 'reissue', existing: dernier };
      if (choice === 'new') return { action: 'new' };
      return null;
    },

    // Pipeline commun aux deux flows DG (download seul / download + email). Renvoie
    // { doc, filename, sousType, bailleur, locataire, reissued } ou null si annulé.
    // - 'reissue' : régénère depuis le snapshot historique, pas de push.
    // - 'new'     : génère un PDF neuf, push historique, persiste.
    async _resolveAndBuildRecuDG() {
      if (!this.validateDGSelection()) return null;
      const decision = await this._confirmDoublonRecuIfAny();
      if (!decision) return null;
      const sousType = this.dgSousType;
      if (decision.action === 'reissue') {
        try {
          const { doc, filename } = await this._buildPDFFromEntry(decision.existing);
          return {
            doc,
            filename,
            sousType: decision.existing.type === 'recu_dg_entree' ? 'entree' : 'sortie',
            bailleur: decision.existing.bailleur,
            locataire: decision.existing.locataire,
            dateEvenement: decision.existing.dateEvenement || '',
            reissued: true,
          };
        } catch (err) {
          console.error(err);
          toast('Impossible de rééditer ce reçu', 'error');
          return null;
        }
      }

      const bailleur = this.dgSelectedBailleur;
      const bien = this.dgSelectedBien;
      const loc = this.dgSelectedLocataire;
      const dateEvenement = this.dgDateEvenement || new Date().toISOString().slice(0, 10);
      const annee = dateEvenement.slice(0, 4);
      const numero = nextNumeroRecu(this.data.historique, bailleur.id, annee, sousType);
      const dateEmission = new Date().toISOString().slice(0, 10);
      const montantInitial = parseFloat(this.dgMontantInitial) || 0;
      const montantRestitue =
        sousType === 'sortie' ? parseFloat(this.dgMontantRestitue) || 0 : 0;
      const retenuesTexte = sousType === 'sortie' ? this.dgRetenuesTexte || '' : '';

      try {
        const { buildRecuDGPDF } = await loadPdfModule();
        const { doc, filename, fontFallback } = await buildRecuDGPDF({
          sousType,
          bailleur,
          bien,
          locataire: loc,
          montantInitial,
          montantRestitue,
          retenuesTexte,
          dateEvenement,
          numeroRecu: numero,
          dateEmission,
        });
        this.notifyFontFallbackOnce(fontFallback);

        // Push historique AVANT téléchargement (cohérent avec generateAndEmail/generatePDF).
        this.data.historique.push(
          buildHistoriqueRecuEntry({
            sousType,
            bailleur,
            bien,
            locataire: loc,
            montantInitial,
            montantRestitue,
            retenuesTexte,
            dateEvenement,
            numeroRecu: numero,
            dateEmission,
          }),
        );
        this.persist();
        // Pas de `this.dirty = true` ici : même logique que pour les quittances — la
        // génération d'un reçu DG ne modifie pas le patrimoine, juste le journal historique.
        return { doc, filename, sousType, bailleur, locataire: loc, dateEvenement, reissued: false };
      } catch (err) {
        console.error(err);
        toast('Erreur lors de la génération du reçu', 'error');
        return null;
      }
    },

    async generateRecuDG() {
      await this._withBusy(async () => {
        const built = await this._resolveAndBuildRecuDG();
        if (!built) return;
        built.doc.save(built.filename);
        const msg = built.reissued
          ? 'Reçu réédité'
          : built.sousType === 'entree'
            ? 'Reçu DG téléchargé'
            : 'Reçu de restitution téléchargé';
        toast(msg, 'success');
      });
    },

    // V2.3.x : symétrique à generateAndEmail — on ne génère plus le PDF ici, on exige
    // qu'il ait été téléchargé d'abord (entrée d'historique correspondante en place).
    // Validation minimale : bailleur + locataire + sousType. Le snapshot historique
    // fournit ensuite le bailleur (signature) et la date d'événement (mois/année).
    generateRecuDGAndEmail() {
      if (!this.dgSelectedBailleurId) {
        toast('Sélectionnez un bailleur', 'warning');
        return;
      }
      if (!this.dgSelectedLocataireId) {
        toast('Sélectionnez un locataire', 'warning');
        return;
      }
      const loc = this.dgSelectedLocataire;
      const doublons = findDoublonsRecu(
        this.data.historique,
        this.dgSelectedBailleurId,
        loc.nom,
        this.dgSousType,
      );
      if (doublons.length === 0) {
        toast(
          'Téléchargez d\'abord le PDF avec « Télécharger le reçu », puis revenez préparer l\'email.',
          'warning',
          6000,
        );
        return;
      }
      const dernier = doublons.reduce((acc, h) => (h.dateGeneration > acc.dateGeneration ? h : acc));
      const dest = (loc.email || '').trim();
      const tpl = this.data.settings?.emailTemplates || {};
      // L'année du reçu DG = celle de l'événement (encaissement ou restitution), récupérée
      // du snapshot — pas l'année courante : un reçu daté du passé doit afficher la bonne
      // année dans l'email aussi.
      const anneeEvt = (dernier.dateEvenement || '').slice(0, 4) || new Date().getFullYear().toString();
      const moisEvt = dernier.dateEvenement
        ? moisTexte(dernier.dateEvenement.slice(5, 7), dernier.dateEvenement.slice(0, 4))
        : '';
      const vars = {
        locataire: loc.nom || '',
        mois: moisEvt,
        annee: anneeEvt,
        bailleur: dernier.bailleur?.nom || '',
        signature: dernier.bailleur?.signature || '',
      };
      const subjectKey = this.dgSousType === 'entree' ? 'dgEntreeSubject' : 'dgSortieSubject';
      const bodyKey = this.dgSousType === 'entree' ? 'dgEntreeBody' : 'dgSortieBody';
      const sujet = renderTemplate(tpl[subjectKey] || DEFAULT_EMAIL_TEMPLATES[subjectKey], vars);
      const corps = renderTemplate(tpl[bodyKey] || DEFAULT_EMAIL_TEMPLATES[bodyKey], vars);
      const mailto = `mailto:${dest}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
      window.location.href = mailto;
      toast("Email préparé. Attachez le PDF déjà téléchargé.", 'info', 6000);
    },

    // ----- Historique -----

    get filteredHistorique() {
      return filterAndSort(this.data.historique, {
        locataireNom: this.filterLocataire,
        annee: this.filterAnnee,
        bailleurId: this.filterBailleurId,
        bienLibelle: this.filterBienLibelle,
        type: this.filterType,
      });
    },

    // Les dropdowns de filtres cascadent : bailleur → bien → locataire.
    // Sélectionner un bailleur réduit la liste des biens à ceux qui apparaissent dans son historique, etc.
    // Les années restent globales (axe temporel orthogonal).
    // Perf : ces getters Alpine sont re-évalués à chaque render. Sur 1000 entries c'est ~2 ms,
    // négligeable. Si on dépasse 5000 entries un jour, memoiser via un cache invalidé sur la
    // longueur de this.data.historique.
    get _historiqueDansBailleur() {
      if (!this.filterBailleurId) return this.data.historique;
      return this.data.historique.filter((h) => h.bailleurId === this.filterBailleurId);
    },

    get _historiqueDansBien() {
      const base = this._historiqueDansBailleur;
      if (!this.filterBienLibelle) return base;
      return base.filter((h) => (h.bien?.libelle || '') === this.filterBienLibelle);
    },

    get historiqueBiens() {
      return listeFiltreBiens(this._historiqueDansBailleur);
    },

    get historiqueLocataires() {
      return listeFiltreLocataires(this._historiqueDansBien);
    },

    get historiqueAnnees() {
      return listeFiltreAnnees(this.data.historique);
    },

    resetFiltresHistorique() {
      this.filterLocataire = '';
      this.filterAnnee = '';
      this.filterBailleurId = '';
      this.filterBienLibelle = '';
      this.filterType = '';
    },

    async regenererPDF(entry) {
      await this._withBusy(async () => {
        try {
          const { doc, filename } = await this._buildPDFFromEntry(entry);
          doc.save(filename);
          toast('PDF regénéré', 'success');
        } catch (err) {
          console.error(err);
          toast('Impossible de regénérer ce PDF', 'error');
        }
      });
    },

    async supprimerEntreeHistorique(id) {
      const idx = this.data.historique.findIndex((h) => h.id === id);
      if (idx === -1) return;
      const entry = this.data.historique[idx];
      const nom = entry.locataire?.nom || '';
      let label;
      let docType;
      if (entry.type === 'recu_dg_entree') {
        label = `${nom} – Dépôt de garantie (entrée ${entry.annee || ''})`;
        docType = 'reçu de dépôt de garantie';
      } else if (entry.type === 'recu_dg_sortie') {
        label = `${nom} – Restitution dépôt de garantie (${entry.annee || ''})`;
        docType = 'reçu de restitution';
      } else {
        label = `${nom} – ${moisTexte(entry.moisNum, entry.annee)}`;
        docType = 'quittance';
      }
      const ok = await confirmDialog({
        title: "Supprimer l'entrée d'historique",
        message: `Supprimer la trace du ${docType} « ${label} » ? Le PDF déjà téléchargé/envoyé n'est pas affecté.`,
        confirmLabel: 'Supprimer',
        danger: true,
      });
      if (!ok) return;
      this.data.historique.splice(idx, 1);
      this.persist();
      // Pas de `this.dirty = true` ici : cohérent avec la position « historique = journal,
      // pas patrimoine ». L'utilisateur vient de confirmer une suppression explicite ; pas
      // besoin de lui rappeler d'exporter.
      toast('Entrée supprimée', 'success');
    },

    async exportHistoriqueXlsx() {
      if (this.data.historique.length === 0) {
        toast('Aucune entrée à exporter', 'warning');
        return;
      }
      try {
        const { exportHistoriqueXlsx } = await import('./lib/xlsx-export.js');
        await exportHistoriqueXlsx(this.filteredHistorique);
        toast('Export XLSX téléchargé', 'success');
      } catch (err) {
        console.error(err);
        toast("Erreur lors de l'export XLSX", 'error');
      }
    },

    // Helpers d'affichage (réexposés pour l'UI Alpine — sinon les imports JS ne sont pas
    // accessibles depuis les expressions x-text/x-show du template).
    formatDateFR,

    formatPeriodeAffichee(entry) {
      return formatPeriodFR(entry.periodeDebut, entry.periodeFin);
    },

    formatDateGeneration(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR');
    },

    formatMoisEntry(entry) {
      if (entry.type === 'recu_dg_entree') {
        return `DG – Entrée${entry.annee ? ` ${entry.annee}` : ''}`;
      }
      if (entry.type === 'recu_dg_sortie') {
        return `DG – Restitution${entry.annee ? ` ${entry.annee}` : ''}`;
      }
      return moisTexte(entry.moisNum, entry.annee);
    },

    isQuittanceEntry(entry) {
      const t = entry?.type || 'quittance';
      return t === 'quittance';
    },

    isRecuDGEntry(entry) {
      return entry?.type === 'recu_dg_entree' || entry?.type === 'recu_dg_sortie';
    },

    labelTypeEntry(entry) {
      if (entry?.type === 'recu_dg_entree') return 'Reçu DG (entrée)';
      if (entry?.type === 'recu_dg_sortie') return 'Reçu DG (sortie)';
      return 'Quittance';
    },

    formatDateEncaissementEntry(entry) {
      return entry.dateEncaissement ? formatDateFR(entry.dateEncaissement) : '';
    },

    exportData() {
      const blob = new Blob([JSON.stringify(this.data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `quittances_backup_${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.dirty = false;
      toast('Export téléchargé', 'success');
    },

    async importData(event) {
      const file = event.target.files[0];
      if (!file) return;
      const text = await file.text();
      event.target.value = '';
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        toast('Fichier JSON invalide', 'error');
        return;
      }
      let parsed;
      try {
        parsed = parseImport(raw);
      } catch (err) {
        console.warn(err);
        // Surface le premier message d'erreur Zod (ex: « Bien X référence un bailleur inexistant »,
        // « Number must be greater than or equal to 0 ») plutôt qu'un générique.
        const detail = err?.issues?.[0]?.message;
        toast(detail ? `Import refusé : ${detail}` : 'Format de données non reconnu', 'error', 6000);
        return;
      }
      const ok = await confirmDialog({
        title: "Confirmer l'import",
        message: `Cela remplacera vos données actuelles (${this.data.bailleurs.length} bailleur(s), ${this.data.locataires.length} locataire(s)) par ${parsed.bailleurs.length} bailleur(s) et ${parsed.locataires.length} locataire(s) importé(s). Continuer ?`,
        confirmLabel: 'Importer',
      });
      if (!ok) return;
      this.data = parsed;
      const soloId = parsed.bailleurs.length === 1 ? parsed.bailleurs[0].id : '';
      this.selectedBailleurId = soloId;
      this.selectedLocataireId = '';
      this.dgSelectedBailleurId = soloId;
      this.dgSelectedLocataireId = '';
      this.persist();
      this.dirty = false;
      this.resetFiltresHistorique();
      toast('Données importées', 'success');
    },
  };
}

