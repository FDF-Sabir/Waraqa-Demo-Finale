import { Module } from '@nestjs/common';
import { SnapshotsController } from './snapshots.controller';
import { FacturesModule } from '../factures/factures.module';

@Module({
  imports: [FacturesModule],
  controllers: [SnapshotsController],
})
export class SnapshotsModule {}
