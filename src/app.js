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
import { buildPDF, buildRecuDGPDF } from './lib/pdf.js';
import { defaultPeriod, formatPeriodFR } from './lib/period.js';
import { moisTexte, formatDateFR } from './lib/format.js';
import { toast, confirmDialog, choiceDialog } from './lib/toast.js';
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

    tabsOrder: ['generate', 'depot-garantie', 'historique', 'locataires', 'patrimoine', 'configuration'],

    // Indique que des données ont été modifiées depuis le dernier export.
    // Persiste en mémoire uniquement : un refresh remet à false (l'utilisateur a vécu le risque consciemment).
    dirty: false,

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
        if (panel) panel.focus();
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
        if (tab) tab.focus();
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

    // Restaure une clé de template à sa valeur par défaut.
    // Ex: resetEmailTemplate('quittanceSubject') → remet "Quittance de loyer - {mois} {annee}".
    // On recrée l'objet emailTemplates entier (au lieu d'assigner par index) pour garantir
    // la propagation Alpine vers les textareas bound par x-model.
    resetEmailTemplate(key) {
      if (!(key in DEFAULT_EMAIL_TEMPLATES)) return;
      if (!this.data.settings) this.data.settings = { emailTemplates: {} };
      this.data.settings.emailTemplates = {
        ...this.data.settings.emailTemplates,
        [key]: DEFAULT_EMAIL_TEMPLATES[key],
      };
      this.persistTemplates();
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

    // Lecture d'une image (PNG ou JPEG) depuis un <input type="file"> vers une dataURL base64.
    // Limite : 500 Ko avant base64 — au-delà, on rejette (le localStorage est plafonné ~5 Mo
    // et plusieurs bailleurs × image peuvent vite saturer). Renvoie la dataURL ou null si rejet.
    async _readImageAsDataUrl(file) {
      const MAX_BYTES = 500 * 1024;
      if (!file) return null;
      if (!/^image\/(png|jpeg|jpg)$/i.test(file.type)) {
        toast('Format non supporté (PNG ou JPEG uniquement)', 'error');
        return null;
      }
      if (file.size > MAX_BYTES) {
        toast('Image trop volumineuse (max 500 Ko)', 'error', 5000);
        return null;
      }
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => {
          toast("Impossible de lire l'image", 'error');
          resolve(null);
        };
        reader.readAsDataURL(file);
      });
    },

    async uploadSignatureImage(event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      const dataUrl = await this._readImageAsDataUrl(file);
      if (!dataUrl) return;
      this.editingBailleur.form.signatureImage = dataUrl;
    },

    removeSignatureImage() {
      this.editingBailleur.form.signatureImage = '';
    },

    async uploadLogo(event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      const dataUrl = await this._readImageAsDataUrl(file);
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
      // Ordre DOM = du moins primaire au plus primaire.
      // En mobile (flex-col-reverse) → reissue en haut, cancel en bas.
      // En desktop (flex-row + justify-end) → cancel à gauche, reissue à droite (alignée au curseur).
      const choice = await choiceDialog({
        title: 'Quittance déjà émise',
        message: `Une quittance pour ${loc.nom} – ${label} a déjà été générée le ${dateTxt}${dernier.numeroQuittance ? ` (${dernier.numeroQuittance})` : ''}. Que souhaitez-vous faire ?`,
        choices: [
          { value: null, label: 'Annuler', variant: 'secondary' },
          { value: 'new', label: '📄 Générer une nouvelle', variant: 'secondary' },
          { value: 'reissue', label: "🔁 Rééditer l'existante", variant: 'primary', autoFocus: true },
        ],
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
      this.dirty = true;
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

    async generatePDF() {
      if (!this.validateBaseSelection()) return;
      const built = await this._resolveAndBuild();
      if (!built) return;
      built.doc.save(built.filename);
      toast(built.reissued ? 'PDF réédité' : 'Quittance téléchargée', 'success');
    },

    async generateAndEmail() {
      if (!this.validateBaseSelection()) return;
      const built = await this._resolveAndBuild();
      if (!built) return;

      const blob = built.doc.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = built.filename;
      a.click();
      URL.revokeObjectURL(url);

      const loc = this.selectedLocataire;
      const dest = (this.emailLocataire || loc.email || '').trim();
      const label = moisTexte(this.moisNum, this.annee);
      // En réédition, on signe avec le bailleur du snapshot — l'email reste cohérent avec le PDF
      // joint, même si la fiche bailleur a changé entre-temps.
      const vars = {
        locataire: loc.nom || '',
        mois: label,
        annee: this.annee || '',
        bailleur: built.bailleur.nom || '',
        signature: built.bailleur.signature || '',
      };
      const tpl = this.data.settings?.emailTemplates || {};
      const sujet = renderTemplate(tpl.quittanceSubject || DEFAULT_EMAIL_TEMPLATES.quittanceSubject, vars);
      const corps = renderTemplate(tpl.quittanceBody || DEFAULT_EMAIL_TEMPLATES.quittanceBody, vars);
      const mailto = `mailto:${dest}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
      window.location.href = mailto;
      toast("PDF téléchargé. Pensez à l'attacher à l'email.", 'info', 6000);
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
      const choice = await choiceDialog({
        title: 'Reçu déjà émis',
        message: `Un reçu de dépôt de garantie ${sousTypeLabel} pour ${loc.nom} a déjà été généré le ${dateTxt}${dernier.numeroQuittance ? ` (${dernier.numeroQuittance})` : ''}. Que souhaitez-vous faire ?`,
        choices: [
          { value: null, label: 'Annuler', variant: 'secondary' },
          { value: 'new', label: '📄 Générer un nouveau', variant: 'secondary' },
          { value: 'reissue', label: "🔁 Rééditer l'existant", variant: 'primary', autoFocus: true },
        ],
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
        this.dirty = true;
        return { doc, filename, sousType, bailleur, locataire: loc, dateEvenement, reissued: false };
      } catch (err) {
        console.error(err);
        toast('Erreur lors de la génération du reçu', 'error');
        return null;
      }
    },

    async generateRecuDG() {
      const built = await this._resolveAndBuildRecuDG();
      if (!built) return;
      built.doc.save(built.filename);
      const msg = built.reissued
        ? 'Reçu réédité'
        : built.sousType === 'entree'
          ? 'Reçu DG téléchargé'
          : 'Reçu de restitution téléchargé';
      toast(msg, 'success');
    },

    async generateRecuDGAndEmail() {
      const built = await this._resolveAndBuildRecuDG();
      if (!built) return;

      const blob = built.doc.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = built.filename;
      a.click();
      URL.revokeObjectURL(url);

      const loc = built.locataire || {};
      const dest = (loc.email || '').trim();
      const tpl = this.data.settings?.emailTemplates || {};
      // L'année du reçu DG = celle de l'événement (encaissement ou restitution), pas l'année
      // courante : un reçu daté du passé doit afficher la bonne année dans l'email aussi.
      const anneeEvt = (built.dateEvenement || '').slice(0, 4) || new Date().getFullYear().toString();
      const vars = {
        locataire: loc.nom || '',
        mois: '',
        annee: anneeEvt,
        bailleur: built.bailleur?.nom || '',
        signature: built.bailleur?.signature || '',
      };
      const subjectKey = built.sousType === 'entree' ? 'dgEntreeSubject' : 'dgSortieSubject';
      const bodyKey = built.sousType === 'entree' ? 'dgEntreeBody' : 'dgSortieBody';
      const sujet = renderTemplate(tpl[subjectKey] || DEFAULT_EMAIL_TEMPLATES[subjectKey], vars);
      const corps = renderTemplate(tpl[bodyKey] || DEFAULT_EMAIL_TEMPLATES[bodyKey], vars);
      const mailto = `mailto:${dest}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
      window.location.href = mailto;
      toast("PDF téléchargé. Pensez à l'attacher à l'email.", 'info', 6000);
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
      try {
        const { doc, filename } = await this._buildPDFFromEntry(entry);
        doc.save(filename);
        toast('PDF regénéré', 'success');
      } catch (err) {
        console.error(err);
        toast('Impossible de regénérer ce PDF', 'error');
      }
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
      this.dirty = true;
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

    // Helpers d'affichage pour l'historique
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

function emptyLocataireForm() {
  return {
    nom: '',
    email: '',
    bienId: '',
    loyer: '',
    charges: '',
    modeReglement: '',
    referenceBail: '',
    coOccupants: '',
    depotGarantie: 0,
  };
}

function emptyBailleurForm() {
  return {
    nom: '',
    adresse: '',
    ville: '',
    signature: '',
    signatureActive: true,
    signatureImage: '',
    logo: '',
    email: '',
    telephone: '',
  };
}

function emptyBienForm() {
  return {
    bailleurId: '',
    libelle: '',
    adresse: '',
    type: 'autre',
    reference: '',
  };
}
