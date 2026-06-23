import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const products = [
    { name: 'Lugaw', tier: 'Kumpleto', price: 50.00, cost: 25.00 },
    { name: 'Lugaw', tier: 'With Egg', price: 35.00, cost: 15.00 },
    { name: 'Lugaw', tier: 'Plain', price: 15.00, cost: 5.00 },
    { name: 'Lomi', tier: 'Big', price: 200.00, cost: 100.00 },
    { name: 'Lomi', tier: 'Small', price: 120.00, cost: 60.00 },
    { name: 'Nachos', tier: null, price: 99.00, cost: 40.00 },
    { name: 'Sizzling Hotdog', tier: null, price: 150.00, cost: 70.00 },
    { name: 'Fries', tier: null, price: 50.00, cost: 20.00 },
    { name: 'Cheesesticks', tier: null, price: 50.00, cost: 25.00 },
    { name: 'Lumpia Shanghai', tier: null, price: 50.00, cost: 25.00 },
    { name: 'Marlboro', tier: 'Red', price: 10.00, cost: 7.00, barcode: '1234567890123', multiplier: 20 },
  ]

  console.log('Start seeding...')
  for (const p of products) {
    const product = await prisma.product.upsert({
      where: {
        name_tier: {
          name: p.name,
          tier: p.tier || '', // Prisma sqlite composite unique where null is tricky, let's adjust schema to default tier to empty string or handle it
        }
      },
      update: {
        unit_cost: p.cost,
        barcode: p.barcode,
        pack_multiplier: p.multiplier || 1,
        current_stock_quantity: 100
      },
      create: {
        name: p.name,
        tier: p.tier || '',
        price: p.price,
        unit_cost: p.cost,
        barcode: p.barcode,
        pack_multiplier: p.multiplier || 1,
        current_stock_quantity: 100
      },
    })
    console.log(`Created product with id: ${product.product_id}`)
  }
  console.log('Seeding finished.')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
