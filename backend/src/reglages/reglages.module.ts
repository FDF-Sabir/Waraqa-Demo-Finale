import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReglageEntity } from './reglage.entity';
import { ReglagesService } from './reglages.service';
import { ReglagesController } from './reglages.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReglageEntity])],
  controllers: [ReglagesController],
  providers: [ReglagesService],
  exports: [ReglagesService],
})
export class ReglagesModule {}
