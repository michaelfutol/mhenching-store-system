import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { device_id, attendant_id, items } = body;

    if (!device_id || !attendant_id || !items || !items.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Process checkout using a transaction for atomicity
    const transaction = await prisma.$transaction(async (tx) => {
      let total_amount = 0;

      // Validate items and calculate total
      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { product_id: item.product_id },
        });

        if (!product) {
          throw new Error(`Product not found: ${item.product_id}`);
        }

        if (product.current_stock_quantity < item.quantity) {
             throw new Error(`Not enough stock for: ${product.name}`);
        }

        const subtotal = product.price * item.quantity;
        total_amount += subtotal;

        item.price_at_sale = product.price;
        item.unit_cost_at_sale = product.unit_cost || 0;
        item.subtotal = subtotal;

        // Decrement stock
        await tx.product.update({
            where: { product_id: item.product_id },
            data: { current_stock_quantity: { decrement: item.quantity } }
        });
      }

      // Create transaction record
      const createdTransaction = await tx.transaction.create({
        data: {
          device_id,
          attendant_id,
          total_amount,
          items: {
            create: items.map((item: any) => ({
              product_id: item.product_id,
              quantity: item.quantity,
              price_at_sale: item.price_at_sale,
              unit_cost_at_sale: item.unit_cost_at_sale,
              subtotal: item.subtotal,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      return createdTransaction;
    });

    return NextResponse.json({ success: true, transaction });
  } catch (error: any) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: error.message || 'Checkout failed' }, { status: 500 });
  }
}
