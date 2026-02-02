import { PrismaClient } from "@/lib/generated/prisma";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const prisma = new PrismaClient();
        const genres = await prisma.genres.findMany();
        return NextResponse.json(genres);
    } catch (error) {
        console.error("Error fetching genres:", error);
        return NextResponse.json({ error: "Failed to fetch genres" }, { status: 500 });
    }
}
