import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { date } = body;
    let targetDate = new Date();

    if (date) {
      targetDate = new Date(date);
    }

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Mark transactions as closed
    const updateResult = await prisma.transaction.updateMany({
      where: {
        timestamp: {
          gte: startOfDay,
          lte: endOfDay,
        },
        closed: false,
      },
      data: {
        closed: true,
      },
    });

    return NextResponse.json({ success: true, updatedCount: updateResult.count });
  } catch (error) {
    console.error('Error closing EOD:', error);
    return NextResponse.json({ error: 'Failed to close day' }, { status: 500 });
  }
}
