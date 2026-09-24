import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { WorkspaceRecord } from '../unified/record.entity';

/**
 * Verrou de période commun (plan directeur, invariant 7) : une ligne déclarée dans un relevé
 * clôturé est protégée sur TOUS les chemins de mutation (routes historiques /factures,
 * actions de l'agent, archivage, affectations, rattachements, liaison de pièce). Toute
 * modification exige la réouverture explicite de la période par un administrateur.
 */
export const closureId = (month: string) => 'releve-cloture-' + month;

export async function isClosed(manager: EntityManager, month?: string | null): Promise<boolean> {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return false;
  return Boolean(await manager.getRepository(WorkspaceRecord).findOneBy({ id: closureId(month) }));
}

/** Refuse toute action sur une ligne rattachée à une période clôturée. */
export async function assertLineOpen(manager: EntityManager, f: { id: number; fiscalMonth?: string | null }, action: string) {
  if (await isClosed(manager, f.fiscalMonth))
    throw new ConflictException(`Ligne #${f.id} déclarée dans le relevé ${f.fiscalMonth} clôturé : ${action} impossible sans réouverture de la période (Relevé de déduction → Rouvrir).`);
}

/** Refuse toute action visant une période clôturée (rattachement, création déclarée…). */
export async function assertMonthOpen(manager: EntityManager, month: string | undefined | null, action: string) {
  if (await isClosed(manager, month))
    throw new ConflictException(`Relevé ${month} clôturé : rouvrez la période avant ${action}.`);
}
