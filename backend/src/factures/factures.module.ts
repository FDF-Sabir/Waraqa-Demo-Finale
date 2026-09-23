import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FactureEntity } from './facture.entity';
import { FacturesService } from './factures.service';
import { FacturesController } from './factures.controller';
import { JournalModule } from '../journal/journal.module';
import { DesignationsModule } from '../designations/designations.module';

@Module({
  imports: [TypeOrmModule.forFeature([FactureEntity]), JournalModule, DesignationsModule],
  controllers: [FacturesController],
  providers: [FacturesService],
  exports: [FacturesService],
})
export class FacturesModule {}
