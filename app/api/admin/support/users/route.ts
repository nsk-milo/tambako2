import { NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const role = searchParams.get("role")?.trim() ?? "";
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? "20");
    const sortBy = searchParams.get("sortBy")?.trim() ?? "created_at";
    const sortDir = searchParams.get("sortDir")?.trim() ?? "desc";

    const safePage = Number.isNaN(page) || page < 1 ? 1 : page;
    const safePageSize = Number.isNaN(pageSize) || pageSize < 1 ? 20 : Math.min(pageSize, 100);
    const skip = (safePage - 1) * safePageSize;

    const roleRecord = role
      ? await prisma.role.findFirst({ where: { name: role as "ADMIN" | "USER" | "ContentCreator" } })
      : null;

    if (role && !roleRecord) {
      return NextResponse.json({
        data: [],
        pagination: {
          page: safePage,
          pageSize: safePageSize,
          total: 0,
          totalPages: 1,
          sortBy: sortBy,
          sortDir: sortDir,
        },
      });
    }

    const where = {
      AND: [
        search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone_number: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        roleRecord ? { roleId: roleRecord.id } : {},
      ],
    } as const;

    const sortField = ["created_at", "name", "email"].includes(sortBy)
      ? (sortBy as "created_at" | "name" | "email")
      : "created_at";
    const sortDirection = sortDir === "asc" ? "asc" : "desc";

    const [users, total, roles] = await Promise.all([
      prisma.users.findMany({
        where,
        orderBy: { [sortField]: sortDirection },
        skip,
        take: safePageSize,
      }),
      prisma.users.count({ where }),
      prisma.role.findMany({ select: { id: true, name: true } }),
    ]);

    const rolesById = new Map(roles.map((roleItem) => [roleItem.id, roleItem.name]));

    return NextResponse.json({
      data: users.map((user) => ({
        user_id: user.user_id.toString(),
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        role: rolesById.get(user.roleId ?? -1) ?? null,
        created_at: user.created_at,
      })),
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages: Math.ceil(total / safePageSize) || 1,
        sortBy: sortField,
        sortDir: sortDirection,
      },
    });
  } catch (error) {
    console.error("Admin support users error:", error);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}