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
  constructor(private service: UnifiedService) {}
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
  @UseGuards(JwtAuthGuard) @Get("summary") summary(@Query("month") m: string) {
    return this.service.summary(month(m));
  }
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
  upload(@UploadedFile() f: Express.Multer.File, @UtilisateurCourant() u: any) {
    return this.service.upload(f, u);
  }
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
    return this.service.reconcile(b.paymentId, b.invoiceId, u);
  }
  @UseGuards(JwtAuthGuard) @Get("snapshots") snapshots() {
    return this.service.list("snapshot");
  }
  @UseGuards(JwtAuthGuard) @Post("snapshots") snapshot(
    @Body() b: any,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.snapshot(month(b.month), u);
  }
  @UseGuards(JwtAuthGuard) @Get("export") async export(
    @Query("month") m: string,
    @Query("format") format: string,
    @Query("scope") scope: string,
    @UtilisateurCourant() u: any,
    @Res() res: Response,
  ) {
    const f = await this.service.export(month(m), format, scope, u);
    res.setHeader("Content-Type", f.mime);
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
  @UseGuards(JwtAuthGuard) @Post("conversations/:id/messages") chat(
    @Param("id") id: string,
    @Body() b: any,
    @UtilisateurCourant() u: any,
  ) {
    return this.service.chat(id, b, u);
  }
}
