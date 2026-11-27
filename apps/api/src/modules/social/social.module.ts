import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Prisma } from "@prisma/client";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUrl, Length, Matches, MaxLength } from "class-validator";
import { PrismaService } from "../../shared/prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { GarageModule } from "../garage/garage.module";
import { GarageService } from "../garage/garage.service";
import { RoutesController, RoutesService } from "./routes";

class CreatePostDto {
  @IsString() @Length(1, 2000) body!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsUrl({ protocols: ["https"], require_protocol: true }, { each: true }) mediaUrls?: string[];
  @IsOptional() @IsString() @MaxLength(40) clubId?: string;
  @IsOptional() @IsIn(["public", "followers", "club"]) visibility?: "public" | "followers" | "club";
}

class CommentDto {
  @IsString() @Length(1, 1000) body!: string;
}

class CreateClubDto {
  @IsString() @Length(3, 80) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{2}$/) countryCode?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

class ReportContentDto {
  @IsIn(["post", "comment", "user", "meetup", "road_report", "club"]) subjectType!: string;
  @IsString() @MaxLength(60) subjectId!: string;
  @IsString() @Length(3, 500) reason!: string;
}

class FeedQuery {
  @IsOptional() @IsIn(["all", "following"]) scope?: "all" | "following";
  @IsOptional() @IsString() @MaxLength(40) clubId?: string;
  @IsOptional() @IsString() @MaxLength(40) cursor?: string;
}

const AUTHOR = { select: { id: true, displayName: true, handle: true, avatarUrl: true } } as const;

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly garage: GarageService
  ) {}

  async feed(user: AuthenticatedUser, q: FeedQuery) {
    const take = 20;
    let where: Prisma.PostWhereInput;
    if (q.clubId) {
      const club = await this.prisma.club.findUnique({ where: { id: q.clubId }, select: { isPublic: true } });
      if (!club) throw new NotFoundException("Club not found");
      const member = await this.prisma.clubMember.count({ where: { clubId: q.clubId, userId: user.id } });
      if (!club.isPublic && !member) throw new ForbiddenException("Join this club to see its posts");
      where = { clubId: q.clubId, isHidden: false };
    } else {
      const following = await this.prisma.follow.findMany({ where: { followerId: user.id }, select: { followingId: true } });
      const followingIds = following.map((f) => f.followingId);
      where =
        q.scope === "following"
          ? { isHidden: false, authorId: { in: [...followingIds, user.id] }, visibility: { in: ["public", "followers"] } }
          : {
              isHidden: false,
              OR: [{ visibility: "public", clubId: null }, { authorId: user.id }, { visibility: "followers", authorId: { in: followingIds } }]
            };
    }
    const posts = await this.prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { author: AUTHOR, club: { select: { id: true, name: true, slug: true } }, likes: { where: { userId: user.id }, select: { id: true } } }
    });
    const page = posts.slice(0, take);
    return {
      items: page.map(({ likes, ...p }) => ({ ...p, likedByMe: likes.length > 0 })),
      nextCursor: posts.length > take ? page[page.length - 1]!.id : null
    };
  }

  async createPost(user: AuthenticatedUser, dto: CreatePostDto) {
    if (dto.clubId) {
      const member = await this.prisma.clubMember.count({ where: { clubId: dto.clubId, userId: user.id } });
      if (!member) throw new ForbiddenException("Join the club to post in it");
    }
    return this.prisma.post.create({
      data: { authorId: user.id, body: dto.body.trim(), mediaUrls: dto.mediaUrls ?? [], clubId: dto.clubId, visibility: dto.clubId ? "club" : (dto.visibility ?? "public") },
      include: { author: AUTHOR }
    });
  }

  async deletePost(user: AuthenticatedUser, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException("Post not found");
    if (post.authorId !== user.id && user.role === "user") throw new ForbiddenException("Not your post");
    await this.prisma.post.delete({ where: { id: postId } });
    return { ok: true };
  }

  async toggleLike(user: AuthenticatedUser, postId: string) {
    const existing = await this.prisma.postLike.findUnique({ where: { postId_userId: { postId, userId: user.id } } });
    if (existing) {
      await this.prisma.$transaction([this.prisma.postLike.delete({ where: { id: existing.id } }), this.prisma.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } })]);
      return { liked: false };
    }
    const post = await this.prisma.post.count({ where: { id: postId, isHidden: false } });
    if (!post) throw new NotFoundException("Post not found");
    await this.prisma.$transaction([this.prisma.postLike.create({ data: { postId, userId: user.id } }), this.prisma.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } })]);
    return { liked: true };
  }

  comments(postId: string) {
    return this.prisma.postComment.findMany({ where: { postId, isHidden: false }, orderBy: { createdAt: "asc" }, take: 200, include: { author: AUTHOR } });
  }

  async comment(user: AuthenticatedUser, postId: string, dto: CommentDto) {
    const post = await this.prisma.post.count({ where: { id: postId, isHidden: false } });
    if (!post) throw new NotFoundException("Post not found");
    const [comment] = await this.prisma.$transaction([
      this.prisma.postComment.create({ data: { postId, authorId: user.id, body: dto.body.trim() }, include: { author: AUTHOR } }),
      this.prisma.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } })
    ]);
    return comment;
  }

  async toggleFollow(user: AuthenticatedUser, targetId: string) {
    if (targetId === user.id) throw new BadRequestException("You cannot follow yourself");
    const existing = await this.prisma.follow.findUnique({ where: { followerId_followingId: { followerId: user.id, followingId: targetId } } });
    if (existing) {
      await this.prisma.follow.delete({ where: { id: existing.id } });
      return { following: false };
    }
    const target = await this.prisma.user.count({ where: { id: targetId, isSuspended: false } });
    if (!target) throw new NotFoundException("User not found");
    await this.prisma.follow.create({ data: { followerId: user.id, followingId: targetId } });
    return { following: true };
  }

  async profile(viewer: AuthenticatedUser, handleOrId: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ handle: handleOrId.toLowerCase() }, { id: handleOrId }], isSuspended: false },
      select: { id: true, displayName: true, handle: true, avatarUrl: true, bio: true, homeCity: true, countryCode: true, createdAt: true }
    });
    if (!user) throw new NotFoundException("Profile not found");
    const [followers, following, convoys, iFollow, showcase, posts] = await Promise.all([
      this.prisma.follow.count({ where: { followingId: user.id } }),
      this.prisma.follow.count({ where: { followerId: user.id } }),
      this.prisma.convoyMember.count({ where: { userId: user.id, convoy: { status: "completed" } } }),
      this.prisma.follow.count({ where: { followerId: viewer.id, followingId: user.id } }),
      this.garage.showcase(user.id),
      this.prisma.post.findMany({ where: { authorId: user.id, isHidden: false, visibility: "public" }, orderBy: { createdAt: "desc" }, take: 10 })
    ]);
    return { ...user, stats: { followers, following, completedConvoys: convoys }, followedByMe: iFollow > 0, showcase, posts };
  }

  clubs(q?: string) {
    return this.prisma.club.findMany({
      where: { isPublic: true, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { _count: { select: { members: true } } }
    });
  }

  myClubs(userId: string) {
    return this.prisma.clubMember.findMany({ where: { userId }, include: { club: { include: { _count: { select: { members: true } } } } } });
  }

  async createClub(user: AuthenticatedUser, dto: CreateClubDto) {
    const base = slugify(dto.name) || "club";
    let slug = base;
    for (let i = 2; await this.prisma.club.count({ where: { slug } }); i++) slug = `${base}-${i}`;
    return this.prisma.club.create({
      data: { ...dto, countryCode: dto.countryCode?.toUpperCase(), slug, ownerId: user.id, isPublic: dto.isPublic ?? true, members: { create: { userId: user.id, role: "owner" } } }
    });
  }

  async club(user: AuthenticatedUser, slug: string) {
    const club = await this.prisma.club.findUnique({
      where: { slug },
      include: { owner: AUTHOR, _count: { select: { members: true, posts: true } }, meetups: { where: { status: "published", startsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" }, take: 5 } }
    });
    if (!club) throw new NotFoundException("Club not found");
    const membership = await this.prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: user.id } } });
    if (!club.isPublic && !membership) return { id: club.id, name: club.name, slug: club.slug, isPublic: false, isMember: false, _count: club._count };
    return { ...club, isMember: Boolean(membership), myRole: membership?.role ?? null };
  }

  async joinClub(user: AuthenticatedUser, clubId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException("Club not found");
    if (!club.isPublic) throw new ForbiddenException("This club is invite-only");
    try {
      await this.prisma.clubMember.create({ data: { clubId, userId: user.id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConflictException("Already a member");
      throw err;
    }
    return { ok: true };
  }

  async leaveClub(user: AuthenticatedUser, clubId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { ownerId: true } });
    if (club?.ownerId === user.id) throw new BadRequestException("Owners cannot leave their club");
    await this.prisma.clubMember.deleteMany({ where: { clubId, userId: user.id } });
    return { ok: true };
  }

  report(user: AuthenticatedUser, dto: ReportContentDto) {
    return this.prisma.report.create({ data: { reporterId: user.id, subjectType: dto.subjectType, subjectId: dto.subjectId, reason: dto.reason } });
  }
}

@ApiTags("social")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("social")
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get("feed")
  feed(@CurrentUser() user: AuthenticatedUser, @Query() q: FeedQuery) {
    return this.social.feed(user, q);
  }

  @Post("posts")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createPost(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePostDto) {
    return this.social.createPost(user, dto);
  }

  @Delete("posts/:id")
  deletePost(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.social.deletePost(user, id);
  }

  @Post("posts/:id/like")
  like(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.social.toggleLike(user, id);
  }

  @Get("posts/:id/comments")
  comments(@Param("id") id: string) {
    return this.social.comments(id);
  }

  @Post("posts/:id/comments")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  comment(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CommentDto) {
    return this.social.comment(user, id, dto);
  }

  @Post("users/:id/follow")
  follow(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.social.toggleFollow(user, id);
  }

  @Get("profiles/:handle")
  profile(@CurrentUser() user: AuthenticatedUser, @Param("handle") handle: string) {
    return this.social.profile(user, handle);
  }

  @Get("clubs")
  clubs(@Query("q") q?: string) {
    return this.social.clubs(q?.slice(0, 60));
  }

  @Get("clubs/mine")
  myClubs(@CurrentUser() user: AuthenticatedUser) {
    return this.social.myClubs(user.id);
  }

  @Post("clubs")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  createClub(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateClubDto) {
    return this.social.createClub(user, dto);
  }

  @Get("clubs/:slug")
  club(@CurrentUser() user: AuthenticatedUser, @Param("slug") slug: string) {
    return this.social.club(user, slug);
  }

  @Post("clubs/:id/join")
  joinClub(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.social.joinClub(user, id);
  }

  @Delete("clubs/:id/membership")
  leaveClub(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.social.leaveClub(user, id);
  }

  @Post("reports")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  report(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReportContentDto) {
    return this.social.report(user, dto);
  }
}

@Module({
  imports: [GarageModule],
  controllers: [RoutesController, SocialController],
  providers: [SocialService, RoutesService]
})
export class SocialModule {}
