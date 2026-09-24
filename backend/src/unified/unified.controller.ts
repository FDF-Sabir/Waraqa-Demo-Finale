import { IntegrationsService } from "./integrations.service";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UtilisateurCourant } from "../auth/utilisateur.decorator";
import { UnifiedService } from "./unified.service";
function month(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value || ""))
    throw new BadRequestException("Mois attendu : AAAA-MM.");
  return value;
}
@Controller("workspace")
export class UnifiedController {
  constructor(private service: UnifiedService, private integrations: IntegrationsService) {}
  @UseGuards(JwtAuthGuard) @Get('integrations') integrationsStatus(@UtilisateurCourant() u:any) {return this.integrations.status(u);}
  @UseGuards(JwtAuthGuard) @Post('drive/start') driveStart(@UtilisateurCourant() u:any,@Body() b:any) {return this.integrations.start(u,{readonly:b?.readonly===true});}
  @Get('drive/callback') async driveCallback(@Query('state') state:string,@Query('code') code:string,@Query('error') error:string,@Res() res:Response) {
    res.setHeader('Referrer-Policy','no-referrer');
    try {
      if (error) throw new BadRequestException(error==='access_denied'?'Autorisation Google annulée.':'Google a refusé l’autorisation.');
      const r = await this.integrations.callback(state,code);
      res.redirect('/?drive=ok#/'+r.returnTo);
    } catch (e:any) {
      const msg=String(e?.response?.message || e?.message || 'Autorisation Google impossible.').slice(0,300);
      res.redirect('/?drive=erreur&message='+encodeURIComponent(msg)+'#/reglages');
    }
  }
  @UseGuards(JwtAuthGuard) @Put('drive/credentials') driveCredentials(@UtilisateurCourant() u:any,@Body() b:any) {return this.integrations.setCredentials(u,b);}
  @UseGuards(JwtAuthGuard) @Post('drive/sync') driveSync(@UtilisateurCourant() u:any) {return this.integrations.syncNow(u);}
  @UseGuards(JwtAuthGuard) @Post('drive/disconnect') driveDisconnect(@UtilisateurCourant() u:any) {return this.integrations.disconnect(u);}
  @UseGuards(JwtAuthGuard) @Post('drive/upload') async driveUpload(@UtilisateurCourant() u:any,@Body() b:any) {await this.service.admin(u);return this.integrations.upload(u,await this.service.get(b.documentId,'document'));}
  @UseGuards(JwtAuthGuard) @Post('email/test-local') emailTest(@UtilisateurCourant() u:any) {return this.integrations.localMail(u);}
  @UseGuards(JwtAuthGuard) @Get('email/outbox') emailOutbox(@UtilisateurCourant() u:any) {return this.integrations.outbox(u);}
  @UseGuards(JwtAuthGuard) @Get('diagnostics') diagnostics(@UtilisateurCourant() u:any) {return this.service.diagnostics(u);}
  @UseGuards(JwtAuthGuard) @Get('ai') aiStatus(@UtilisateurCourant() u:any) {return this.service.aiStatus(u);}
  @UseGuards(JwtAuthGuard) @Put('ai/key') aiKey(@Body() b:any,@UtilisateurCourant() u:any) {return this.service.setAiKey(b,u);}
  @UseGuards(JwtAuthGuard) @Delete('ai/key') aiKeyDelete(@UtilisateurCourant() u:any) {return this.service.deleteAiKey(u);}
  @UseGuards(JwtAuthGuard) @Post('ai/test') aiTest(@UtilisateurCourant() u:any) {return this.service.testAi(u);}
  @UseGuards(JwtAuthGuard) @Get('conversations/:id/progress') chatProgress(@Param('id') id:string,@UtilisateurCourant() u:any) {return this.service.chatProgressFor(id,u);}
  @UseGuards(JwtAuthGuard) @Get('readiness') readiness() {return this.service.readiness();}
  @UseGuards(JwtAuthGuard) @Get('missions') missions(@UtilisateurCourant() u:any,@Query('limit') limit?:string,@Query('conversationId') conversationId?:string) {return this.service.missions(u.sub,Number(limit||10),conversationId||undefined);}
  @Get("status") status() {
    return this.service.status();
  }
  @UseGuards(JwtAuthGuard) @Get("settings") settings() {
    return this.service.settings();
  }
  @UseGuards(JwtAuthGuard) @Put("settings") update(
    @Body() b: any,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.updateSettings(b, u);
  }
  @UseGuards(JwtAuthGuard) @Get('invoices') searchInvoices(@Query() q:any) {return this.service.searchInvoices(month(q.month),q.search || '',q.filter || 'all',Number(q.page || 1),Number(q.size || 15),q.sort || 'recent');}
  @UseGuards(JwtAuthGuard) @Get("precontrole") precontrole(@Query("month") m: string) { return this.service.precontrole(month(m)); }
  @UseGuards(JwtAuthGuard) @Get("plan-travail") planTravail(@Query("month") m: string) { return this.service.planTravail(month(m)); }
  @UseGuards(JwtAuthGuard) @Get("summary") summary(@Query("month") m: string) {
    return this.service.summary(month(m));
  }
  @UseGuards(JwtAuthGuard) @Get("backup") async backup(@UtilisateurCourant() u: any, @Res() res: Response) {
    const buffer = await this.service.backup(u);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', 'attachment; filename="Waraqa-sauvegarde.waraqa.gz"');
    res.send(buffer);
  }
  @UseGuards(JwtAuthGuard) @Get("archives") archives() { return this.service.archives(); }
  @UseGuards(JwtAuthGuard) @Get("archives/pdf") async archivesPdf(@Res() res: Response) {
    const buffer = await this.service.archivesPdf();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Waraqa-archives.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }
  @UseGuards(JwtAuthGuard) @Post("invoices/:id/restore") restore(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() u: any) { return this.service.restoreInvoice(id, u); }
  @UseGuards(JwtAuthGuard) @Post("seed") seed(
    @Body() b: any,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.seed(month(b.month), u);
  }
  @UseGuards(JwtAuthGuard) @Post("invoices/:id/archive") archive(
    @Param("id", ParseIntPipe) id: number,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.archive(id, u);
  }
  @UseGuards(JwtAuthGuard) @Get("invoices/:id/doublon") duplicateGroup(@Param("id", ParseIntPipe) id: number) { return this.service.duplicateGroup(id); }
  @UseGuards(JwtAuthGuard) @Post("invoices/:id/doublon/lever") leverDoublon(@Param("id", ParseIntPipe) id: number, @Body() b: any, @UtilisateurCourant() u: any) { return this.service.leverDoublon(id, b?.motif, u); }
  @UseGuards(JwtAuthGuard) @Post("invoices/:id/document") link(
    @Param("id", ParseIntPipe) id: number,
    @Body() b: any,
  ) {
    return this.service.linkDocument(id, b.documentId);
  }
  @UseGuards(JwtAuthGuard) @Post("designations") designation(
    @Body() b: any,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.designation(b, u);
  }
  @UseGuards(JwtAuthGuard) @Get("documents") documents() {
    return this.service.list("document");
  }
  @UseGuards(JwtAuthGuard)
  @Post("documents")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  upload(@UploadedFile() f: Express.Multer.File, @UtilisateurCourant() u: any, @Query("preview") preview?: string, @Query("reuse") reuse?: string, @Query("role") role?: string, @Query("staging") staging?: string) {
    return this.service.upload(f, u, preview === "true", reuse === "true", role, staging === "true");
  }
  @UseGuards(JwtAuthGuard) @Post("documents/:id/comptabiliser") comptabiliser(@Param('id') id: string, @UtilisateurCourant() u: any) { return this.service.comptabiliserPiece(id, u); }
  @UseGuards(JwtAuthGuard) @Get("consignes") consignes() { return this.service.consignes(); }
  @UseGuards(JwtAuthGuard) @Post("consignes") memoriser(@Body() b: any, @UtilisateurCourant() u: any) { return this.service.memoriserConsigne(b || {}, u); }
  @UseGuards(JwtAuthGuard) @Delete("consignes/:id") oublier(@Param('id') id: string, @UtilisateurCourant() u: any) { return this.service.oublierConsigne(id, u); }
  @UseGuards(JwtAuthGuard) @Get("documents/roles") documentRoles() { return this.service.documentRoles(); }
  @UseGuards(JwtAuthGuard) @Post("documents/:id/role") setRole(@Param('id') id: string, @Body() b: any, @UtilisateurCourant() u: any) { return this.service.setDocumentRole(id, b?.role, u); }
  @UseGuards(JwtAuthGuard) @Get("capacites") capacites(@UtilisateurCourant() u: any) { return this.service.capabilities(u); }
  @UseGuards(JwtAuthGuard) @Get("documents/:id/preview") preview(@Param('id') id: string) { return this.service.importPreview(id); }
  @UseGuards(JwtAuthGuard) @Put("documents/:id/mapping") mapping(@Param('id') id: string, @Body() b: any) { return this.service.importPreview(id, b.mapping); }
  @UseGuards(JwtAuthGuard) @Post("documents/:id/commit") commit(@Param('id') id: string, @UtilisateurCourant() u: any) { return this.service.resumeImport(id, u); }
  @UseGuards(JwtAuthGuard) @Post("documents/:id/cancel") cancelImport(@Param('id') id: string) { return this.service.cancelImport(id); }
  @UseGuards(JwtAuthGuard) @Post("documents/:id/retry") retry(
    @Param("id") id: string,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.retryExtraction(id, u);
  }
  @UseGuards(JwtAuthGuard) @Get("documents/:id/file") async file(
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const f = await this.service.documentFile(id);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    );
    res.send(f.buffer);
  }
  @UseGuards(JwtAuthGuard) @Get("templates") templates() {
    return this.service.list("template");
  }
  @UseGuards(JwtAuthGuard) @Post("templates") template(@Body() b: any) {
    return this.service.template(b);
  }
  @UseGuards(JwtAuthGuard) @Put("templates/:id") editTemplate(
    @Body() b: any,
    @Param("id") id: string,
  ) {
    return this.service.template(b, id);
  }
  @UseGuards(JwtAuthGuard) @Delete("templates/:id") deleteTemplate(
    @Param("id") id: string,
  ) {
    return this.service.deleteTemplate(id);
  }
  @UseGuards(JwtAuthGuard) @Get("users") users(@UtilisateurCourant() u: any) {
    return this.service.listUsers(u);
  }
  @UseGuards(JwtAuthGuard) @Post("users") user(
    @Body() b: any,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.createUser(b, u);
  }
  @UseGuards(JwtAuthGuard) @Delete("users/:id") deleteUser(
    @Param("id", ParseIntPipe) id: number,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.deleteUser(id, u);
  }
  @UseGuards(JwtAuthGuard) @Post("password") password(
    @Body() b: any,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.password(b, u);
  }
  @UseGuards(JwtAuthGuard) @Get("allocations") allocations() { return this.service.allocations(); }
  @UseGuards(JwtAuthGuard) @Post("allocations/:id/cancel") cancelAllocation(@Param('id') id: string, @Body() b: any, @UtilisateurCourant() u: any) { return this.service.cancelAllocation(id, b.reason, u); }
  @UseGuards(JwtAuthGuard) @Get("reconciliation") candidates(
    @Query("month") m: string,
  ) {
    return this.service.reconcileCandidates(month(m));
  }
  @UseGuards(JwtAuthGuard) @Post("reconciliation") reconcile(
    @Body() b: any,
    @UtilisateurCourant() u: any,
  ) {
    if (!Number.isInteger(b.paymentId) || !Number.isInteger(b.invoiceId))
      throw new BadRequestException("Identifiants requis.");
    return this.service.reconcile(b.paymentId, b.invoiceId, u, b.amount);
  }
  @UseGuards(JwtAuthGuard) @Get("snapshots") snapshots() {
    return this.service.list("snapshot");
  }
  @UseGuards(JwtAuthGuard) @Get("snapshots/:id/pdf") async snapshotPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.service.snapshotPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Waraqa-snapshot.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }
  @UseGuards(JwtAuthGuard) @Post("snapshots") snapshot(
    @Body() b: any,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.snapshot(month(b.month), u);
  }
  @UseGuards(JwtAuthGuard) @Get("imports") lots() { return this.service.lots(); }
  @UseGuards(JwtAuthGuard) @Get("imports/:id") lot(@Param("id") id: string) { return this.service.get(id, "import_lot"); }
  @UseGuards(JwtAuthGuard) @Post("imports/:id/reprendre") resumeLot(@Param("id") id: string, @UtilisateurCourant() u: any) { return this.service.resumeLot(id, u); }
  @UseGuards(JwtAuthGuard) @Post("imports/drive") importDrive(@Body() b: any, @UtilisateurCourant() u: any) { return this.service.importDriveFolder(b?.url, u, b?.role); }
  @UseGuards(JwtAuthGuard)
  @Post("imports/zip")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 300 * 1024 * 1024 } }))
  importZip(@UploadedFile() f: Express.Multer.File, @UtilisateurCourant() u: any, @Query("role") role?: string, @Query("dryRun") dryRun?: string) { return dryRun === "true" ? this.service.manifestZip(f) : this.service.importZip(f, u, role); }
  @UseGuards(JwtAuthGuard) @Get("livrables/:id") async livrable(@Param("id") id: string, @UtilisateurCourant() u: any, @Res() res: Response) {
    const f = await this.service.livrable(id, u);
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.send(f.buffer);
  }
  @UseGuards(JwtAuthGuard) @Post("tableau") async tableau(@Body() b: any, @UtilisateurCourant() u: any, @Res() res: Response) {
    const f = await this.service.customTable(b || {}, u);
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.send(f.buffer);
  }
  @UseGuards(JwtAuthGuard) @Get("releve") releve(@Query("month") m: string, @Query("scope") scope: string, @Query("examples") examples: string) {
    return this.service.releve(month(m), scope, examples === "true");
  }
  @UseGuards(JwtAuthGuard) @Get("releve/export") async releveExport(
    @Query("month") m: string,
    @Query("format") format: string,
    @Query("scope") scope: string,
    @Query("examples") examples: string,
    @UtilisateurCourant() u: any,
    @Res() res: Response,
  ) {
    const f = await this.service.releveExport(month(m), format, scope, u, examples === "true");
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${f.name}"`);
    res.send(f.buffer);
  }
  @UseGuards(JwtAuthGuard) @Post("releve/attach") releveAttach(@Body() b: any, @UtilisateurCourant() u: any) { return this.service.releveAttach(b?.ids, month(b?.month), u); }
  @UseGuards(JwtAuthGuard) @Post("releve/detach/:id") releveDetach(@Param("id") id: string, @UtilisateurCourant() u: any) { return this.service.releveDetach(Number(id), u); }
  @UseGuards(JwtAuthGuard) @Post("releve/close") releveClose(@Body() b: any, @UtilisateurCourant() u: any) { return this.service.releveClose(month(b?.month), u); }
  @UseGuards(JwtAuthGuard) @Post("releve/reopen") releveReopen(@Body() b: any, @UtilisateurCourant() u: any) { return this.service.releveReopen(month(b?.month), u, b?.motif); }
  @UseGuards(JwtAuthGuard) @Get("releve/versions") releveVersions(@Query("month") m: string) { return this.service.releveVersions(month(m)); }
  @UseGuards(JwtAuthGuard) @Get("releve/versions/:id") releveVersion(@Param("id") id: string) { return this.service.get(id, "releve_version"); }
  @UseGuards(JwtAuthGuard) @Get("export") async export(
    @Query("month") m: string,
    @Query("format") format: string,
    @Query("scope") scope: string,
    @Query("examples") examples: string,
    @UtilisateurCourant() u: any,
    @Res() res: Response,
  ) {
    const f = await this.service.export(month(m), format, scope, u, examples === "true");
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${f.name}"`);
    res.send(f.buffer);
  }
  @UseGuards(JwtAuthGuard) @Get("conversations") conversations(
    @UtilisateurCourant() u: any,
    @Query("month") m?: string,
  ) {
    return this.service.conversations(u, m ? month(m) : undefined);
  }
  @UseGuards(JwtAuthGuard) @Post("conversations") newConversation(
    @Body() b: any,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.newConversation(month(b.month), u);
  }
  @UseGuards(JwtAuthGuard) @Get("conversations/:id") conversation(
    @Param("id") id: string,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.conversation(id, u);
  }
  @UseGuards(JwtAuthGuard) @Patch("conversations/:id") renameConversation(
    @Param("id") id: string,
    @Body() b: any,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.renameConversation(id, b.title, u);
  }
  @UseGuards(JwtAuthGuard) @Delete("conversations/:id") deleteConversation(
    @Param("id") id: string,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.deleteConversation(id, u);
  }
  @UseGuards(JwtAuthGuard) @Post("conversations/:id/cancel") cancel(@Param('id') id: string, @UtilisateurCourant() u: any) { return this.service.cancelChat(id, u); }
  @UseGuards(JwtAuthGuard) @Post("conversations/:id/messages") chat(
    @Param("id") id: string,
    @Body() b: any,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.chat(id, b, u);
  }
}
