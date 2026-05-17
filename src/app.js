import { loadData, saveData } from './lib/storage.js';
import { emptyData, parseImport, MODES_REGLEMENT } from './lib/schema.js';
import { buildPDF } from './lib/pdf.js';
import { defaultPeriod } from './lib/period.js';
import { moisTexte } from './lib/format.js';
import { toast, confirmDialog } from './lib/toast.js';

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

    tabsOrder: ['generate', 'locataires', 'config'],

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

    buildAndReturn() {
      const loc = this.selectedLocataire;
      let loyer = loc.loyer;
      let charges = loc.charges;
      if (this.overrideMontants) {
        loyer = parseFloat(this.loyerOverride) || loyer;
        charges = parseFloat(this.chargesOverride) || charges;
      }
      return buildPDF({
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
      });
    },

    generatePDF() {
      if (!this.validateForGenerate()) return;
      const { doc, filename } = this.buildAndReturn();
      doc.save(filename);
      toast('Quittance téléchargée', 'success');
    },

    generateAndEmail() {
      if (!this.validateForGenerate()) return;
      const { doc, filename } = this.buildAndReturn();
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
  };
}
