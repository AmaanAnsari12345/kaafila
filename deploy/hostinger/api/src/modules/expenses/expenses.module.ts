import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { computeBalances, settle, splitEqually, upiPayLink, validateShares, type ExpenseInput } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { ConvoyAccessService } from "../core/convoy-access.service";
import { RealtimeBus } from "../core/realtime-bus.service";

class ShareDto {
  @IsString() @MaxLength(60) userId!: string;
  @IsInt() @Min(0) amountMinor!: number;
}

class CreateExpenseDto {
  @IsString() @Length(1, 80) title!: string;
  @IsIn(["fuel", "toll", "food", "stay", "parking", "repair", "activity", "other"]) category!: "fuel" | "toll" | "food" | "stay" | "parking" | "repair" | "activity" | "other";
  @IsInt() @Min(1) @Max(100_000_000) amountMinor!: number;
  @IsOptional() @IsString() @MaxLength(60) paidByUserId?: string;
  @IsIn(["equal", "by_car", "custom"]) splitMode!: "equal" | "by_car" | "custom";
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) participantUserIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ShareDto) shares?: ShareDto[];
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConvoyAccessService,
    private readonly bus: RealtimeBus
  ) {}

  private async members(convoyId: string) {
    return this.prisma.convoyMember.findMany({
      where: { convoyId, status: { in: ["active", "muted"] } },
      include: { user: { select: { id: true, displayName: true, upiVpa: true } } }
    });
  }

  async summary(user: AuthenticatedUser, convoyId: string) {
    await this.access.requireMember(convoyId, user);
    const [expenses, members] = await Promise.all([
      this.prisma.expense.findMany({ where: { convoyId }, orderBy: { createdAt: "desc" }, include: { shares: true, paidBy: { select: { displayName: true } } } }),
      this.members(convoyId)
    ]);

    const people = new Map(members.map((m) => [m.userId, m.user]));
    // People who left still appear in balances by name.
    const missing = [...new Set(expenses.flatMap((e) => [e.paidById, ...e.shares.map((s) => s.userId)]))].filter((id) => !people.has(id));
    if (missing.length) {
      const extra = await this.prisma.user.findMany({ where: { id: { in: missing } }, select: { id: true, displayName: true, upiVpa: true } });
      extra.forEach((u) => people.set(u.id, u));
    }

    const inputs: ExpenseInput[] = expenses.map((e) => ({ id: e.id, paidByUserId: e.paidById, amountMinor: e.amountMinor, shares: e.shares }));
    const balances = computeBalances(inputs);
    const transfers = settle(balances).map((t) => {
      const payee = people.get(t.toUserId);
      return {
        ...t,
        fromName: people.get(t.fromUserId)?.displayName ?? "Member",
        toName: payee?.displayName ?? "Member",
        upiLink: payee?.upiVpa ? upiPayLink({ vpa: payee.upiVpa, payeeName: payee.displayName, amountMinor: t.amountMinor, note: "KAAFILA trip settlement" }) : null
      };
    });

    return {
      currency: "INR",
      totalMinor: expenses.reduce((s, e) => s + e.amountMinor, 0),
      byCategory: expenses.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.category]: (acc[e.category] ?? 0) + e.amountMinor }), {}),
      expenses: expenses.map((e) => ({ id: e.id, title: e.title, category: e.category, amountMinor: e.amountMinor, splitMode: e.splitMode, paidById: e.paidById, paidByName: e.paidBy.displayName, createdAtIso: e.createdAt.toISOString(), shares: e.shares })),
      balances: [...balances].map(([userId, amountMinor]) => ({ userId, name: people.get(userId)?.displayName ?? "Member", amountMinor })),
      transfers,
      members: members.map((m) => ({ userId: m.userId, name: m.user.displayName, vehicleId: m.vehicleId, role: m.role }))
    };
  }

  async create(user: AuthenticatedUser, convoyId: string, dto: CreateExpenseDto) {
    await this.access.requireMember(convoyId, user);
    const members = await this.members(convoyId);
    const memberIds = new Set(members.map((m) => m.userId));
    const paidBy = dto.paidByUserId ?? user.id;
    if (!memberIds.has(paidBy)) throw new BadRequestException("The payer must be a convoy member");

    let shares: { userId: string; amountMinor: number }[];
    if (dto.splitMode === "custom") {
      shares = (dto.shares ?? []).filter((s) => s.amountMinor > 0);
    } else if (dto.splitMode === "by_car") {
      // One equal share per car, charged to whoever is driving it.
      const drivers = members.filter((m) => m.vehicleId && ["owner", "leader", "sweeper", "driver"].includes(m.role)).map((m) => m.userId);
      if (drivers.length === 0) throw new BadRequestException("No cars in this convoy yet");
      shares = splitEqually(dto.amountMinor, drivers);
    } else {
      const ids = dto.participantUserIds?.length ? dto.participantUserIds : [...memberIds];
      shares = splitEqually(dto.amountMinor, ids);
    }
    if (shares.some((s) => !memberIds.has(s.userId))) throw new BadRequestException("Every share must belong to a convoy member");
    const error = validateShares({ id: "new", paidByUserId: paidBy, amountMinor: dto.amountMinor, shares });
    if (error) throw new BadRequestException(error);

    const expense = await this.prisma.expense.create({
      data: { convoyId, paidById: paidBy, title: dto.title, category: dto.category, amountMinor: dto.amountMinor, splitMode: dto.splitMode, shares: { createMany: { data: shares } } }
    });
    this.bus.toConvoy(convoyId, "kitty:updated", { expenseId: expense.id, by: user.displayName });
    return expense;
  }

  async remove(user: AuthenticatedUser, convoyId: string, expenseId: string) {
    const member = await this.access.requireMember(convoyId, user);
    const expense = await this.prisma.expense.findFirst({ where: { id: expenseId, convoyId } });
    if (!expense) throw new NotFoundException("Expense not found");
    if (expense.paidById !== user.id && !["owner", "leader"].includes(member.role)) throw new ForbiddenException("Only the payer or the convoy leader can delete this");
    await this.prisma.expense.delete({ where: { id: expenseId } });
    this.bus.toConvoy(convoyId, "kitty:updated", { expenseId, deleted: true });
    return { ok: true };
  }
}

@ApiTags("kitty")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("kitty")
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get("convoys/:convoyId")
  summary(@CurrentUser() user: AuthenticatedUser, @Param("convoyId") convoyId: string) {
    return this.expenses.summary(user, convoyId);
  }

  @Post("convoys/:convoyId/expenses")
  create(@CurrentUser() user: AuthenticatedUser, @Param("convoyId") convoyId: string, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(user, convoyId, dto);
  }

  @Delete("convoys/:convoyId/expenses/:expenseId")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("convoyId") convoyId: string, @Param("expenseId") expenseId: string) {
    return this.expenses.remove(user, convoyId, expenseId);
  }
}

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService]
})
export class ExpensesModule {}
