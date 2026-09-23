import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DesignationsService, DESIGNATIONS_SEED } from './designations.service';
import { DesignationEntity } from './designation.entity';
import { JournalService } from '../journal/journal.service';

describe('DesignationsService', () => {
  let service: DesignationsService;
  let repo: Repository<DesignationEntity>;
  let journal: { ecrire: jest.Mock };

  beforeEach(async () => {
    journal = { ecrire: jest.fn().mockResolvedValue(undefined) };

    const store = new Map<number, DesignationEntity>();
    let nextId = 1;

    const mockRepo = {
      findOne: jest.fn(async ({ where }: any) => {
        for (const entite of store.values()) {
          if (where.id !== undefined && entite.id === where.id) return entite;
          if (where.libelle !== undefined && entite.libelle === where.libelle) return entite;
        }
        return null;
      }),
      find: jest.fn(async ({ where }: any = {}) => {
        const toutes = Array.from(store.values());
        if (!where) return toutes;
        return toutes.filter((e) =>
          Object.entries(where).every(([k, v]) => (e as any)[k] === v),
        );
      }),
      create: jest.fn((data: Partial<DesignationEntity>) => data as DesignationEntity),
      save: jest.fn(async (entite: DesignationEntity) => {
        if (!entite.id) {
          entite.id = nextId++;
          entite.creeLe = new Date();
        }
        store.set(entite.id, entite);
        return entite;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DesignationsService,
        { provide: getRepositoryToken(DesignationEntity), useValue: mockRepo },
        { provide: JournalService, useValue: journal },
      ],
    }).compile();

    service = module.get(DesignationsService);
    repo = module.get(getRepositoryToken(DesignationEntity));
  });

  it('initialise le seed avec les 5 valeurs réelles observées', async () => {
    await service.initialiserSeed();
    const toutes = await service.lister();
    const libelles = toutes.map((d) => d.libelle);
    for (const libelle of DESIGNATIONS_SEED) {
      expect(libelles).toContain(libelle);
    }
    expect(toutes.every((d) => d.enAttenteConfirmation === false)).toBe(true);
  });

  it('ajouterDepuisIA crée une désignation en attente pour un libellé jamais vu', async () => {
    const designation = await service.ajouterDepuisIA('NOUVELLE DESIGNATION');
    expect(designation.enAttenteConfirmation).toBe(true);
    expect(designation.libelle).toBe('NOUVELLE DESIGNATION');
    expect(journal.ecrire).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'designation_suggeree_ia', notifiable: true }),
    );
  });

  it('ajouterDepuisIA est idempotent — ne duplique jamais un libellé existant', async () => {
    const premiere = await service.ajouterDepuisIA('GASOIL');
    const seconde = await service.ajouterDepuisIA('gasoil'); // casse différente, normalisé
    expect(seconde.id).toBe(premiere.id);
    const toutes = await service.lister();
    expect(toutes.filter((d) => d.libelle === 'GASOIL')).toHaveLength(1);
  });

  it('une désignation confirmée n\'est plus jamais reproposée en attente', async () => {
    const designation = await service.ajouterDepuisIA('COMMISSION EXCEPTIONNELLE');
    await service.confirmer(designation.id, 1, 'Rochdi');

    const reproposee = await service.ajouterDepuisIA('commission exceptionnelle');
    expect(reproposee.enAttenteConfirmation).toBe(false);
  });

  it('listerEnAttente ne retourne que les désignations non confirmées', async () => {
    await service.initialiserSeed();
    await service.ajouterDepuisIA('DESIGNATION INCONNUE');
    const enAttente = await service.listerEnAttente();
    expect(enAttente).toHaveLength(1);
    expect(enAttente[0].libelle).toBe('DESIGNATION INCONNUE');
  });

  it('confirmer journalise l\'action avec l\'auteur réel', async () => {
    const designation = await service.ajouterDepuisIA('AUTRE DESIGNATION');
    await service.confirmer(designation.id, 42, 'Comptable Test');
    expect(journal.ecrire).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'designation_confirmee',
        utilisateurId: 42,
        saisiPar: 'Comptable Test',
      }),
    );
  });
});
