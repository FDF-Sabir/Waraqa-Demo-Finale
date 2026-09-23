import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";
@Entity("workspace_records")
export class WorkspaceRecord {
  @PrimaryColumn() id!: string;
  @Column() kind!: string;
  @Column("simple-json") data!: any;
  @UpdateDateColumn() updatedAt!: Date;
}
