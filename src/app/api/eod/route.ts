import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetDateParam = url.searchParams.get('date');
    let targetDate = new Date();

    if (targetDateParam) {
      targetDate = new Date(targetDateParam);
    }

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const transactions = await prisma.transaction.findMany({
      where: {
        timestamp: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    let totalRevenue = 0;
    const itemSales: Record<string, { name: string; tier: string; qty: number; subtotal: number }> = {};
    const attendantSales: Record<string, number> = {};

    transactions.forEach(tx => {
      totalRevenue += tx.total_amount;

      // Attendant sales
      if (!attendantSales[tx.attendant_id]) {
        attendantSales[tx.attendant_id] = 0;
      }
      attendantSales[tx.attendant_id] += tx.total_amount;

      // Item sales
      tx.items.forEach(item => {
        const key = item.product_id;
        if (!itemSales[key]) {
          itemSales[key] = {
            name: item.product.name,
            tier: item.product.tier,
            qty: 0,
            subtotal: 0,
          };
        }
        itemSales[key].qty += item.quantity;
        itemSales[key].subtotal += item.subtotal;
      });
    });

    const itemSalesList = Object.values(itemSales);

    return NextResponse.json({
      totalRevenue,
      totalTransactions: transactions.length,
      itemSales: itemSalesList,
      attendantSales,
    });
  } catch (error) {
    console.error('Error generating EOD report:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
