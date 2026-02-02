import { NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";

const prisma = new PrismaClient();

const allowedRoles = ["USER", "ContentCreator"] as const;
type AllowedRole = (typeof allowedRoles)[number];

export async function POST(request: Request) {
  try {
    const { userId, role } = await request.json();

    if (!userId || !role) {
      return NextResponse.json({ error: "userId and role are required" }, { status: 400 });
    }

    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Allowed roles: USER, ContentCreator." },
        { status: 400 }
      );
    }

    const roleRecord = await prisma.role.findFirst({
      where: { name: role as AllowedRole },
    });

    if (!roleRecord) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const updatedUser = await prisma.users.update({
      where: { user_id: BigInt(userId) },
      data: { roleId: roleRecord.id },
      include: { role: true },
    });

    return NextResponse.json({
      message: "User role updated successfully",
      user: {
        user_id: updatedUser.user_id.toString(),
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role?.name ?? null,
      },
    });
  } catch (error) {
    console.error("Admin update role error:", error);
    return NextResponse.json({ error: "Failed to update user role" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}