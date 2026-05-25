import { describe, it, expect } from 'vitest';
import { emptyLocataireForm, emptyBailleurForm, emptyBienForm } from '../lib/forms.js';

describe('emptyLocataireForm', () => {
  it('retourne un formulaire avec tous les champs vides ou 0', () => {
    const f = emptyLocataireForm();
    expect(f.nom).toBe('');
    expect(f.email).toBe('');
    expect(f.bienId).toBe('');
    expect(f.loyer).toBe('');
    expect(f.charges).toBe('');
    expect(f.modeReglement).toBe('');
    expect(f.referenceBail).toBe('');
    expect(f.coOccupants).toBe('');
    expect(f.depotGarantie).toBe(0);
  });

  it('retourne un nouvel objet à chaque appel (pas de mutation partagée)', () => {
    const a = emptyLocataireForm();
    const b = emptyLocataireForm();
    a.nom = 'Alice';
    expect(b.nom).toBe('');
  });
});

describe('emptyBailleurForm', () => {
  it('signatureActive par défaut à true (cohérent avec affichage signature par défaut)', () => {
    expect(emptyBailleurForm().signatureActive).toBe(true);
  });

  it('signatureImage et logo vides par défaut', () => {
    const f = emptyBailleurForm();
    expect(f.signatureImage).toBe('');
    expect(f.logo).toBe('');
  });
});

describe('emptyBienForm', () => {
  it("type par défaut à 'autre'", () => {
    expect(emptyBienForm().type).toBe('autre');
  });

  it('bailleurId vide par défaut (à choisir par l\'utilisateur)', () => {
    expect(emptyBienForm().bailleurId).toBe('');
  });
});
