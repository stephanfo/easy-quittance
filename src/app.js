import { loadData, saveData } from './lib/storage.js';
import { emptyData, parseImport, MODES_REGLEMENT } from './lib/schema.js';
import { buildPDF } from './lib/pdf.js';
import { defaultPeriod, formatPeriodFR } from './lib/period.js';
import { moisTexte, formatDateFR } from './lib/format.js';
import { toast, confirmDialog } from './lib/toast.js';
import {
  buildHistoriqueEntry,
  findDoublons,
  filterAndSort,
  listeFiltreLocataires,
  listeFiltreAnnees,
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
  return {
    moisOptions: MOIS_OPTIONS,
    modesReglement: MODES_REGLEMENT,
    anneeOptions: [],
    data: emptyData(),
    activeTab: 'generate',

    // Génération
    selectedLocataireIdx: '',
    moisNum: '',
    annee: '',
    overridePeriode: false,
    periodeDebut: '',
    periodeFin: '',
    overrideMontants: false,
    loyerOverride: '',
    chargesOverride: '',
    modeReglement: '',
    dateEncaissement: '',
    emailLocataire: '',

    // Ajout locataire
    addForm: emptyLocataireForm(),

    // Édition locataire (previousActive : élément à refocus à la fermeture)
    editing: { open: false, index: -1, form: emptyLocataireForm(), previousActive: null },

    // Filtres de l'onglet Historique
    filterLocataire: '',
    filterAnnee: '',

    // Indique si on a déjà averti l'utilisateur du fallback police (Inter indisponible).
    // Volontairement non persisté : un refresh remet à zéro.
    fontFallbackWarned: false,

    tabsOrder: ['generate', 'locataires', 'historique', 'config'],

    // Indique que des données ont été modifiées depuis le dernier export.
    // Persiste en mémoire uniquement : un refresh remet à false (l'utilisateur a vécu le risque consciemment).
    dirty: false,

    init() {
      this.data = loadData();

      const currentYear = new Date().getFullYear();
      for (let y = currentYear - 5; y <= currentYear + 2; y++) {
        this.anneeOptions.push(y);
      }
      const today = new Date();
      this.moisNum = String(today.getMonth() + 1).padStart(2, '0');
      this.annee = String(currentYear);
      this.syncPeriode();

      this.$watch('moisNum', () => this.syncPeriode());
      this.$watch('annee', () => this.syncPeriode());
      this.$watch('overridePeriode', (val) => {
        if (!val) this.syncPeriode();
      });
    },

    get selectedLocataire() {
      if (this.selectedLocataireIdx === '') return null;
      return this.data.locataires[this.selectedLocataireIdx] || null;
    },

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
      if (!loc) return;
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

    addLocataire() {
      const f = this.addForm;
      if (!f.nom.trim() || !f.adresse.trim() || f.loyer === '' || f.loyer === null) {
        toast('Veuillez remplir tous les champs obligatoires (*)', 'warning');
        return;
      }
      this.data.locataires.push({
        nom: f.nom.trim(),
        email: f.email.trim(),
        adresse: f.adresse.trim(),
        loyer: parseFloat(f.loyer),
        charges: parseFloat(f.charges) || 0,
        modeReglement: f.modeReglement || '',
        referenceBail: (f.referenceBail || '').trim(),
      });
      this.persist();
      this.dirty = true;
      this.addForm = emptyLocataireForm();
      toast('Locataire ajouté avec succès', 'success');
    },

    openEdit(index) {
      const loc = this.data.locataires[index];
      this.editing = {
        open: true,
        index,
        form: {
          nom: loc.nom,
          email: loc.email || '',
          adresse: loc.adresse,
          loyer: loc.loyer,
          charges: loc.charges,
          modeReglement: loc.modeReglement || '',
          referenceBail: loc.referenceBail || '',
        },
        previousActive: document.activeElement,
      };
      this.$nextTick(() => {
        const input = document.getElementById('edit-nom');
        if (input) input.focus();
      });
    },

    closeEdit() {
      const prev = this.editing.previousActive;
      this.editing.open = false;
      this.$nextTick(() => {
        if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
          prev.focus();
        }
      });
    },

    saveEdit() {
      const f = this.editing.form;
      if (!f.nom.trim() || !f.adresse.trim() || f.loyer === '' || f.loyer === null) {
        toast('Veuillez remplir tous les champs obligatoires', 'warning');
        return;
      }
      this.data.locataires[this.editing.index] = {
        nom: f.nom.trim(),
        email: f.email.trim(),
        adresse: f.adresse.trim(),
        loyer: parseFloat(f.loyer),
        charges: parseFloat(f.charges) || 0,
        modeReglement: f.modeReglement || '',
        referenceBail: (f.referenceBail || '').trim(),
      };
      this.persist();
      this.dirty = true;
      this.closeEdit();
      toast('Locataire modifié', 'success');
    },

    async deleteLocataire(index) {
      const loc = this.data.locataires[index];
      const ok = await confirmDialog({
        title: 'Supprimer le locataire',
        message: `Êtes-vous sûr de vouloir supprimer ${loc.nom} ?`,
        confirmLabel: 'Supprimer',
        danger: true,
      });
      if (!ok) return;
      this.data.locataires.splice(index, 1);
      // Le splice décale les indices suivants : on ajuste ou on remet à zéro la sélection.
      const selected = this.selectedLocataireIdx === '' ? -1 : Number(this.selectedLocataireIdx);
      if (selected === index) {
        this.selectedLocataireIdx = '';
      } else if (selected > index) {
        this.selectedLocataireIdx = String(selected - 1);
      }
      this.persist();
      this.dirty = true;
      toast('Locataire supprimé', 'success');
    },

    saveConfig() {
      const b = this.data.bailleur;
      b.nom = (b.nom || '').trim();
      b.adresse = (b.adresse || '').trim();
      b.ville = (b.ville || '').trim();
      b.signature = (b.signature || '').trim();
      b.email = (b.email || '').trim();
      b.telephone = (b.telephone || '').trim();
      if (!b.nom || !b.adresse || !b.ville || !b.signature) {
        toast('Veuillez remplir tous les champs obligatoires (*)', 'warning');
        return;
      }
      this.persist();
      this.dirty = true;
      toast('Configuration enregistrée', 'success');
    },

    persist() {
      if (!saveData(this.data)) {
        toast('Erreur de sauvegarde locale', 'error');
      }
    },

    validateForGenerate() {
      if (this.selectedLocataireIdx === '' || !this.moisNum || !this.annee) {
        toast('Sélectionnez un locataire, un mois et une année', 'warning');
        return false;
      }
      const b = this.data.bailleur;
      if (!b.nom || !b.adresse || !b.ville || !b.signature) {
        toast('Complétez la configuration du bailleur d\'abord', 'warning');
        this.switchTab('config');
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
      const loc = this.selectedLocataire;
      let loyer = loc.loyer;
      let charges = loc.charges;
      if (this.overrideMontants) {
        loyer = parseFloat(this.loyerOverride) || loyer;
        charges = parseFloat(this.chargesOverride) || charges;
      }
      const numero = nextNumeroQuittance(this.data.historique, this.moisNum, this.annee);
      const { doc, filename, fontFallback } = await buildPDF({
        bailleur: this.data.bailleur,
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
      });
      this.notifyFontFallbackOnce(fontFallback);
      return { doc, filename, loyer, charges, numeroQuittance: numero };
    },

    async confirmDoublonIfAny() {
      const loc = this.selectedLocataire;
      const doublons = findDoublons(this.data.historique, loc.nom, this.moisNum, this.annee);
      if (doublons.length === 0) return true;
      const dernier = doublons.reduce((acc, h) => (h.dateGeneration > acc.dateGeneration ? h : acc));
      const dateTxt = new Date(dernier.dateGeneration).toLocaleDateString('fr-FR');
      const label = moisTexte(this.moisNum, this.annee);
      return await confirmDialog({
        title: 'Quittance déjà émise',
        message: `Une quittance pour ${loc.nom} – ${label} a déjà été générée le ${dateTxt}. Voulez-vous en générer une nouvelle ?`,
        confirmLabel: 'Regénérer',
      });
    },

    pushHistorique({ loyer, charges, numeroQuittance }) {
      this.data.historique.push(
        buildHistoriqueEntry({
          bailleur: this.data.bailleur,
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
        }),
      );
      this.persist();
      this.dirty = true;
    },

    async generatePDF() {
      if (!this.validateForGenerate()) return;
      if (!(await this.confirmDoublonIfAny())) return;
      const { doc, filename, loyer, charges, numeroQuittance } = await this.buildAndReturn();
      // On enregistre l'historique AVANT le téléchargement : si le save échoue (rare : quotas
      // navigateur, blocage de download), au moins la trace existe et l'anti-doublon fonctionnera
      // au prochain essai.
      this.pushHistorique({ loyer, charges, numeroQuittance });
      doc.save(filename);
      toast('Quittance téléchargée', 'success');
    },

    async generateAndEmail() {
      if (!this.validateForGenerate()) return;
      if (!(await this.confirmDoublonIfAny())) return;
      const { doc, filename, loyer, charges, numeroQuittance } = await this.buildAndReturn();
      this.pushHistorique({ loyer, charges, numeroQuittance });

      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      const loc = this.selectedLocataire;
      const dest = (this.emailLocataire || loc.email || '').trim();
      const label = moisTexte(this.moisNum, this.annee);
      const sujet = `Quittance de loyer - ${label}`;
      const corps = `Bonjour,\n\nVeuillez trouver ci-joint la quittance de loyer pour le mois de ${label}.\n\nCordialement,\n${this.data.bailleur.signature}`;
      const mailto = `mailto:${dest}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
      window.location.href = mailto;
      toast('PDF téléchargé. Pensez à l\'attacher à l\'email.', 'info', 6000);
    },

    // ----- Historique -----

    get filteredHistorique() {
      return filterAndSort(this.data.historique, {
        locataireNom: this.filterLocataire,
        annee: this.filterAnnee,
      });
    },

    get historiqueLocataires() {
      return listeFiltreLocataires(this.data.historique);
    },

    get historiqueAnnees() {
      return listeFiltreAnnees(this.data.historique);
    },

    resetFiltresHistorique() {
      this.filterLocataire = '';
      this.filterAnnee = '';
    },

    async regenererPDF(entry) {
      try {
        const { doc, filename, fontFallback } = await buildPDF({
          bailleur: entry.bailleur,
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
        });
        this.notifyFontFallbackOnce(fontFallback);
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
        toast('Format de données non reconnu', 'error');
        return;
      }
      const ok = await confirmDialog({
        title: 'Confirmer l\'import',
        message: `Cela remplacera vos données actuelles (${this.data.locataires.length} locataire(s)) par ${parsed.locataires.length} locataire(s) importé(s). Continuer ?`,
        confirmLabel: 'Importer',
      });
      if (!ok) return;
      this.data = parsed;
      this.persist();
      this.dirty = false;
      this.selectedLocataireIdx = '';
      this.resetFiltresHistorique();
      toast('Données importées', 'success');
    },
  };
}

function emptyLocataireForm() {
  return {
    nom: '',
    email: '',
    adresse: '',
    loyer: '',
    charges: 0,
    modeReglement: '',
    referenceBail: '',
  };
}
