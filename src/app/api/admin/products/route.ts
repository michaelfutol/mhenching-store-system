import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const products = await prisma.product.findMany();
    return NextResponse.json({ products });
  } catch (error) {
    console.error('Error fetching admin products:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { product_id, price, unit_cost, current_stock_quantity } = body;

        if (!product_id) return NextResponse.json({error: "product_id required"}, {status: 400});

        const product = await prisma.product.update({
            where: { product_id },
            data: {
                price: price !== undefined ? Number(price) : undefined,
                unit_cost: unit_cost !== undefined ? Number(unit_cost) : undefined,
                current_stock_quantity: current_stock_quantity !== undefined ? Number(current_stock_quantity) : undefined,
            }
        });

        return NextResponse.json({ product });
    } catch(error) {
        console.error('Error updating product:', error);
        return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
    }
}
