import { loadData, saveData } from './lib/storage.js';
import {
  emptyData,
  parseImport,
  MODES_REGLEMENT,
  TYPES_BIEN,
  generateBailleurId,
  generateBienId,
  generateLocataireId,
} from './lib/schema.js';
import { buildPDF } from './lib/pdf.js';
import { defaultPeriod, formatPeriodFR } from './lib/period.js';
import { moisTexte, formatDateFR } from './lib/format.js';
import { toast, confirmDialog, choiceDialog } from './lib/toast.js';
import {
  buildHistoriqueEntry,
  findDoublons,
  filterAndSort,
  listeFiltreLocataires,
  listeFiltreAnnees,
  listeFiltreBiens,
  nextNumeroQuittance,
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

    // Indique si on a déjà averti l'utilisateur du fallback police (Inter indisponible).
    // Volontairement non persisté : un refresh remet à zéro.
    fontFallbackWarned: false,

    tabsOrder: ['generate', 'historique', 'locataires', 'patrimoine'],

    // Indique que des données ont été modifiées depuis le dernier export.
    // Persiste en mémoire uniquement : un refresh remet à false (l'utilisateur a vécu le risque consciemment).
    dirty: false,

    init() {
      this.data = loadData();

      // Auto-sélection si un seul bailleur existe.
      if (this.data.bailleurs.length === 1) {
        this.selectedBailleurId = this.data.bailleurs[0].id;
      }

      this.$watch('moisNum', () => this.syncPeriode());
      this.$watch('annee', () => this.syncPeriode());
      this.$watch('overridePeriode', (val) => {
        if (!val) this.syncPeriode();
      });
      // Quand on change de bailleur, on réinitialise le locataire sélectionné.
      this.$watch('selectedBailleurId', () => {
        this.selectedLocataireId = '';
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
      if (!saveData(this.data)) {
        toast('Erreur de sauvegarde locale', 'error');
      }
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
    async _buildPDFFromEntry(entry) {
      const { doc, filename, fontFallback } = await buildPDF({
        bailleur: entry.bailleur,
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
      const sujet = `Quittance de loyer - ${label}`;
      // En réédition, on signe avec le bailleur du snapshot — l'email reste cohérent avec le PDF
      // joint, même si la fiche bailleur a changé entre-temps.
      const corps = `Bonjour,\n\nVeuillez trouver ci-joint la quittance de loyer pour le mois de ${label}.\n\nCordialement,\n${built.bailleur.signature}`;
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
      const label = `${entry.locataire?.nom || ''} – ${moisTexte(entry.moisNum, entry.annee)}`;
      const ok = await confirmDialog({
        title: "Supprimer l'entrée d'historique",
        message: `Supprimer la trace de la quittance « ${label} » ? Le PDF déjà téléchargé/envoyé n'est pas affecté.`,
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
      return moisTexte(entry.moisNum, entry.annee);
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
      this.selectedBailleurId = parsed.bailleurs.length === 1 ? parsed.bailleurs[0].id : '';
      this.selectedLocataireId = '';
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
  };
}

function emptyBailleurForm() {
  return {
    nom: '',
    adresse: '',
    ville: '',
    signature: '',
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
