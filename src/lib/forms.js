// Factories de formulaires vides pour les modales unifiées (création + édition).
// Réutilisés à l'ouverture en mode 'create' et après reset des formulaires.

export function emptyLocataireForm() {
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

export function emptyBailleurForm() {
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

export function emptyBienForm() {
  return {
    bailleurId: '',
    libelle: '',
    adresse: '',
    type: 'autre',
    reference: '',
  };
}
